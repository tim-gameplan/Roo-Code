-- Initial Database Setup for Roo-Code
-- Migration: 001_initial_setup.sql
-- Description: Creates initial database structure for the Roo-Code project

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create initial schema for application metadata
CREATE SCHEMA IF NOT EXISTS app_metadata;

-- Create a simple table to verify database setup
CREATE TABLE IF NOT EXISTS app_metadata.migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT
);

-- Insert this migration record
INSERT INTO app_metadata.migrations (migration_name, description) 
VALUES ('001_initial_setup', 'Initial database setup with extensions and metadata schema')
ON CONFLICT (migration_name) DO NOTHING;

-- Create a health check function
CREATE OR REPLACE FUNCTION app_metadata.health_check()
RETURNS TABLE(status TEXT, timestamp TIMESTAMP WITH TIME ZONE) AS $$
BEGIN
    RETURN QUERY SELECT 'healthy'::TEXT, NOW();
END;
$$ LANGUAGE plpgsql;

-- Log successful migration
DO $$
BEGIN
    RAISE NOTICE 'Migration 001_initial_setup completed successfully at %', NOW();
END $$;
