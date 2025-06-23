-- Core Database Schema for Roo-Code
-- Migration: 002_core_schema.sql
-- Description: Creates core tables for users, sessions, messages, and real-time communication

-- Create core application schema
CREATE SCHEMA IF NOT EXISTS roo_core;

-- Users table
CREATE TABLE IF NOT EXISTS roo_core.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT users_username_length CHECK (LENGTH(username) >= 3 AND LENGTH(username) <= 255),
    CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Sessions table
CREATE TABLE IF NOT EXISTS roo_core.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES roo_core.users(id) ON DELETE CASCADE,
    token VARCHAR(512) NOT NULL UNIQUE,
    refresh_token VARCHAR(512) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    ip_address INET,
    user_agent TEXT,
    
    -- Constraints
    CONSTRAINT sessions_expires_future CHECK (expires_at > created_at)
);

-- Extension connections table
CREATE TABLE IF NOT EXISTS roo_core.extension_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES roo_core.users(id) ON DELETE CASCADE,
    socket_path VARCHAR(512) NOT NULL,
    is_connected BOOLEAN NOT NULL DEFAULT false,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Message types enum
CREATE TYPE roo_core.message_type AS ENUM (
    'sendMessage',
    'getStatus',
    'heartbeat',
    'taskCreated',
    'taskCompleted',
    'error'
);

-- Message status enum
CREATE TYPE roo_core.message_status AS ENUM (
    'pending',
    'sent',
    'delivered',
    'failed'
);

-- Messages table
CREATE TABLE IF NOT EXISTS roo_core.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES roo_core.sessions(id) ON DELETE CASCADE,
    type roo_core.message_type NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status roo_core.message_status NOT NULL DEFAULT 'pending',
    correlation_id UUID
);

-- Event types enum for real-time communication
CREATE TYPE roo_core.event_type AS ENUM (
    'typing.started',
    'typing.stopped',
    'typing.cursor_moved',
    'session.created',
    'session.updated',
    'session.operation_applied',
    'session.conflict_detected',
    'session.conflict_resolved',
    'presence.online',
    'presence.offline',
    'presence.away',
    'presence.device_connected',
    'presence.device_disconnected',
    'message.sent',
    'message.delivered',
    'message.read',
    'message.typing_indicator',
    'system.health_check',
    'system.performance_alert',
    'system.error',
    'custom.event'
);

-- Event priority enum
CREATE TYPE roo_core.event_priority AS ENUM (
    'critical',
    'high',
    'normal',
    'low',
    'background'
);

-- Real-time events table
CREATE TABLE IF NOT EXISTS roo_core.realtime_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type roo_core.event_type NOT NULL,
    timestamp BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    source_user_id UUID NOT NULL REFERENCES roo_core.users(id) ON DELETE CASCADE,
    source_device_id VARCHAR(255) NOT NULL,
    correlation_id UUID,
    causation_id UUID,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    priority roo_core.event_priority NOT NULL DEFAULT 'normal',
    ttl INTEGER, -- Time to live in seconds
    requires_ack BOOLEAN NOT NULL DEFAULT false,
    retry_policy JSONB,
    targets JSONB DEFAULT '[]'::jsonb,
    filters JSONB DEFAULT '[]'::jsonb,
    permissions JSONB NOT NULL DEFAULT '{
        "canRead": true,
        "readScopes": [],
        "canPublish": true,
        "publishScopes": [],
        "canManageSubscriptions": false,
        "canViewMetrics": false,
        "canReplayEvents": false
    }'::jsonb,
    encryption JSONB
);

