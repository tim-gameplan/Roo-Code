-- Migration: 004_conversation_message_schema.sql
-- Description: Implement conversation and message storage schema for cross-device synchronization
-- Dependencies: 003_core_user_authentication.sql
-- Created: 2025-06-23

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =====================================================
-- CONVERSATIONS TABLE
-- =====================================================

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200),
    workspace_path VARCHAR(500),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT conversations_title_length CHECK (LENGTH(title) >= 1),
    CONSTRAINT conversations_workspace_path_valid CHECK (workspace_path IS NULL OR LENGTH(workspace_path) >= 1)
);

-- =====================================================
-- MESSAGES TABLE
-- =====================================================

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    message_type VARCHAR(50) NOT NULL,
    content JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    parent_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT messages_type_valid CHECK (message_type IN (
        'user_message', 'assistant_message', 'system_message', 
        'tool_use', 'tool_result', 'error_message', 'status_update'
    )),
    CONSTRAINT messages_content_not_empty CHECK (jsonb_typeof(content) = 'object'),
    CONSTRAINT messages_no_self_parent CHECK (id != parent_message_id)
);

-- =====================================================
-- MESSAGE CHANGES TABLE (for synchronization tracking)
-- =====================================================

CREATE TABLE message_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    change_type VARCHAR(20) NOT NULL,
    change_data JSONB NOT NULL,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sync_status VARCHAR(20) DEFAULT 'pending',
    conflict_id UUID,
    
    -- Constraints
    CONSTRAINT message_changes_type_valid CHECK (change_type IN (
        'create', 'update', 'delete', 'restore'
    )),
    CONSTRAINT message_changes_sync_status_valid CHECK (sync_status IN (
        'pending', 'synced', 'conflict', 'failed'
    )),
    CONSTRAINT message_changes_data_not_empty CHECK (jsonb_typeof(change_data) = 'object')
);

-- =====================================================
-- MESSAGE ATTACHMENTS TABLE
-- =====================================================

CREATE TABLE message_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    attachment_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255),
    file_path VARCHAR(1000),
    file_size BIGINT,
    mime_type VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT attachments_type_valid CHECK (attachment_type IN (
        'file', 'image', 'code_snippet', 'link', 'document'
    )),
    CONSTRAINT attachments_file_size_positive CHECK (file_size IS NULL OR file_size > 0),
    CONSTRAINT attachments_file_name_valid CHECK (file_name IS NULL OR LENGTH(file_name) >= 1)
);

-- =====================================================
-- CONVERSATION PARTICIPANTS TABLE (for future multi-user support)
-- =====================================================

CREATE TABLE conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'participant',
    permissions JSONB DEFAULT '{}',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_read_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    
    -- Constraints
    CONSTRAINT participants_role_valid CHECK (role IN ('owner', 'participant', 'viewer')),
    UNIQUE(conversation_id, user_id)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Conversation indexes
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_last_activity ON conversations(last_activity DESC);
CREATE INDEX idx_conversations_workspace_path ON conversations(workspace_path) WHERE workspace_path IS NOT NULL;
CREATE INDEX idx_conversations_user_activity ON conversations(user_id, last_activity DESC);

-- Message indexes
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_user_created ON messages(user_id, created_at DESC);
CREATE INDEX idx_messages_device_created ON messages(device_id, created_at DESC) WHERE device_id IS NOT NULL;
CREATE INDEX idx_messages_parent_id ON messages(parent_message_id) WHERE parent_message_id IS NOT NULL;
CREATE INDEX idx_messages_type_created ON messages(message_type, created_at DESC);

-- Message changes indexes
CREATE INDEX idx_message_changes_user_status ON message_changes(user_id, sync_status, timestamp);
CREATE INDEX idx_message_changes_device_status ON message_changes(device_id, sync_status, timestamp) WHERE device_id IS NOT NULL;
CREATE INDEX idx_message_changes_message_timestamp ON message_changes(message_id, timestamp DESC);
CREATE INDEX idx_message_changes_conflict ON message_changes(conflict_id) WHERE conflict_id IS NOT NULL;

-- Attachment indexes
CREATE INDEX idx_attachments_message_id ON message_attachments(message_id);
CREATE INDEX idx_attachments_type ON message_attachments(attachment_type);

-- Participant indexes
CREATE INDEX idx_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX idx_participants_user ON conversation_participants(user_id);

-- =====================================================
-- JSONB INDEXES FOR CONTENT SEARCH
-- =====================================================

-- GIN indexes for JSONB content search
CREATE INDEX idx_conversations_metadata_gin ON conversations USING GIN (metadata);
CREATE INDEX idx_messages_content_gin ON messages USING GIN (content);
CREATE INDEX idx_messages_metadata_gin ON messages USING GIN (metadata);
CREATE INDEX idx_message_changes_data_gin ON message_changes USING GIN (change_data);
CREATE INDEX idx_attachments_metadata_gin ON message_attachments USING GIN (metadata);

