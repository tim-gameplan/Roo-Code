-- =====================================================
-- TASK-007.1.1.3: File Sync & Workspace Schema
-- Migration: 005_file_sync_workspace_schema.sql
-- Description: File synchronization and workspace management schema
-- Dependencies: 004_conversation_message_schema.sql
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =====================================================
-- TABLE: workspaces
-- Purpose: User workspace management and settings
-- =====================================================
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    path VARCHAR(1000) NOT NULL,
    settings JSONB DEFAULT '{}',
    last_accessed TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT workspaces_user_path_unique UNIQUE(user_id, path),
    CONSTRAINT workspaces_name_length CHECK (LENGTH(name) >= 1),
    CONSTRAINT workspaces_path_length CHECK (LENGTH(path) >= 1)
);

-- =====================================================
-- TABLE: file_sync_state
-- Purpose: File synchronization state tracking
-- =====================================================
CREATE TABLE file_sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    file_path VARCHAR(1000) NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    file_size BIGINT,
    last_modified TIMESTAMP NOT NULL,
    sync_status VARCHAR(20) DEFAULT 'synced',
    conflict_resolution VARCHAR(20),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT file_sync_state_user_workspace_path_unique UNIQUE(user_id, workspace_id, file_path),
    CONSTRAINT file_sync_state_file_path_length CHECK (LENGTH(file_path) >= 1),
    CONSTRAINT file_sync_state_file_hash_length CHECK (LENGTH(file_hash) >= 1),
    CONSTRAINT file_sync_state_file_size_positive CHECK (file_size IS NULL OR file_size >= 0),
    CONSTRAINT file_sync_state_sync_status_valid CHECK (
        sync_status IN ('synced', 'pending', 'conflict', 'error', 'deleted')
    ),
    CONSTRAINT file_sync_state_conflict_resolution_valid CHECK (
        conflict_resolution IS NULL OR 
        conflict_resolution IN ('local_wins', 'remote_wins', 'merge', 'manual')
    )
);

-- =====================================================
-- TABLE: sync_operations
-- Purpose: Sync operations and conflict resolution tracking
-- =====================================================
CREATE TABLE sync_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    operation_type VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100) NOT NULL,
    operation_data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    conflict_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT sync_operations_operation_type_valid CHECK (
        operation_type IN ('create', 'update', 'delete', 'move', 'copy', 'sync')
    ),
    CONSTRAINT sync_operations_resource_type_valid CHECK (
        resource_type IN ('file', 'directory', 'workspace', 'conversation', 'message')
    ),
    CONSTRAINT sync_operations_status_valid CHECK (
        status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')
    ),
    CONSTRAINT sync_operations_resource_id_length CHECK (LENGTH(resource_id) >= 1),
    CONSTRAINT sync_operations_completed_at_check CHECK (
        (status = 'completed' AND completed_at IS NOT NULL) OR
        (status != 'completed' AND completed_at IS NULL)
    )
);

-- =====================================================
-- TABLE: offline_operations
-- Purpose: Offline operations queue with retry logic
-- =====================================================
CREATE TABLE offline_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    operation_type VARCHAR(50) NOT NULL,
    operation_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    next_retry_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT offline_operations_operation_type_valid CHECK (
        operation_type IN ('create', 'update', 'delete', 'move', 'copy', 'sync', 'message')
    ),
    CONSTRAINT offline_operations_status_valid CHECK (
        status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'expired')
    ),
    CONSTRAINT offline_operations_retry_count_valid CHECK (retry_count >= 0),
    CONSTRAINT offline_operations_max_retries_valid CHECK (max_retries >= 0),
    CONSTRAINT offline_operations_retry_count_max CHECK (retry_count <= max_retries)
);

-- =====================================================
-- INDEXES: Performance optimization
-- =====================================================

-- Workspaces indexes
CREATE INDEX idx_workspaces_user_id ON workspaces(user_id);
CREATE INDEX idx_workspaces_user_last_accessed ON workspaces(user_id, last_accessed DESC);
CREATE INDEX idx_workspaces_path_trgm ON workspaces USING GIN (path gin_trgm_ops);