-- Event subscriptions table
CREATE TABLE IF NOT EXISTS roo_core.event_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES roo_core.users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    session_id UUID REFERENCES roo_core.sessions(id) ON DELETE SET NULL,
    event_types roo_core.event_type[] NOT NULL,
    filters JSONB DEFAULT '[]'::jsonb,
    priority roo_core.event_priority NOT NULL DEFAULT 'normal',
    delivery_mode VARCHAR(50) NOT NULL DEFAULT 'realtime' CHECK (delivery_mode IN ('realtime', 'batched', 'offline')),
    batch_size INTEGER DEFAULT 10,
    batch_interval INTEGER DEFAULT 1000, -- milliseconds
    created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    expires_at BIGINT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    events_received BIGINT NOT NULL DEFAULT 0,
    last_event_at BIGINT,
    average_latency NUMERIC(10,2) NOT NULL DEFAULT 0.0
);

-- Device presence table
CREATE TABLE IF NOT EXISTS roo_core.device_presence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES roo_core.users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'away', 'busy')),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    device_info JSONB DEFAULT '{}'::jsonb,
    location_info JSONB DEFAULT '{}'::jsonb,
    
    -- Unique constraint for user-device combination
    UNIQUE(user_id, device_id)
);

-- Typing indicators table
CREATE TABLE IF NOT EXISTS roo_core.typing_indicators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES roo_core.users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    session_id UUID REFERENCES roo_core.sessions(id) ON DELETE CASCADE,
    is_typing BOOLEAN NOT NULL DEFAULT false,
    cursor_position INTEGER,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint for user-device-session combination
    UNIQUE(user_id, device_id, session_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_username ON roo_core.users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON roo_core.users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON roo_core.users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON roo_core.users(created_at);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON roo_core.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON roo_core.sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON roo_core.sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON roo_core.sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_extension_connections_user_id ON roo_core.extension_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_extension_connections_connected ON roo_core.extension_connections(is_connected);

-- Messages table indexes
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON roo_core.messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON roo_core.messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_status ON roo_core.messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_correlation_id ON roo_core.messages(correlation_id);

-- Real-time events table indexes
CREATE INDEX IF NOT EXISTS idx_realtime_events_type ON roo_core.realtime_events(type);
CREATE INDEX IF NOT EXISTS idx_realtime_events_timestamp ON roo_core.realtime_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_realtime_events_source_user ON roo_core.realtime_events(source_user_id);
CREATE INDEX IF NOT EXISTS idx_realtime_events_priority ON roo_core.realtime_events(priority);
CREATE INDEX IF NOT EXISTS idx_realtime_events_correlation ON roo_core.realtime_events(correlation_id);

-- Event subscriptions table indexes
CREATE INDEX IF NOT EXISTS idx_event_subscriptions_user_device ON roo_core.event_subscriptions(user_id, device_id);
CREATE INDEX IF NOT EXISTS idx_event_subscriptions_session ON roo_core.event_subscriptions(session_id);
CREATE INDEX IF NOT EXISTS idx_event_subscriptions_active ON roo_core.event_subscriptions(is_active);
CREATE INDEX IF NOT EXISTS idx_event_subscriptions_event_types ON roo_core.event_subscriptions USING GIN (event_types);

-- Device presence table indexes
CREATE INDEX IF NOT EXISTS idx_device_presence_user ON roo_core.device_presence(user_id);
CREATE INDEX IF NOT EXISTS idx_device_presence_status ON roo_core.device_presence(status);
CREATE INDEX IF NOT EXISTS idx_device_presence_last_seen ON roo_core.device_presence(last_seen);

-- Typing indicators table indexes
CREATE INDEX IF NOT EXISTS idx_typing_indicators_session ON roo_core.typing_indicators(session_id);
CREATE INDEX IF NOT EXISTS idx_typing_indicators_active ON roo_core.typing_indicators(is_typing, last_activity);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION roo_core.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON roo_core.users 
    FOR EACH ROW EXECUTE FUNCTION roo_core.update_updated_at_column();

-- Insert migration record
INSERT INTO app_metadata.migrations (migration_name, description) 
VALUES ('002_core_schema', 'Core database schema for users, sessions, messages, and real-time communication')
ON CONFLICT (migration_name) DO NOTHING;

-- Log successful migration
DO $$
BEGIN
    RAISE NOTICE 'Migration 002_core_schema completed successfully at %', NOW();
END $$;
