import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import {
  User,
  Session,
  ExtensionConnection,
  Message,
  MessageType,
  MessageStatus,
  RealTimeEvent,
  EventSubscription,
  EventType,
  EventPriority,
} from '@/types';

export class DatabaseService {
  private pool: Pool;
  private isConnected = false;

  constructor() {
    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.username,
      password: config.database.password,
      ssl: config.database.ssl,
      max: config.database.maxConnections,
      connectionTimeoutMillis: config.database.connectionTimeout,
      idleTimeoutMillis: 30000,
      allowExitOnIdle: false,
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', { error: err });
    });

    this.pool.on('connect', () => {
      this.isConnected = true;
      logger.info('Database connection established');
    });

    this.pool.on('remove', () => {
      logger.debug('Database connection removed from pool');
    });
  }

  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      this.isConnected = true;
      logger.info('Database connection successful');
    } catch (error) {
      this.isConnected = false;
      logger.error('Failed to connect to database', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.pool.end();
      this.isConnected = false;
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database connection', { error });
      throw error;
    }
  }

  async query<T extends Record<string, any> = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      logger.debug('Database query executed', {
        query: text,
        duration,
        rows: result.rowCount,
      });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Database query failed', {
        query: text,
        duration,
        error,
      });
      throw error;
    }
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  // User operations
  async createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const query = `
      INSERT INTO roo_core.users (username, email, password_hash, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [userData.username, userData.email, userData.passwordHash, userData.isActive];
    const result = await this.query<User>(query, values);
    if (!result.rows[0]) {
      throw new Error('Failed to create user');
    }
    return result.rows[0];
  }

  async getUserById(id: string): Promise<User | null> {
    const query = 'SELECT * FROM roo_core.users WHERE id = $1';
    const result = await this.query<User>(query, [id]);
    return result.rows[0] || null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const query = 'SELECT * FROM roo_core.users WHERE username = $1';
    const result = await this.query<User>(query, [username]);
    return result.rows[0] || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM roo_core.users WHERE email = $1';
    const result = await this.query<User>(query, [email]);
    return result.rows[0] || null;
  }

  async updateUserLastLogin(userId: string): Promise<void> {
    const query = 'UPDATE roo_core.users SET last_login_at = NOW() WHERE id = $1';
    await this.query(query, [userId]);
  }

  // Session operations
  async createSession(sessionData: Omit<Session, 'id' | 'createdAt'>): Promise<Session> {
    const query = `
      INSERT INTO roo_core.sessions (user_id, token, refresh_token, expires_at, is_active, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [
      sessionData.userId,
      sessionData.token,
      sessionData.refreshToken,
      sessionData.expiresAt,
      sessionData.isActive,
      sessionData.ipAddress,
      sessionData.userAgent,
    ];
    const result = await this.query<Session>(query, values);
    if (!result.rows[0]) {
      throw new Error('Failed to create session');
    }
    return result.rows[0];
  }

  async getSessionByToken(token: string): Promise<Session | null> {
    const query = 'SELECT * FROM roo_core.sessions WHERE token = $1 AND is_active = true';
    const result = await this.query<Session>(query, [token]);
    return result.rows[0] || null;
  }

  async getSessionByRefreshToken(refreshToken: string): Promise<Session | null> {
    const query = 'SELECT * FROM roo_core.sessions WHERE refresh_token = $1 AND is_active = true';
    const result = await this.query<Session>(query, [refreshToken]);
    return result.rows[0] || null;
  }

  async invalidateSession(sessionId: string): Promise<void> {
    const query = 'UPDATE roo_core.sessions SET is_active = false WHERE id = $1';
    await this.query(query, [sessionId]);
  }

  async invalidateUserSessions(userId: string): Promise<void> {
    const query = 'UPDATE roo_core.sessions SET is_active = false WHERE user_id = $1';
    await this.query(query, [userId]);
  }

  // Extension connection operations
  async createExtensionConnection(
    connectionData: Omit<ExtensionConnection, 'id' | 'createdAt'>
  ): Promise<ExtensionConnection> {
    const query = `
      INSERT INTO roo_core.extension_connections (user_id, socket_path, is_connected, last_heartbeat, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const values = [
      connectionData.userId,
      connectionData.socketPath,
      connectionData.isConnected,
      connectionData.lastHeartbeat,
      JSON.stringify(connectionData.metadata || {}),
    ];
    const result = await this.query<ExtensionConnection>(query, values);
    if (!result.rows[0]) {
      throw new Error('Failed to create extension connection');
    }
    return result.rows[0];
  }

  async updateExtensionConnectionStatus(connectionId: string, isConnected: boolean): Promise<void> {
    const query = `
      UPDATE roo_core.extension_connections 
      SET is_connected = $1, last_heartbeat = NOW() 
      WHERE id = $2
    `;
    await this.query(query, [isConnected, connectionId]);
  }

  async getActiveExtensionConnections(userId: string): Promise<ExtensionConnection[]> {
    const query =
      'SELECT * FROM roo_core.extension_connections WHERE user_id = $1 AND is_connected = true';
    const result = await this.query<ExtensionConnection>(query, [userId]);
    return result.rows;
  }

  // Message operations
  async createMessage(messageData: Omit<Message, 'id' | 'timestamp'>): Promise<Message> {
    const query = `
      INSERT INTO roo_core.messages (session_id, type, payload, status, correlation_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const values = [
      messageData.sessionId,
      messageData.type,
      JSON.stringify(messageData.payload),
      messageData.status,
      messageData.correlationId,
    ];
    const result = await this.query<Message>(query, values);
    if (!result.rows[0]) {
      throw new Error('Failed to create message');
    }
    return result.rows[0];
  }

  async updateMessageStatus(messageId: string, status: MessageStatus): Promise<void> {
    const query = 'UPDATE roo_core.messages SET status = $1 WHERE id = $2';
    await this.query(query, [status, messageId]);
  }

  async getMessagesBySession(sessionId: string, limit = 100): Promise<Message[]> {
    const query = `
      SELECT * FROM roo_core.messages 
      WHERE session_id = $1 
      ORDER BY timestamp DESC 
      LIMIT $2
    `;
    const result = await this.query<Message>(query, [sessionId, limit]);
    return result.rows;
  }

  // Real-time event operations
  async createRealTimeEvent(eventData: Omit<RealTimeEvent, 'id'>): Promise<RealTimeEvent> {
    const query = `
      INSERT INTO roo_core.realtime_events (
        type, timestamp, version, source_user_id, source_device_id, 
        correlation_id, causation_id, payload, metadata, priority, 
        ttl, requires_ack, retry_policy, targets, filters, permissions, encryption
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;
    const values = [
      eventData.type,
      eventData.timestamp,
      eventData.version,
      eventData.source.userId,
      eventData.source.deviceId,
      eventData.correlationId,
      eventData.causationId,
      JSON.stringify(eventData.payload),
      JSON.stringify(eventData.metadata),
      eventData.priority,
      eventData.ttl,
      eventData.requiresAck,
      eventData.retryPolicy ? JSON.stringify(eventData.retryPolicy) : null,
      JSON.stringify(eventData.targets || []),
      JSON.stringify(eventData.filters || []),
      JSON.stringify(eventData.permissions),
      eventData.encryption ? JSON.stringify(eventData.encryption) : null,
    ];
    const result = await this.query<RealTimeEvent>(query, values);
    if (!result.rows[0]) {
      throw new Error('Failed to create real-time event');
    }
    return result.rows[0];
  }

  async getEventsByType(eventType: EventType, limit = 100): Promise<RealTimeEvent[]> {
    const query = `
      SELECT * FROM roo_core.realtime_events 
      WHERE type = $1 
      ORDER BY timestamp DESC 
      LIMIT $2
    `;
    const result = await this.query<RealTimeEvent>(query, [eventType, limit]);
    return result.rows;
  }

  async getEventsByUser(userId: string, limit = 100): Promise<RealTimeEvent[]> {
    const query = `
      SELECT * FROM roo_core.realtime_events 
      WHERE source_user_id = $1 
      ORDER BY timestamp DESC 
      LIMIT $2
    `;
    const result = await this.query<RealTimeEvent>(query, [userId, limit]);
    return result.rows;
  }

  // Event subscription operations
  async createEventSubscription(
    subscriptionData: Omit<EventSubscription, 'id'>
  ): Promise<EventSubscription> {
    const query = `
      INSERT INTO roo_core.event_subscriptions (
        user_id, device_id, session_id, event_types, filters, priority,
        delivery_mode, batch_size, batch_interval, created_at, expires_at,
        is_active, events_received, last_event_at, average_latency
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;
    const values = [
      subscriptionData.userId,
      subscriptionData.deviceId,
      subscriptionData.sessionId,
      subscriptionData.eventTypes,
      JSON.stringify(subscriptionData.filters),
      subscriptionData.priority,
      subscriptionData.deliveryMode,
      subscriptionData.batchSize,
      subscriptionData.batchInterval,
      subscriptionData.createdAt,
      subscriptionData.expiresAt,
      subscriptionData.isActive,
      subscriptionData.eventsReceived,
      subscriptionData.lastEventAt,
      subscriptionData.averageLatency,
    ];
    const result = await this.query<EventSubscription>(query, values);
    if (!result.rows[0]) {
      throw new Error('Failed to create event subscription');
    }
    return result.rows[0];
  }

  async getActiveSubscriptions(userId: string, deviceId: string): Promise<EventSubscription[]> {
    const query = `
      SELECT * FROM roo_core.event_subscriptions 
      WHERE user_id = $1 AND device_id = $2 AND is_active = true
    `;
    const result = await this.query<EventSubscription>(query, [userId, deviceId]);
    return result.rows;
  }

  async updateSubscriptionMetrics(
    subscriptionId: string,
    eventsReceived: number,
    lastEventAt: number,
    averageLatency: number
  ): Promise<void> {
    const query = `
      UPDATE roo_core.event_subscriptions 
      SET events_received = $1, last_event_at = $2, average_latency = $3
      WHERE id = $4
    `;
    await this.query(query, [eventsReceived, lastEventAt, averageLatency, subscriptionId]);
  }

  // Device presence operations
  async updateDevicePresence(
    userId: string,
    deviceId: string,
    status: string,
    deviceInfo?: Record<string, unknown>,
    locationInfo?: Record<string, unknown>
  ): Promise<void> {
    const query = `
      INSERT INTO roo_core.device_presence (user_id, device_id, status, device_info, location_info)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, device_id)
      DO UPDATE SET 
        status = EXCLUDED.status,
        last_seen = NOW(),
        device_info = EXCLUDED.device_info,
        location_info = EXCLUDED.location_info
    `;
    const values = [
      userId,
      deviceId,
      status,
      JSON.stringify(deviceInfo || {}),
      JSON.stringify(locationInfo || {}),
    ];
    await this.query(query, values);
  }

  async getDevicePresence(userId: string): Promise<any[]> {
    const query = 'SELECT * FROM roo_core.device_presence WHERE user_id = $1';
    const result = await this.query(query, [userId]);
    return result.rows;
  }

  // Typing indicators operations
  async updateTypingIndicator(
    userId: string,
    deviceId: string,
    sessionId: string,
    isTyping: boolean,
    cursorPosition?: number
  ): Promise<void> {
    const query = `
      INSERT INTO roo_core.typing_indicators (user_id, device_id, session_id, is_typing, cursor_position, started_at, last_activity)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (user_id, device_id, session_id)
      DO UPDATE SET 
        is_typing = EXCLUDED.is_typing,
        cursor_position = EXCLUDED.cursor_position,
        last_activity = NOW(),
        started_at = CASE 
          WHEN typing_indicators.is_typing = false AND EXCLUDED.is_typing = true 
          THEN NOW() 
          ELSE typing_indicators.started_at 
        END
    `;
    const values = [userId, deviceId, sessionId, isTyping, cursorPosition];
    await this.query(query, values);
  }

  async getTypingIndicators(sessionId: string): Promise<any[]> {
    const query = `
      SELECT * FROM roo_core.typing_indicators 
      WHERE session_id = $1 AND is_typing = true 
      AND last_activity > NOW() - INTERVAL '30 seconds'
    `;
    const result = await this.query(query, [sessionId]);
    return result.rows;
  }

  async cleanupExpiredTypingIndicators(): Promise<void> {
    const query = `
      UPDATE roo_core.typing_indicators 
      SET is_typing = false 
      WHERE is_typing = true 
      AND last_activity < NOW() - INTERVAL '30 seconds'
    `;
    await this.query(query);
  }

  // Health check operations
  async healthCheck(): Promise<{ status: string; timestamp: Date }> {
    try {
      const result = await this.query('SELECT NOW() as timestamp');
      return {
        status: 'healthy',
        timestamp: result.rows[0].timestamp,
      };
    } catch (error) {
      logger.error('Database health check failed', { error });
      throw error;
    }
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();
