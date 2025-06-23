-- Migration: 003_core_user_authentication.sql
-- Description: Core User & Authentication Schema for handheld device integration
-- Created: 2025-06-23
-- Task: TASK-007.1.1.1

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table with authentication fields and security settings
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    preferences JSONB DEFAULT '{}',
    security_settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'deleted')),
    email_verified BOOLEAN DEFAULT FALSE,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP,
    email_verification_token VARCHAR(255),
    email_verification_expires TIMESTAMP
);

-- Device Management table for cross-device registration
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(100) NOT NULL,
    device_type VARCHAR(50) NOT NULL CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'web')),
    platform VARCHAR(50),
    device_fingerprint VARCHAR(255),
    capabilities JSONB DEFAULT '{}',
    last_seen TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
    push_token VARCHAR(500),
    app_version VARCHAR(50),
    os_version VARCHAR(50)
);

-- Session Management table with proper expiration and security
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    refresh_token VARCHAR(255) UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    refresh_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    last_activity TIMESTAMP DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    revoked_at TIMESTAMP,
    revoked_reason VARCHAR(100)
);

-- Authentication tokens for various purposes
CREATE TABLE auth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_type VARCHAR(50) NOT NULL CHECK (token_type IN ('password_reset', 'email_verification', 'two_factor', 'api_key')),
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    used_at TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- User preferences for cross-device settings
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    preference_key VARCHAR(100) NOT NULL,
    preference_value JSONB NOT NULL,
    device_specific BOOLEAN DEFAULT FALSE,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, preference_key, device_id)
);

-- Security audit log for authentication events
CREATE TABLE security_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    event_details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100)
);

-- Performance indexes for authentication queries
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_email_verified ON users(email_verified);
CREATE INDEX idx_users_created_at ON users(created_at);

CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_user_status ON devices(user_id, status);
CREATE INDEX idx_devices_last_seen ON devices(last_seen);
CREATE INDEX idx_devices_fingerprint ON devices(device_fingerprint);

CREATE INDEX idx_sessions_user_device ON sessions(user_id, device_id);
CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_sessions_refresh_token ON sessions(refresh_token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_active ON sessions(is_active, expires_at);
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity);

CREATE INDEX idx_auth_tokens_user_type ON auth_tokens(user_id, token_type);
CREATE INDEX idx_auth_tokens_expires ON auth_tokens(expires_at);
CREATE INDEX idx_auth_tokens_hash ON auth_tokens(token_hash);

CREATE INDEX idx_user_preferences_user_key ON user_preferences(user_id, preference_key);
CREATE INDEX idx_user_preferences_device ON user_preferences(device_id);

CREATE INDEX idx_security_audit_user ON security_audit_log(user_id);
CREATE INDEX idx_security_audit_device ON security_audit_log(device_id);
CREATE INDEX idx_security_audit_event ON security_audit_log(event_type, created_at);
CREATE INDEX idx_security_audit_ip ON security_audit_log(ip_address);

-- JSONB indexes for frequently queried fields
CREATE INDEX idx_users_preferences_gin ON users USING GIN (preferences);
CREATE INDEX idx_users_security_settings_gin ON users USING GIN (security_settings);
CREATE INDEX idx_devices_capabilities_gin ON devices USING GIN (capabilities);
CREATE INDEX idx_auth_tokens_metadata_gin ON auth_tokens USING GIN (metadata);
CREATE INDEX idx_security_audit_details_gin ON security_audit_log USING GIN (event_details);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sessions 
    WHERE expires_at < NOW() 
    OR (refresh_expires_at IS NOT NULL AND refresh_expires_at < NOW());
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired auth tokens
CREATE OR REPLACE FUNCTION cleanup_expired_auth_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM auth_tokens 
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to log security events
CREATE OR REPLACE FUNCTION log_security_event(
    p_user_id UUID,
    p_device_id UUID,
    p_session_id UUID,
    p_event_type VARCHAR(50),
    p_event_details JSONB,
    p_ip_address INET,
    p_user_agent TEXT,
    p_success BOOLEAN,
    p_risk_score INTEGER DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO security_audit_log (
        user_id, device_id, session_id, event_type, event_details,
        ip_address, user_agent, success, risk_score
    ) VALUES (
        p_user_id, p_device_id, p_session_id, p_event_type, p_event_details,
        p_ip_address, p_user_agent, p_success, p_risk_score
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- Insert default admin user for testing (password: 'admin123')
INSERT INTO users (
    email, 
    password_hash, 
    display_name, 
    status, 
    email_verified,
    preferences,
    security_settings
) VALUES (
    'admin@roo-code.dev',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.PJ/...',
    'Admin User',
    'active',
    TRUE,
    '{"theme": "dark", "notifications": true, "sync_enabled": true}',
    '{"two_factor_required": false, "session_timeout": 86400, "max_devices": 10}'
) ON CONFLICT (email) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE users IS 'Core user accounts with authentication and security settings';
COMMENT ON TABLE devices IS 'Registered devices for cross-device authentication';
COMMENT ON TABLE sessions IS 'Active user sessions with security tracking';
COMMENT ON TABLE auth_tokens IS 'Authentication tokens for various purposes';
COMMENT ON TABLE user_preferences IS 'User preferences with device-specific overrides';
COMMENT ON TABLE security_audit_log IS 'Security event audit trail';

COMMENT ON COLUMN users.preferences IS 'User preferences in JSONB format for flexibility';
COMMENT ON COLUMN users.security_settings IS 'Security configuration and policies';
COMMENT ON COLUMN devices.capabilities IS 'Device capabilities and feature support';
COMMENT ON COLUMN devices.device_fingerprint IS 'Unique device identifier for security';
COMMENT ON COLUMN sessions.refresh_expires_at IS 'Refresh token expiration for extended sessions';
COMMENT ON COLUMN security_audit_log.risk_score IS 'Risk assessment score (0-100) for the event';