-- =====================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =====================================================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for conversations
CREATE TRIGGER update_conversations_updated_at 
    BEFORE UPDATE ON conversations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Triggers for messages
CREATE TRIGGER update_messages_updated_at 
    BEFORE UPDATE ON messages 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update conversation last_activity
CREATE OR REPLACE FUNCTION update_conversation_activity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations 
    SET last_activity = NOW() 
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update conversation activity on new messages
CREATE TRIGGER update_conversation_activity_on_message
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_activity();

-- =====================================================
-- FUNCTIONS FOR MESSAGE OPERATIONS
-- =====================================================

-- Function to get conversation with message count
CREATE OR REPLACE FUNCTION get_conversation_with_stats(conv_id UUID)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    title VARCHAR(200),
    workspace_path VARCHAR(500),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    last_activity TIMESTAMP WITH TIME ZONE,
    message_count BIGINT,
    last_message_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.user_id,
        c.title,
        c.workspace_path,
        c.metadata,
        c.created_at,
        c.updated_at,
        c.last_activity,
        COUNT(m.id) as message_count,
        MAX(m.created_at) as last_message_at
    FROM conversations c
    LEFT JOIN messages m ON c.id = m.conversation_id
    WHERE c.id = conv_id
    GROUP BY c.id, c.user_id, c.title, c.workspace_path, c.metadata, c.created_at, c.updated_at, c.last_activity;
END;
$$ LANGUAGE plpgsql;

-- Function to get messages with threading
CREATE OR REPLACE FUNCTION get_conversation_messages(
    conv_id UUID,
    limit_count INTEGER DEFAULT 50,
    offset_count INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    conversation_id UUID,
    user_id UUID,
    device_id UUID,
    message_type VARCHAR(50),
    content JSONB,
    metadata JSONB,
    parent_message_id UUID,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    thread_level INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE message_tree AS (
        -- Base case: root messages (no parent)
        SELECT 
            m.id,
            m.conversation_id,
            m.user_id,
            m.device_id,
            m.message_type,
            m.content,
            m.metadata,
            m.parent_message_id,
            m.created_at,
            m.updated_at,
            0 as thread_level
        FROM messages m
        WHERE m.conversation_id = conv_id 
        AND m.parent_message_id IS NULL
        
        UNION ALL
        
        -- Recursive case: child messages
        SELECT 
            m.id,
            m.conversation_id,
            m.user_id,
            m.device_id,
            m.message_type,
            m.content,
            m.metadata,
            m.parent_message_id,
            m.created_at,
            m.updated_at,
            mt.thread_level + 1
        FROM messages m
        INNER JOIN message_tree mt ON m.parent_message_id = mt.id
    )
    SELECT * FROM message_tree
    ORDER BY created_at ASC
    LIMIT limit_count OFFSET offset_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- View for conversation summaries
CREATE VIEW conversation_summaries AS
SELECT 
    c.id,
    c.user_id,
    c.title,
    c.workspace_path,
    c.created_at,
    c.last_activity,
    COUNT(m.id) as message_count,
    MAX(m.created_at) as last_message_at,
    COUNT(DISTINCT m.device_id) as device_count
FROM conversations c
LEFT JOIN messages m ON c.id = m.conversation_id
GROUP BY c.id, c.user_id, c.title, c.workspace_path, c.created_at, c.last_activity;

-- View for pending sync changes
CREATE VIEW pending_sync_changes AS
SELECT 
    mc.id,
    mc.message_id,
    mc.change_type,
    mc.device_id,
    mc.user_id,
    mc.timestamp,
    mc.conflict_id,
    m.conversation_id,
    c.title as conversation_title
FROM message_changes mc
JOIN messages m ON mc.message_id = m.id
JOIN conversations c ON m.conversation_id = c.id
WHERE mc.sync_status = 'pending'
ORDER BY mc.timestamp ASC;

-- =====================================================
-- SAMPLE DATA FOR TESTING (commented out for production)
-- =====================================================

/*
-- Insert sample conversation
INSERT INTO conversations (user_id, title, workspace_path, metadata) VALUES
(
    (SELECT id FROM users LIMIT 1),
    'Sample Conversation',
    '/workspace/project',
    '{"tags": ["development", "testing"], "priority": "high"}'
);

-- Insert sample messages
INSERT INTO messages (conversation_id, user_id, message_type, content, metadata) VALUES
(
    (SELECT id FROM conversations LIMIT 1),
    (SELECT user_id FROM conversations LIMIT 1),
    'user_message',
    '{"text": "Hello, this is a test message", "timestamp": "2025-06-23T11:30:00Z"}',
    '{"source": "web", "edited": false}'
);
*/

-- =====================================================
-- MIGRATION COMPLETION
-- =====================================================

-- Log migration completion
INSERT INTO schema_migrations (version, description, applied_at) VALUES 
('004', 'Conversation and message storage schema', NOW());

COMMIT;
