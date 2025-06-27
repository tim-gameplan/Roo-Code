import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../../../../utils/logger';
import { CloudMessage, CloudMessageType, MessagePriority } from '../../../../types/rccs';

export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: number;
  messageId?: string;
}

export interface WebSocketClientConfig {
  url: string;
  protocols?: string[];
  headers?: Record<string, string>;
  timeout?: number;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export class TestWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: WebSocketClientConfig;
  private messageQueue: WebSocketMessage[] = [];
  private isConnected = false;
  private reconnectCount = 0;
  private messageHistory: WebSocketMessage[] = [];

  constructor(config: WebSocketClientConfig) {
    super();
    this.config = {
      timeout: 5000,
      reconnectAttempts: 3,
      reconnectDelay: 1000,
      ...config,
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let isResolved = false;

      try {
        this.ws = new WebSocket(this.config.url, this.config.protocols, {
          headers: this.config.headers,
        });

        const timeout = setTimeout(() => {
          if (!isResolved && this.ws && this.ws.readyState !== WebSocket.OPEN) {
            isResolved = true;
            this.ws.terminate();
            reject(new Error('WebSocket connection timeout'));
          }
        }, this.config.timeout);

        this.ws.on('open', () => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeout);
            this.isConnected = true;
            this.reconnectCount = 0;
            logger.info(`WebSocket client connected to ${this.config.url}`);
            this.emit('connected');
            resolve();
          }
        });

        this.ws.on('message', (data) => {
          try {
            const message: WebSocketMessage = JSON.parse(data.toString());
            message.timestamp = Date.now();
            this.messageHistory.push(message);
            this.emit('message', message);
          } catch (error) {
            logger.error('Failed to parse WebSocket message:', error);
            this.emit('error', error);
          }
        });

