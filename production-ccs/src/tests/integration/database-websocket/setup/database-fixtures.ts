import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

export interface TestUser {
  id: string;
  email: string;
  username: string;
  password: string;
  hashedPassword: string;
  createdAt: Date;
}

export interface TestConversation {
  id: string;
  title: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestMessage {
  id: string;
  conversationId: string;
  userId: string;
  content: string;
  messageType: 'user' | 'assistant' | 'system';
  createdAt: Date;
}

export class DatabaseFixtures {
  private database: Pool;

  constructor(database: Pool) {
    this.database = database;
  }

  async createTestUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
    const password = overrides.password || 'testpassword123';
    const hashedPassword = await bcrypt.hash(password, 10);

    const user: TestUser = {
      id: uuidv4(),
      email: `test-${Date.now()}@example.com`,
      username: `testuser-${Date.now()}`,
      password,
      hashedPassword,
      createdAt: new Date(),
      ...overrides,
    };

    const query = `
      INSERT INTO users (id, email, username, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5)
      RETURNING *
    `;

    await this.database.query(query, [
      user.id,
      user.email,
      user.username,
      user.hashedPassword,
      user.createdAt,
    ]);

    return user;
  }

  async createTestConversation(
    userId: string,
    overrides: Partial<TestConversation> = {}
  ): Promise<TestConversation> {
    const conversation: TestConversation = {
      id: uuidv4(),
      title: `Test Conversation ${Date.now()}`,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };

    const query = `
      INSERT INTO conversations (id, title, user_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    await this.database.query(query, [
      conversation.id,
      conversation.title,
      conversation.userId,
      conversation.createdAt,
      conversation.updatedAt,
    ]);

    return conversation;
  }

  async createTestMessage(
    conversationId: string,
    userId: string,
    overrides: Partial<TestMessage> = {}
  ): Promise<TestMessage> {
    const message: TestMessage = {
      id: uuidv4(),
      conversationId,
      userId,
      content: `Test message content ${Date.now()}`,
      messageType: 'user',
      createdAt: new Date(),
      ...overrides,
    };

    const query = `
      INSERT INTO messages (id, conversation_id, user_id, content, message_type, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    await this.database.query(query, [
      message.id,
      message.conversationId,
      message.userId,
      message.content,
      message.messageType,
      message.createdAt,
    ]);

    return message;
  }

  async createTestUserSession(userId: string, deviceId?: string): Promise<string> {
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const query = `
      INSERT INTO user_sessions (id, user_id, device_id, expires_at, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id
    `;

    await this.database.query(query, [
      sessionId,
      userId,
      deviceId || `test-device-${Date.now()}`,
      expiresAt,
    ]);

    return sessionId;
  }

  async createMultipleTestUsers(count: number): Promise<TestUser[]> {
    const users: TestUser[] = [];

    for (let i = 0; i < count; i++) {
      const user = await this.createTestUser({
        email: `test-user-${i}-${Date.now()}@example.com`,
        username: `testuser-${i}-${Date.now()}`,
      });
      users.push(user);
    }

    return users;
  }

  async createConversationWithMessages(
    userId: string,
    messageCount: number = 3
  ): Promise<{ conversation: TestConversation; messages: TestMessage[] }> {
    const conversation = await this.createTestConversation(userId);
    const messages: TestMessage[] = [];

    for (let i = 0; i < messageCount; i++) {
      const message = await this.createTestMessage(conversation.id, userId, {
        content: `Test message ${i + 1} in conversation`,
        messageType: i % 2 === 0 ? 'user' : 'assistant',
      });
      messages.push(message);
    }

    return { conversation, messages };
  }

  async getUserById(userId: string): Promise<TestUser | null> {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await this.database.query(query, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      password: '', // Don't return actual password
      hashedPassword: row.password_hash,
      createdAt: row.created_at,
    };
  }

  async getConversationById(conversationId: string): Promise<TestConversation | null> {
    const query = 'SELECT * FROM conversations WHERE id = $1';
    const result = await this.database.query(query, [conversationId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getMessagesByConversationId(conversationId: string): Promise<TestMessage[]> {
    const query = `
      SELECT * FROM messages 
      WHERE conversation_id = $1 
      ORDER BY created_at ASC
    `;
    const result = await this.database.query(query, [conversationId]);

    return result.rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      content: row.content,
      messageType: row.message_type,
      createdAt: row.created_at,
    }));
  }

  async cleanupTestData(): Promise<void> {
    // Clean up in reverse order of dependencies
    await this.database.query("DELETE FROM messages WHERE content LIKE '%Test message%'");
    await this.database.query("DELETE FROM conversations WHERE title LIKE '%Test Conversation%'");
    await this.database.query("DELETE FROM user_sessions WHERE device_id LIKE '%test-device%'");
    await this.database.query("DELETE FROM users WHERE email LIKE '%test%@example.com'");
  }

  async verifyDatabaseIntegrity(): Promise<boolean> {
    try {
      // Check if all required tables exist
      const tableQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('users', 'conversations', 'messages', 'user_sessions')
      `;

      const result = await this.database.query(tableQuery);
      const expectedTables = ['users', 'conversations', 'messages', 'user_sessions'];
      const existingTables = result.rows.map((row) => row.table_name);

      return expectedTables.every((table) => existingTables.includes(table));
    } catch (error) {
      console.error('Database integrity check failed:', error);
      return false;
    }
  }
}

export default DatabaseFixtures;
