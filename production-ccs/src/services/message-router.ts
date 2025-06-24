/**
 * Message Router for RCCS - Routes messages between devices
 * Part of TASK-007.3.1 RCCS Core Implementation
 */

import { logger } from '@/utils/logger';
import {
  CloudMessage,
  MessageRouteResult,
  CloudMessageType,
  DeviceNotFoundError,
  MessageDeliveryError,
} from '@/types/rccs';

export class MessageRouter {
  private server: any; // RCCSWebSocketServer reference

  constructor(server: any) {
    this.server = server;
  }

  /**
   * Route a message to its destination
   */
  public async routeMessage(
    fromConnectionId: string,
    message: CloudMessage
  ): Promise<MessageRouteResult> {
    try {
      logger.debug('Routing message', {
        messageId: message.id,
        type: message.type,
        fromDevice: message.fromDeviceId,
        toDevice: message.toDeviceId,
      });

      // Handle different message types
      switch (message.type) {
        case CloudMessageType.USER_MESSAGE:
        case CloudMessageType.USER_RESPONSE:
          return await this.routeUserMessage(message);

        case CloudMessageType.TASK_START:
        case CloudMessageType.TASK_PAUSE:
        case CloudMessageType.TASK_RESUME:
        case CloudMessageType.TASK_CANCEL:
        case CloudMessageType.TASK_STATUS:
          return await this.routeTaskMessage(message);

        case CloudMessageType.FILE_UPLOAD:
        case CloudMessageType.FILE_DOWNLOAD:
        case CloudMessageType.FILE_SYNC:
        case CloudMessageType.FILE_DELETE:
          return await this.routeFileMessage(message);

        case CloudMessageType.DEVICE_HANDOFF:
          return await this.routeHandoffMessage(message);

        case CloudMessageType.NOTIFICATION:
          return await this.routeNotification(message);

        default:
          return await this.routeGenericMessage(message);
      }
    } catch (error) {
      logger.error('Error routing message', {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        messageId: message.id,
        error: error instanceof Error ? error.message : 'Unknown routing error',
      };
    }
  }

  /**
   * Route user messages between devices
   */
  private async routeUserMessage(message: CloudMessage): Promise<MessageRouteResult> {
    if (message.toDeviceId) {
      // Direct message to specific device
      return await this.sendToDevice(message.toDeviceId, message);
    } else {
      // Broadcast to all user's devices
      return await this.broadcastToUserDevices(message.userId, message);
    }
  }

  /**
   * Route task control messages
   */
  private async routeTaskMessage(message: CloudMessage): Promise<MessageRouteResult> {
    // Task messages typically go to desktop/extension devices
    const targetDevices = this.server.getActiveConnections().filter((conn: any) => {
      const deviceInfo = this.server.getDeviceInfo?.(conn.deviceId);
      return deviceInfo?.type === 'desktop' || deviceInfo?.type === 'extension';
    });

    if (targetDevices.length === 0) {
      return {
        success: false,
        messageId: message.id,
        error: 'No desktop devices available for task execution',
      };
    }

    // Send to first available desktop device
    const targetDevice = targetDevices[0];
    return await this.sendToDevice(targetDevice.deviceId, message);
  }

  /**
   * Route file operation messages
   */
  private async routeFileMessage(message: CloudMessage): Promise<MessageRouteResult> {
    if (message.toDeviceId) {
      return await this.sendToDevice(message.toDeviceId, message);
    } else {
      // Route to devices that support file sync
      const targetDevices = this.server.getActiveConnections().filter((conn: any) => {
        const deviceInfo = this.server.getDeviceInfo?.(conn.deviceId);
        return deviceInfo?.capabilities?.supportsFileSync;
      });

      if (targetDevices.length === 0) {
        return {
          success: false,
          messageId: message.id,
          error: 'No devices support file operations',
        };
      }

      // Send to all supporting devices
      const results = await Promise.all(
        targetDevices.map((device: any) => this.sendToDevice(device.deviceId, message))
      );

      const successCount = results.filter((r) => r.success).length;
      const result: MessageRouteResult = {
        success: successCount > 0,
        messageId: message.id,
        deliveredAt: new Date(),
      };

      if (successCount === 0) {
        result.error = 'Failed to deliver to any device';
      }

      return result;
    }
  }

  /**
   * Route device handoff messages
   */
  private async routeHandoffMessage(message: CloudMessage): Promise<MessageRouteResult> {
    // Handoff messages need to go to both source and target devices
    const results: MessageRouteResult[] = [];

    if (message.fromDeviceId) {
      results.push(await this.sendToDevice(message.fromDeviceId, message));
    }

    if (message.toDeviceId && message.toDeviceId !== message.fromDeviceId) {
      results.push(await this.sendToDevice(message.toDeviceId, message));
    }

    const successCount = results.filter((r) => r.success).length;
    const result: MessageRouteResult = {
      success: successCount > 0,
      messageId: message.id,
      deliveredAt: new Date(),
    };

    if (successCount === 0) {
      result.error = 'Failed to deliver handoff message';
    }

    return result;
  }

  /**
   * Route notification messages
   */
  private async routeNotification(message: CloudMessage): Promise<MessageRouteResult> {
    // Notifications go to devices that support them
    const targetDevices = this.server.getActiveConnections().filter((conn: any) => {
      const deviceInfo = this.server.getDeviceInfo?.(conn.deviceId);
      return deviceInfo?.capabilities?.supportsNotifications;
    });

    if (targetDevices.length === 0) {
      return {
        success: false,
        messageId: message.id,
        error: 'No devices support notifications',
      };
    }

    const results = await Promise.all(
      targetDevices.map((device: any) => this.sendToDevice(device.deviceId, message))
    );

    const successCount = results.filter((r) => r.success).length;
    const result: MessageRouteResult = {
      success: successCount > 0,
      messageId: message.id,
      deliveredAt: new Date(),
    };

    if (successCount === 0) {
      result.error = 'Failed to deliver notification';
    }

    return result;
  }

  /**
   * Route generic messages
   */
  private async routeGenericMessage(message: CloudMessage): Promise<MessageRouteResult> {
    if (message.toDeviceId) {
      return await this.sendToDevice(message.toDeviceId, message);
    } else {
      return await this.broadcastToUserDevices(message.userId, message);
    }
  }

  /**
   * Send message to a specific device
   */
  private async sendToDevice(deviceId: string, message: CloudMessage): Promise<MessageRouteResult> {
    try {
      const connection = this.server.getConnectionByDeviceId(deviceId);
      if (!connection) {
        throw new DeviceNotFoundError(deviceId);
      }

      await this.server.sendMessage(connection, message);

      return {
        success: true,
        messageId: message.id,
        deliveredAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to send message to device', {
        deviceId,
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        messageId: message.id,
        error: error instanceof Error ? error.message : 'Unknown delivery error',
      };
    }
  }

  /**
   * Broadcast message to all devices of a user
   */
  private async broadcastToUserDevices(
    userId: string,
    message: CloudMessage
  ): Promise<MessageRouteResult> {
    const userConnections = this.server
      .getActiveConnections()
      .filter((conn: any) => conn.userId === userId);

    if (userConnections.length === 0) {
      return {
        success: false,
        messageId: message.id,
        error: 'No active devices for user',
      };
    }

    const results = await Promise.all(
      userConnections.map((conn: any) => this.sendToDevice(conn.deviceId, message))
    );

    const successCount = results.filter((r) => r.success).length;
    const result: MessageRouteResult = {
      success: successCount > 0,
      messageId: message.id,
      deliveredAt: new Date(),
    };

    if (successCount === 0) {
      result.error = 'Failed to deliver to any user device';
    }

    return result;
  }
}