-- File sync state indexes
CREATE INDEX idx_file_sync_user_workspace ON file_sync_state(user_id, workspace_id);
CREATE INDEX idx_file_sync_status ON file_sync_state(sync_status, updated_at);
CREATE INDEX idx_file_sync_user_status ON file_sync_state(user_id, sync_status, updated_at);
CREATE INDEX idx_file_sync_workspace_status ON file_sync_state(workspace_id, sync_status);
CREATE INDEX idx_file_sync_file_path_trgm ON file_sync_state USING GIN (file_path gin_trgm_ops);
CREATE INDEX idx_file_sync_last_modified ON file_sync_state(last_modified DESC);

-- Sync operations indexes
CREATE INDEX idx_sync_ops_user_status ON sync_operations(user_id, status, created_at);
CREATE INDEX idx_sync_ops_device_status ON sync_operations(device_id, status, created_at);
CREATE INDEX idx_sync_ops_resource ON sync_operations(resource_type, resource_id);
CREATE INDEX idx_sync_ops_operation_type ON sync_operations(operation_type, created_at);
CREATE INDEX idx_sync_ops_status_created ON sync_operations(status, created_at);

-- Offline operations indexes
CREATE INDEX idx_offline_ops_device_status ON offline_operations(device_id, status, created_at);
CREATE INDEX idx_offline_ops_user_status ON offline_operations(user_id, status, created_at);
CREATE INDEX idx_offline_ops_retry ON offline_operations(status, next_retry_at) WHERE status = 'pending';
CREATE INDEX idx_offline_ops_operation_type ON offline_operations(operation_type, created_at);

-- =====================================================
-- JSONB INDEXES: For metadata and operation data
-- =====================================================

-- Workspaces settings JSONB index
CREATE INDEX idx_workspaces_settings_gin ON workspaces USING GIN (settings);

-- File sync metadata JSONB index
CREATE INDEX idx_file_sync_metadata_gin ON file_sync_state USING GIN (metadata);

-- Sync operations data JSONB indexes
CREATE INDEX idx_sync_ops_operation_data_gin ON sync_operations USING GIN (operation_data);
CREATE INDEX idx_sync_ops_conflict_data_gin ON sync_operations USING GIN (conflict_data);

-- Offline operations data JSONB index
CREATE INDEX idx_offline_ops_operation_data_gin ON offline_operations USING GIN (operation_data);

-- =====================================================
-- TRIGGERS: Automatic timestamp updates
-- =====================================================

-- Update timestamp function (reuse existing if available)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Workspaces updated_at trigger
CREATE TRIGGER update_workspaces_updated_at 
    BEFORE UPDATE ON workspaces 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- File sync state updated_at trigger
CREATE TRIGGER update_file_sync_state_updated_at 
    BEFORE UPDATE ON file_sync_state 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCTIONS: Utility functions for file sync
-- =====================================================

-- Function to get workspace by path
CREATE OR REPLACE FUNCTION get_workspace_by_path(
    p_user_id UUID,
    p_path VARCHAR(1000)
)
RETURNS UUID AS $$
DECLARE
    workspace_id UUID;
BEGIN
    SELECT id INTO workspace_id
    FROM workspaces
    WHERE user_id = p_user_id AND path = p_path;
    
    RETURN workspace_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update file sync status
CREATE OR REPLACE FUNCTION update_file_sync_status(
    p_user_id UUID,
    p_workspace_id UUID,
    p_file_path VARCHAR(1000),
    p_file_hash VARCHAR(64),
    p_file_size BIGINT,
    p_last_modified TIMESTAMP,
    p_sync_status VARCHAR(20) DEFAULT 'synced'
)
RETURNS UUID AS $$
DECLARE
    sync_id UUID;
BEGIN
    INSERT INTO file_sync_state (
        user_id, workspace_id, file_path, file_hash, 
        file_size, last_modified, sync_status
    )
    VALUES (
        p_user_id, p_workspace_id, p_file_path, p_file_hash,
        p_file_size, p_last_modified, p_sync_status
    )
    ON CONFLICT (user_id, workspace_id, file_path)
    DO UPDATE SET
        file_hash = EXCLUDED.file_hash,
        file_size = EXCLUDED.file_size,
        last_modified = EXCLUDED.last_modified,
        sync_status = EXCLUDED.sync_status,
        updated_at = NOW()
    RETURNING id INTO sync_id;
    
    RETURN sync_id;
END;
$$ LANGUAGE plpgsql;

