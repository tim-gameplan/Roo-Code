-- Migration 006: Orchestration Schema for Phase 4 Advanced Workflow Engine
-- Creates tables for workflow definitions, executions, and state management

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Workflow definitions table
CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  description TEXT,
  definition JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Metadata fields
  tags TEXT[] DEFAULT '{}',
  category VARCHAR(100) DEFAULT 'general',
  priority VARCHAR(20) DEFAULT 'normal',
  environment VARCHAR(20) DEFAULT 'development',
  estimated_duration INTEGER, -- in milliseconds
  
  -- Constraints
  CONSTRAINT workflows_status_check CHECK (status IN ('draft', 'active', 'inactive', 'deprecated', 'archived')),
  CONSTRAINT workflows_priority_check CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  CONSTRAINT workflows_environment_check CHECK (environment IN ('development', 'staging', 'production')),
  CONSTRAINT workflows_name_version_unique UNIQUE (name, version)
);

-- Workflow templates table
CREATE TABLE workflow_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  category VARCHAR(100) DEFAULT 'general',
  version VARCHAR(50) NOT NULL,
  definition JSONB NOT NULL,
  parameters JSONB DEFAULT '[]',
  examples JSONB DEFAULT '[]',
  documentation TEXT,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tags TEXT[] DEFAULT '{}',
  popularity INTEGER DEFAULT 0
);

-- Workflow executions table
CREATE TABLE workflow_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_version VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  context JSONB DEFAULT '{}',
  result JSONB,
  triggered_by VARCHAR(255) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  correlation_id VARCHAR(255),
  parent_execution_id UUID REFERENCES workflow_executions(id),
  
  -- Timing fields
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration INTEGER, -- in milliseconds
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT workflow_executions_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout', 'paused')),
  CONSTRAINT workflow_executions_trigger_type_check CHECK (trigger_type IN ('manual', 'schedule', 'event', 'webhook', 'api'))
);

-- Workflow step executions table
CREATE TABLE workflow_step_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  step_id VARCHAR(255) NOT NULL,
  step_name VARCHAR(255),
  step_type VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  input JSONB,
  output JSONB,
  error_message TEXT,
  error_code VARCHAR(100),
  error_details JSONB,
  retry_count INTEGER DEFAULT 0,
  
  -- Timing fields
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration INTEGER, -- in milliseconds
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT workflow_step_executions_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'cancelled', 'timeout', 'retrying'))
);

-- Workflow execution logs table
CREATE TABLE workflow_execution_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  step_execution_id UUID REFERENCES workflow_step_executions(id) ON DELETE CASCADE,
  level VARCHAR(10) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT workflow_execution_logs_level_check CHECK (level IN ('debug', 'info', 'warn', 'error'))
);

-- Workflow state management table
CREATE TABLE workflow_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  current_step VARCHAR(255),
  completed_steps TEXT[] DEFAULT '{}',
  failed_steps TEXT[] DEFAULT '{}',
  skipped_steps TEXT[] DEFAULT '{}',
  variables JSONB DEFAULT '{}',
  parallel_groups JSONB DEFAULT '{}',
  checkpoints JSONB DEFAULT '[]',
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one state per execution
  CONSTRAINT workflow_states_execution_unique UNIQUE (execution_id)
);

-- Workflow state checkpoints table for detailed state tracking
CREATE TABLE workflow_state_checkpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  step_id VARCHAR(255) NOT NULL,
  checkpoint_data JSONB NOT NULL,
  variables JSONB DEFAULT '{}',
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workflow metrics table for performance tracking
CREATE TABLE workflow_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  
  -- Performance metrics
  total_duration INTEGER, -- in milliseconds
  step_count INTEGER,
  successful_steps INTEGER,
  failed_steps INTEGER,
  skipped_steps INTEGER,
  parallel_executions INTEGER,
  retry_attempts INTEGER,
  
  -- Resource usage
  cpu_time INTEGER, -- in milliseconds
  memory_peak INTEGER, -- in bytes
  network_bytes BIGINT,
  storage_bytes BIGINT,
  
  -- Calculated metrics
  average_step_duration NUMERIC(10,2),
  parallel_efficiency NUMERIC(5,2),
  queue_wait_time INTEGER,
  resource_utilization NUMERIC(5,2),
  throughput NUMERIC(10,2),
  error_rate NUMERIC(5,2),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one metrics record per execution
  CONSTRAINT workflow_metrics_execution_unique UNIQUE (execution_id)
);

-- Workflow schedules table for scheduled executions
CREATE TABLE workflow_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  cron_expression VARCHAR(100) NOT NULL,
  timezone VARCHAR(50) DEFAULT 'UTC',
  enabled BOOLEAN DEFAULT true,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  max_executions INTEGER,
  execution_count INTEGER DEFAULT 0,
  last_execution TIMESTAMP WITH TIME ZONE,
  next_execution TIMESTAMP WITH TIME ZONE,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance optimization