        this.ws.on('close', (code, reason) => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeout);
          }
          this.isConnected = false;
          logger.info(`WebSocket connection closed: ${code} - ${reason}`);
          this.emit('disconnected', { code, reason });

          if (this.reconnectCount < (this.config.reconnectAttempts || 3)) {
            this.attemptReconnect();
          }
        });

        this.ws.on('error', (error) => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeout);
            logger.error('WebSocket error:', error);
            this.emit('error', error);
            reject(error);
          } else {
            logger.error('WebSocket error:', error);
            // Only emit error if there are listeners to prevent unhandled errors
            if (this.listenerCount('error') > 0) {
              this.emit('error', error);
            }
          }
        });
      } catch (error) {
        if (!isResolved) {
          isResolved = true;
          reject(error);
        }
      }
    });
  }

  private async attemptReconnect(): Promise<void> {
    this.reconnectCount++;
    logger.info(
      `Attempting to reconnect (${this.reconnectCount}/${this.config.reconnectAttempts})`
    );

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.error('Reconnection failed:', error);
        // Don't emit error during reconnection attempts to prevent unhandled errors
      }
    }, this.config.reconnectDelay);
  }

  send(message: Omit<WebSocketMessage, 'timestamp'>): void {
    if (!this.isConnected || !this.ws) {
      this.messageQueue.push({ ...message, timestamp: Date.now() });
      logger.warn('WebSocket not connected, message queued');
      return;
    }

    const fullMessage: WebSocketMessage = {
      ...message,
      timestamp: Date.now(),
    };

    try {
      this.ws.send(JSON.stringify(fullMessage));
      this.emit('messageSent', fullMessage);
    } catch (error) {
      logger.error('Failed to send WebSocket message:', error);
      this.emit('error', error);
    }
  }

  sendCloudMessage(message: Partial<CloudMessage>): void {
    const cloudMessage: CloudMessage = {
      id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: message.type || CloudMessageType.USER_MESSAGE,
      fromDeviceId: message.fromDeviceId || 'test-client',
      toDeviceId: message.toDeviceId || 'server',
      userId: message.userId || 'test-user',
      payload: message.payload || {},
      timestamp: message.timestamp || new Date(),
      priority: message.priority || MessagePriority.NORMAL,
      requiresAck: message.requiresAck || false,
      retryCount: message.retryCount || 0,
    };

    if (!this.isConnected || !this.ws) {
      logger.warn('WebSocket not connected, CloudMessage queued');
      return;
    }

    try {
      this.ws.send(JSON.stringify(cloudMessage));
      this.emit('cloudMessageSent', cloudMessage);
    } catch (error) {
      logger.error('Failed to send CloudMessage:', error);
      this.emit('error', error);
    }
  }

  async waitForCloudMessage(
    predicate: (message: CloudMessage) => boolean,
    timeout: number = 5000
  ): Promise<CloudMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for CloudMessage'));
      }, timeout);

      const messageHandler = (data: any) => {
        try {
          const message = typeof data === 'string' ? JSON.parse(data) : data;
          if (this.isCloudMessage(message) && predicate(message)) {
            clearTimeout(timer);
            this.off('message', messageHandler);
            resolve(message);
          }
        } catch (error) {
          // Ignore parsing errors for non-CloudMessage data
        }
      };

      this.on('message', messageHandler);
    });
  }

  private isCloudMessage(obj: any): obj is CloudMessage {
    return (
      obj &&
      typeof obj.id === 'string' &&
      typeof obj.type === 'string' &&
      typeof obj.fromDeviceId === 'string' &&
      typeof obj.userId === 'string' &&
      obj.payload !== undefined &&
      (obj.timestamp instanceof Date || typeof obj.timestamp === 'string') &&
      typeof obj.priority === 'number' &&
      typeof obj.requiresAck === 'boolean'
    );
  }

  async waitForMessage(
    predicate: (message: WebSocketMessage) => boolean,
    timeout: number = 5000
  ): Promise<WebSocketMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for WebSocket message'));
      }, timeout);

      const messageHandler = (message: WebSocketMessage) => {
        if (predicate(message)) {
          clearTimeout(timer);
          this.off('message', messageHandler);
          resolve(message);
        }
      };

      this.on('message', messageHandler);
    });
  }

  async waitForMessageType(type: string, timeout: number = 5000): Promise<WebSocketMessage> {
    return this.waitForMessage((message) => message.type === type, timeout);
  }

  getMessageHistory(): WebSocketMessage[] {
    return [...this.messageHistory];
  }

  getLastMessage(): WebSocketMessage | null {
    if (this.messageHistory.length === 0) {
      return null;
    }
    const lastMessage = this.messageHistory[this.messageHistory.length - 1];
    return lastMessage || null;
  }

  getMessagesByType(type: string): WebSocketMessage[] {
    return this.messageHistory.filter((message) => message.type === type);
  }

  clearMessageHistory(): void {
    this.messageHistory = [];
  }

  isConnectionOpen(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  terminate(): void {
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

export class WebSocketClientManager {
  private clients: Map<string, TestWebSocketClient> = new Map();
  private defaultConfig: Partial<WebSocketClientConfig>;

  constructor(defaultConfig: Partial<WebSocketClientConfig> = {}) {
    this.defaultConfig = defaultConfig;
  }

  async createClient(
    clientId: string,
    config: WebSocketClientConfig
  ): Promise<TestWebSocketClient> {
    const fullConfig = { ...this.defaultConfig, ...config };
    const client = new TestWebSocketClient(fullConfig);

    await client.connect();
    this.clients.set(clientId, client);

    return client;
  }

  getClient(clientId: string): TestWebSocketClient | undefined {
    return this.clients.get(clientId);
  }

  async createMultipleClients(
    count: number,
    baseConfig: WebSocketClientConfig
  ): Promise<TestWebSocketClient[]> {
    const clients: TestWebSocketClient[] = [];

    for (let i = 0; i < count; i++) {
      const clientId = `client-${i}`;
      const client = await this.createClient(clientId, baseConfig);
      clients.push(client);
    }

    return clients;
  }

  async broadcastToAllClients(message: Omit<WebSocketMessage, 'timestamp'>): Promise<void> {
    const promises = Array.from(this.clients.values()).map((client) => {
      if (client.isConnectionOpen()) {
        client.send(message);
      }
    });

    await Promise.all(promises);
  }

  async waitForAllClientsMessage(
    predicate: (message: WebSocketMessage) => boolean,
    timeout: number = 5000
  ): Promise<WebSocketMessage[]> {
    const promises = Array.from(this.clients.values()).map((client) =>
      client.waitForMessage(predicate, timeout)
    );

    return Promise.all(promises);
  }

  getAllClients(): TestWebSocketClient[] {
    return Array.from(this.clients.values());
  }

  getConnectedClients(): TestWebSocketClient[] {
    return Array.from(this.clients.values()).filter((client) => client.isConnectionOpen());
  }

  disconnectAllClients(): void {
    this.clients.forEach((client) => client.disconnect());
    this.clients.clear();
  }

  terminateAllClients(): void {
    this.clients.forEach((client) => client.terminate());
    this.clients.clear();
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getConnectedClientCount(): number {
    return this.getConnectedClients().length;
  }
}

export default { TestWebSocketClient, WebSocketClientManager };