-- Function to queue offline operation
CREATE OR REPLACE FUNCTION queue_offline_operation(
    p_user_id UUID,
    p_device_id UUID,
    p_operation_type VARCHAR(50),
    p_operation_data JSONB,
    p_max_retries INTEGER DEFAULT 3
)
RETURNS UUID AS $$
DECLARE
    operation_id UUID;
BEGIN
    INSERT INTO offline_operations (
        user_id, device_id, operation_type, operation_data, max_retries
    )
    VALUES (
        p_user_id, p_device_id, p_operation_type, p_operation_data, p_max_retries
    )
    RETURNING id INTO operation_id;
    
    RETURN operation_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEWS: Convenient data access
-- =====================================================

-- View for workspace summary with file counts
CREATE VIEW workspace_summary AS
SELECT 
    w.id,
    w.user_id,
    w.name,
    w.path,
    w.settings,
    w.last_accessed,
    w.created_at,
    w.updated_at,
    COUNT(fss.id) as file_count,
    COUNT(CASE WHEN fss.sync_status = 'synced' THEN 1 END) as synced_files,
    COUNT(CASE WHEN fss.sync_status = 'pending' THEN 1 END) as pending_files,
    COUNT(CASE WHEN fss.sync_status = 'conflict' THEN 1 END) as conflict_files
FROM workspaces w
LEFT JOIN file_sync_state fss ON w.id = fss.workspace_id
GROUP BY w.id, w.user_id, w.name, w.path, w.settings, w.last_accessed, w.created_at, w.updated_at;

-- View for pending sync operations
CREATE VIEW pending_sync_operations AS
SELECT 
    so.*,
    u.email as user_email,
    d.device_name
FROM sync_operations so
JOIN users u ON so.user_id = u.id
LEFT JOIN devices d ON so.device_id = d.id
WHERE so.status IN ('pending', 'processing')
ORDER BY so.created_at;

-- View for failed offline operations
CREATE VIEW failed_offline_operations AS
SELECT 
    oo.*,
    u.email as user_email,
    d.device_name
FROM offline_operations oo
JOIN users u ON oo.user_id = u.id
JOIN devices d ON oo.device_id = d.id
WHERE oo.status = 'failed' AND oo.retry_count < oo.max_retries
ORDER BY oo.next_retry_at NULLS FIRST, oo.created_at;

-- =====================================================
-- COMMENTS: Table and column documentation
-- =====================================================

-- Workspaces table comments
COMMENT ON TABLE workspaces IS 'User workspace management and settings';
COMMENT ON COLUMN workspaces.id IS 'Unique workspace identifier';
COMMENT ON COLUMN workspaces.user_id IS 'Reference to workspace owner';
COMMENT ON COLUMN workspaces.name IS 'Human-readable workspace name';
COMMENT ON COLUMN workspaces.path IS 'Absolute path to workspace directory';
COMMENT ON COLUMN workspaces.settings IS 'Workspace-specific settings and preferences';
COMMENT ON COLUMN workspaces.last_accessed IS 'Last time workspace was accessed';

-- File sync state table comments
COMMENT ON TABLE file_sync_state IS 'File synchronization state tracking';
COMMENT ON COLUMN file_sync_state.id IS 'Unique sync state identifier';
COMMENT ON COLUMN file_sync_state.user_id IS 'Reference to file owner';
COMMENT ON COLUMN file_sync_state.workspace_id IS 'Reference to containing workspace';
COMMENT ON COLUMN file_sync_state.file_path IS 'Relative path within workspace';
COMMENT ON COLUMN file_sync_state.file_hash IS 'SHA-256 hash of file content';
COMMENT ON COLUMN file_sync_state.file_size IS 'File size in bytes';
COMMENT ON COLUMN file_sync_state.last_modified IS 'File last modification timestamp';
COMMENT ON COLUMN file_sync_state.sync_status IS 'Current synchronization status';
COMMENT ON COLUMN file_sync_state.conflict_resolution IS 'How conflicts should be resolved';
COMMENT ON COLUMN file_sync_state.metadata IS 'Additional file metadata';

-- Sync operations table comments
COMMENT ON TABLE sync_operations IS 'Sync operations and conflict resolution tracking';
COMMENT ON COLUMN sync_operations.id IS 'Unique operation identifier';
COMMENT ON COLUMN sync_operations.user_id IS '