-- Workflows indexes
CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_workflows_category ON workflows(category);
CREATE INDEX idx_workflows_created_by ON workflows(created_by);
CREATE INDEX idx_workflows_created_at ON workflows(created_at);
CREATE INDEX idx_workflows_tags ON workflows USING GIN(tags);

-- Workflow templates indexes
CREATE INDEX idx_workflow_templates_category ON workflow_templates(category);
CREATE INDEX idx_workflow_templates_popularity ON workflow_templates(popularity DESC);
CREATE INDEX idx_workflow_templates_tags ON workflow_templates USING GIN(tags);

-- Workflow executions indexes
CREATE INDEX idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_workflow_executions_triggered_by ON workflow_executions(triggered_by);
CREATE INDEX idx_workflow_executions_trigger_type ON workflow_executions(trigger_type);
CREATE INDEX idx_workflow_executions_started_at ON workflow_executions(started_at);
CREATE INDEX idx_workflow_executions_correlation_id ON workflow_executions(correlation_id);
CREATE INDEX idx_workflow_executions_parent_id ON workflow_executions(parent_execution_id);

-- Workflow step executions indexes
CREATE INDEX idx_workflow_step_executions_execution_id ON workflow_step_executions(execution_id);
CREATE INDEX idx_workflow_step_executions_step_id ON workflow_step_executions(step_id);
CREATE INDEX idx_workflow_step_executions_status ON workflow_step_executions(status);
CREATE INDEX idx_workflow_step_executions_started_at ON workflow_step_executions(started_at);

-- Workflow execution logs indexes
CREATE INDEX idx_workflow_execution_logs_execution_id ON workflow_execution_logs(execution_id);
CREATE INDEX idx_workflow_execution_logs_step_execution_id ON workflow_execution_logs(step_execution_id);
CREATE INDEX idx_workflow_execution_logs_level ON workflow_execution_logs(level);
CREATE INDEX idx_workflow_execution_logs_timestamp ON workflow_execution_logs(timestamp);

-- Workflow states indexes
CREATE INDEX idx_workflow_states_execution_id ON workflow_states(execution_id);
CREATE INDEX idx_workflow_states_workflow_id ON workflow_states(workflow_id);
CREATE INDEX idx_workflow_states_current_step ON workflow_states(current_step);
CREATE INDEX idx_workflow_states_last_updated ON workflow_states(last_updated);

-- Workflow state checkpoints indexes
CREATE INDEX idx_workflow_state_checkpoints_execution_id ON workflow_state_checkpoints(execution_id);
CREATE INDEX idx_workflow_state_checkpoints_step_id ON workflow_state_checkpoints(step_id);
CREATE INDEX idx_workflow_state_checkpoints_timestamp ON workflow_state_checkpoints(timestamp);

-- Workflow metrics indexes
CREATE INDEX idx_workflow_metrics_execution_id ON workflow_metrics(execution_id);
CREATE INDEX idx_workflow_metrics_workflow_id ON workflow_metrics(workflow_id);
CREATE INDEX idx_workflow_metrics_created_at ON workflow_metrics(created_at);

-- Workflow schedules indexes
CREATE INDEX idx_workflow_schedules_workflow_id ON workflow_schedules(workflow_id);
CREATE INDEX idx_workflow_schedules_enabled ON workflow_schedules(enabled);
CREATE INDEX idx_workflow_schedules_next_execution ON workflow_schedules(next_execution);

-- Create composite indexes for common query patterns
CREATE INDEX idx_workflow_executions_workflow_status ON workflow_executions(workflow_id, status);
CREATE INDEX idx_workflow_executions_triggered_by_started ON workflow_executions(triggered_by, started_at);
CREATE INDEX idx_workflow_step_executions_execution_status ON workflow_step_executions(execution_id, status);

-- Add triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_templates_updated_at BEFORE UPDATE ON workflow_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_schedules_updated_at BEFORE UPDATE ON workflow_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add trigger for automatic state updates
CREATE OR REPLACE FUNCTION update_workflow_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_workflow_states_timestamp BEFORE UPDATE ON workflow_states
    FOR EACH ROW EXECUTE FUNCTION update_workflow_state_timestamp();

-- Add comments for documentation
COMMENT ON TABLE workflows IS 'Stores workflow definitions and metadata';
COMMENT ON TABLE workflow_templates IS 'Stores reusable workflow templates';
COMMENT ON TABLE workflow_executions IS 'Tracks individual workflow execution instances';
COMMENT ON TABLE workflow_step_executions IS 'Tracks execution of individual workflow steps';
COMMENT ON TABLE workflow_execution_logs IS 'Stores detailed execution logs';
COMMENT ON TABLE workflow_states IS 'Manages current state of workflow executions';
COMMENT ON TABLE workflow_state_checkpoints IS 'Stores state checkpoints for recovery';
COMMENT ON TABLE workflow_metrics IS 'Stores performance and usage metrics';
COMMENT ON TABLE workflow_schedules IS 'Manages scheduled workflow executions';

-- Grant permissions (adjust as needed for your security model)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO workflow_service;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO workflow_service;
