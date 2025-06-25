/**
 * TASK-007.1.1.3: File Sync & Workspace Service
 * Service implementation for file synchronization and workspace management
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import {
  Workspace,
  WorkspaceSettings,
  WorkspaceSummary,
  FileSyncState,
  FileSyncMetadata,
  SyncOperation,
  SyncOperationData,
  OfflineOperation,
  OfflineOperationData,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  WorkspaceListRequest,
  WorkspaceListResponse,
  SyncFileRequest,
  SyncFileResponse,
  GetSyncStateRequest,
  GetSyncStateResponse,
  ResolveConflictRequest,
  ResolveConflictResponse,
  CreateSyncOperationRequest,
  GetSyncOperationsRequest,
  GetSyncOperationsResponse,
  QueueOfflineOperationRequest,
  GetOfflineOperationsRequest,
  GetOfflineOperationsResponse,
  SyncStatus,
  ConflictResolution,
  OperationType,
  ResourceType,
  OperationStatus,
  SyncError,
  SyncErrorCode,
  SyncProgress,
  DeviceSyncInfo,
  ConflictData,
  isSyncStatus,
  isConflictResolution,
  isOperationType,
  isResourceType,
  isOperationStatus,
} from '../types/file-sync';

export class FileSyncService {
  private db: Pool;

  constructor(database: Pool) {
    this.db = database;
  }

  // =====================================================
  // WORKSPACE MANAGEMENT
  // =====================================================

  async createWorkspace(userId: string, request: CreateWorkspaceRequest): Promise<Workspace> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Check if workspace with same path already exists for user
      const existingResult = await client.query(
        'SELECT id FROM workspaces WHERE user_id = $1 AND path = $2',
        [userId, request.path]
      );

      if (existingResult.rows.length > 0) {
        throw this.createSyncError(
          'WORKSPACE_ALREADY_EXISTS',
          'Workspace with this path already exists'
        );
      }

      // Create workspace
      const workspaceResult = await client.query(
        `INSERT INTO workspaces (user_id, name, path, settings)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, request.name, request.path, JSON.stringify(request.settings || {})]
      );

      await client.query('COMMIT');

      const workspace = this.mapWorkspaceFromDb(workspaceResult.rows[0]);

      logger.info('Workspace created', {
        workspaceId: workspace.id,
        userId,
        name: workspace.name,
        path: workspace.path,
      });

      return workspace;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create workspace', { error, userId, request });
      throw error;
    } finally {
      client.release();
    }
  }

  async getWorkspace(userId: string, workspaceId: string): Promise<Workspace | null> {
    const result = await this.db.query('SELECT * FROM workspaces WHERE id = $1 AND user_id = $2', [
      workspaceId,
      userId,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapWorkspaceFromDb(result.rows[0]);
  }

  async updateWorkspace(
    userId: string,
    workspaceId: string,
    request: UpdateWorkspaceRequest
  ): Promise<Workspace> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Check workspace exists and belongs to user
      const existingResult = await client.query(
        'SELECT * FROM workspaces WHERE id = $1 AND user_id = $2',
        [workspaceId, userId]
      );

      if (existingResult.rows.length === 0) {
        throw this.createSyncError('WORKSPACE_NOT_FOUND', 'Workspace not found');
      }

      const existing = this.mapWorkspaceFromDb(existingResult.rows[0]);

      // Merge settings if provided
      const updatedSettings = request.settings
        ? { ...existing.settings, ...request.settings }
        : existing.settings;

      // Update workspace
      const updateResult = await client.query(
        `UPDATE workspaces 
         SET name = COALESCE($3, name), 
             settings = $4,
             updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [workspaceId, userId, request.name, JSON.stringify(updatedSettings)]
      );

      await client.query('COMMIT');

      const workspace = this.mapWorkspaceFromDb(updateResult.rows[0]);

      logger.info('Workspace updated', {
        workspaceId,
        userId,
        changes: request,
      });

      return workspace;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to update workspace', { error, userId, workspaceId, request });
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteWorkspace(userId: string, workspaceId: string): Promise<void> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Check workspace exists and belongs to user
      const existingResult = await client.query(
        'SELECT id FROM workspaces WHERE id = $1 AND user_id = $2',
        [workspaceId, userId]
      );

      if (existingResult.rows.length === 0) {
        throw this.createSyncError('WORKSPACE_NOT_FOUND', 'Workspace not found');
      }

      // Delete workspace (cascades to file_sync_state)
      await client.query('DELETE FROM workspaces WHERE id = $1 AND user_id = $2', [
        workspaceId,
        userId,
      ]);

      await client.query('COMMIT');

      logger.info('Workspace deleted', { workspaceId, userId });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to delete workspace', { error, userId, workspaceId });
      throw error;
    } finally {
      client.release();
    }
  }

  async listWorkspaces(request: WorkspaceListRequest): Promise<WorkspaceListResponse> {
    const {
      userId,
      includeStats = false,
      sortBy = 'lastAccessed',
      sortOrder = 'desc',
      limit = 50,
      offset = 0,
    } = request;

    const orderClause = `ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;

    if (includeStats) {
      // Use workspace_summary view for stats
      const result = await this.db.query(
        `SELECT * FROM workspace_summary 
         WHERE user_id = $1 
         ${orderClause}
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      const countResult = await this.db.query(
        'SELECT COUNT(*) FROM workspaces WHERE user_id = $1',
        [userId]
      );

      const total = parseInt(countResult.rows[0].count);
      const workspaces = result.rows.map((row) => this.mapWorkspaceSummaryFromDb(row));

      return {
        workspaces,
        total,
        hasMore: offset + workspaces.length < total,
      };
    } else {
      // Simple workspace list
      const result = await this.db.query(
        `SELECT * FROM workspaces 
         WHERE user_id = $1 
         ${orderClause}
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      const countResult = await this.db.query(
        'SELECT COUNT(*) FROM workspaces WHERE user_id = $1',
        [userId]
      );

      const total = parseInt(countResult.rows[0].count);
      const workspaces = result.rows.map((row) => ({
        ...this.mapWorkspaceFromDb(row),
        fileCount: 0,
        syncedFiles: 0,
        pendingFiles: 0,
        conflictFiles: 0,
      }));

      return {
        workspaces,
        total,
        hasMore: offset + workspaces.length < total,
      };
    }
  }

  // =====================================================
  // FILE SYNC MANAGEMENT
  // =====================================================

  async syncFile(userId: string, request: SyncFileRequest): Promise<SyncFileResponse> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Verify workspace exists and belongs to user
      const workspaceResult = await client.query(
        'SELECT id FROM workspaces WHERE id = $1 AND user_id = $2',
        [request.workspaceId, userId]
      );

      if (workspaceResult.rows.length === 0) {
        throw this.createSyncError('WORKSPACE_NOT_FOUND', 'Workspace not found');
      }

      // Check for existing file sync state
      const existingResult = await client.query(
        'SELECT * FROM file_sync_state WHERE user_id = $1 AND workspace_id = $2 AND file_path = $3',
        [userId, request.workspaceId, request.filePath]
      );

      let syncState: FileSyncState;
      let conflicts: any[] = [];
      let requiresResolution = false;

      if (existingResult.rows.length > 0) {
        // File exists - check for conflicts
        const existing = this.mapFileSyncStateFromDb(existingResult.rows[0]);

        if (existing.fileHash !== request.fileHash && existing.syncStatus === 'synced') {
          // Conflict detected
          conflicts.push({
            type: 'content',
            localVersion: {
              hash: request.fileHash,
              lastModified: request.lastModified,
              size: request.fileSize,
            },
            remoteVersion: {
              hash: existing.fileHash,
              lastModified: existing.lastModified,
              size: existing.fileSize,
            },
            suggestedResolution: 'manual',
          });

          requiresResolution = true;

          // Update to conflict status
          const updateResult = await client.query(
            `UPDATE file_sync_state 
             SET sync_status = 'conflict', 
                 metadata = $4,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [existing.id, JSON.stringify({ ...existing.metadata, ...request.metadata })]
          );

          syncState = this.mapFileSyncStateFromDb(updateResult.rows[0]);
        } else {
          // Update existing file
          const updateResult = await client.query(
            `UPDATE file_sync_state 
             SET file_hash = $4, 
                 file_size = $5, 
                 last_modified = $6, 
                 sync_status = $7,
                 metadata = $8,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [
              existing.id,
              request.fileHash,
              request.fileSize,
              request.lastModified,
              'synced',
              JSON.stringify({ ...existing.metadata, ...request.metadata }),
            ]
          );

          syncState = this.mapFileSyncStateFromDb(updateResult.rows[0]);
        }
      } else {
        // Create new file sync state
        const insertResult = await client.query(
          `INSERT INTO file_sync_state 
           (user_id, workspace_id, file_path, file_hash, file_size, last_modified, sync_status, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            userId,
            request.workspaceId,
            request.filePath,
            request.fileHash,
            request.fileSize,
            request.lastModified,
            'synced',
            JSON.stringify(request.metadata || {}),
          ]
        );

        syncState = this.mapFileSyncStateFromDb(insertResult.rows[0]);
      }

      await client.query('COMMIT');

      logger.info('File sync completed', {
        userId,
        workspaceId: request.workspaceId,
        filePath: request.filePath,
        syncStatus: syncState.syncStatus,
        hasConflicts: conflicts.length > 0,
      });

      const response: SyncFileResponse = {
        syncState,
        requiresResolution,
      };

      if (conflicts.length > 0) {
        response.conflicts = conflicts as ConflictData[];
      }

      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to sync file', { error, userId, request });
      throw error;
    } finally {
      client.release();
    }
  }

  async getSyncState(userId: string, request: GetSyncStateRequest): Promise<GetSyncStateResponse> {
    const { workspaceId, filePaths, syncStatus, since, limit = 100, offset = 0 } = request;

    let query = `
      SELECT * FROM file_sync_state 
      WHERE user_id = $1 AND workspace_id = $2
    `;
    const params: any[] = [userId, workspaceId];
    let paramIndex = 3;

    // Add file paths filter
    if (filePaths && filePaths.length > 0) {
      query += ` AND file_path = ANY($${paramIndex})`;
      params.push(filePaths);
      paramIndex++;
    }

    // Add sync status filter
    if (syncStatus && syncStatus.length > 0) {
      query += ` AND sync_status = ANY($${paramIndex})`;
      params.push(syncStatus);
      paramIndex++;
    }

    // Add since filter
    if (since) {
      query += ` AND updated_at >= $${paramIndex}`;
      params.push(since);
      paramIndex++;
    }

    query += ` ORDER BY updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) FROM file_sync_state 
      WHERE user_id = $1 AND workspace_id = $2
    `;
    const countParams = [userId, workspaceId];
    let countParamIndex = 3;

    if (filePaths && filePaths.length > 0) {
      countQuery += ` AND file_path = ANY($${countParamIndex})`;
      countParams.push(filePaths as any);
      countParamIndex++;
    }

    if (syncStatus && syncStatus.length > 0) {
      countQuery += ` AND sync_status = ANY($${countParamIndex})`;
      countParams.push(syncStatus as any);
      countParamIndex++;
    }

    if (since) {
      countQuery += ` AND updated_at >= $${countParamIndex}`;
      countParams.push(since as any);
    }

    const countResult = await this.db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    const syncStates = result.rows.map((row) => this.mapFileSyncStateFromDb(row));

    return {
      syncStates,
      total,
      hasMore: offset + syncStates.length < total,
    };
  }

  async resolveConflict(
    userId: string,
    request: ResolveConflictRequest
  ): Promise<ResolveConflictResponse> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Get sync state
      const syncStateResult = await client.query(
        'SELECT * FROM file_sync_state WHERE id = $1 AND user_id = $2',
        [request.syncStateId, userId]
      );

      if (syncStateResult.rows.length === 0) {
        throw this.createSyncError('FILE_NOT_FOUND', 'File sync state not found');
      }

      const syncState = this.mapFileSyncStateFromDb(syncStateResult.rows[0]);

      if (syncState.syncStatus !== 'conflict') {
        throw this.createSyncError('INVALID_OPERATION', 'File is not in conflict state');
      }

      // Update sync state with resolution
      const updatedMetadata = request.resolvedMetadata
        ? { ...syncState.metadata, ...request.resolvedMetadata }
        : syncState.metadata;

      const updateResult = await client.query(
        `UPDATE file_sync_state 
         SET sync_status = 'synced',
             conflict_resolution = $3,
             metadata = $4,
             updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [request.syncStateId, userId, request.resolution, JSON.stringify(updatedMetadata)]
      );

      await client.query('COMMIT');

      const resolvedSyncState = this.mapFileSyncStateFromDb(updateResult.rows[0]);

      logger.info('Conflict resolved', {
        userId,
        syncStateId: request.syncStateId,
        resolution: request.resolution,
      });

      return {
        syncState: resolvedSyncState,
        success: true,
        message: 'Conflict resolved successfully',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to resolve conflict', { error, userId, request });
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================
  // SYNC OPERATIONS MANAGEMENT
  // =====================================================

  async createSyncOperation(
    userId: string,
    request: CreateSyncOperationRequest
  ): Promise<SyncOperation> {
    const result = await this.db.query(
      `INSERT INTO sync_operations 
       (user_id, operation_type, resource_type, resource_id, operation_data)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        userId,
        request.operationType,
        request.resourceType,
        request.resourceId,
        JSON.stringify(request.operationData),
      ]
    );

    const operation = this.mapSyncOperationFromDb(result.rows[0]);

    logger.info('Sync operation created', {
      operationId: operation.id,
      userId,
      operationType: operation.operationType,
      resourceType: operation.resourceType,
    });

    return operation;
  }

  async getSyncOperations(request: GetSyncOperationsRequest): Promise<GetSyncOperationsResponse> {
    const {
      userId,
      deviceId,
      status,
      operationType,
      resourceType,
      since,
      limit = 100,
      offset = 0,
    } = request;

    let query = 'SELECT * FROM sync_operations WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (deviceId) {
      query += ` AND device_id = $${paramIndex}`;
      params.push(deviceId);
      paramIndex++;
    }

    if (status && status.length > 0) {
      query += ` AND status = ANY($${paramIndex})`;
      params.push(status);
      paramIndex++;
    }

    if (operationType && operationType.length > 0) {
      query += ` AND operation_type = ANY($${paramIndex})`;
      params.push(operationType);
      paramIndex++;
    }

    if (resourceType && resourceType.length > 0) {
      query += ` AND resource_type = ANY($${paramIndex})`;
      params.push(resourceType);
      paramIndex++;
    }

    if (since) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(since);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM sync_operations WHERE user_id = $1';
    const countParams = [userId];
    let countParamIndex = 2;

    if (deviceId) {
      countQuery += ` AND device_id = $${countParamIndex}`;
      countParams.push(deviceId);
      countParamIndex++;
    }

    if (status && status.length > 0) {
      countQuery += ` AND status = ANY($${countParamIndex})`;
      countParams.push(status as any);
      countParamIndex++;
    }

    if (operationType && operationType.length > 0) {
      countQuery += ` AND operation_type = ANY($${countParamIndex})`;
      countParams.push(operationType as any);
      countParamIndex++;
    }

    if (resourceType && resourceType.length > 0) {
      countQuery += ` AND resource_type = ANY($${countParamIndex})`;
      countParams.push(resourceType as any);
      countParamIndex++;
    }

    if (since) {
      countQuery += ` AND created_at >= $${countParamIndex}`;
      countParams.push(since as any);
    }

    const countResult = await this.db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    const operations = result.rows.map((row) => this.mapSyncOperationFromDb(row));

    return {
      operations,
      total,
      hasMore: offset + operations.length < total,
    };
  }

  // =====================================================
  // OFFLINE OPERATIONS MANAGEMENT
  // =====================================================

  async queueOfflineOperation(
    userId: string,
    deviceId: string,
    request: QueueOfflineOperationRequest
  ): Promise<OfflineOperation> {
    const result = await this.db.query(
      `INSERT INTO offline_operations 
       (user_id, device_id, operation_type, operation_data, max_retries)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        userId,
        deviceId,
        request.operationType,
        JSON.stringify(request.operationData),
        request.maxRetries || 3,
      ]
    );

    const operation = this.mapOfflineOperationFromDb(result.rows[0]);

    logger.info('Offline operation queued', {
      operationId: operation.id,
      userId,
      deviceId,
      operationType: operation.operationType,
    });

    return operation;
  }

  async getOfflineOperations(
    request: GetOfflineOperationsRequest
  ): Promise<GetOfflineOperationsResponse> {
    const { userId, deviceId, status, readyForRetry = false, limit = 100, offset = 0 } = request;

    let query = 'SELECT * FROM offline_operations WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (deviceId) {
      query += ` AND device_id = $${paramIndex}`;
      params.push(deviceId);
      paramIndex++;
    }

    if (status && status.length > 0) {
      query += ` AND status = ANY($${paramIndex})`;
      params.push(status);
      paramIndex++;
    }

    if (readyForRetry) {
      query += ` AND status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= NOW())`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM offline_operations WHERE user_id = $1';
    const countParams = [userId];
    let countParamIndex = 2;

    if (deviceId) {
      countQuery += ` AND device_id = $${countParamIndex}`;
      countParams.push(deviceId);
      countParamIndex++;
    }

    if (status && status.length > 0) {
      countQuery += ` AND status = ANY($${countParamIndex})`;
      countParams.push(status as any);
      countParamIndex++;
    }

    if (readyForRetry) {
      countQuery += ` AND status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= NOW())`;
    }

    const countResult = await this.db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    const operations = result.rows.map((row) => this.mapOfflineOperationFromDb(row));

    return {
      operations,
      total,
      hasMore: offset + operations.length < total,
    };
  }

  // =====================================================
  // UTILITY METHODS
  // =====================================================

  private createSyncError(
    code: SyncErrorCode,
    message: string,
    details?: Record<string, any>
  ): SyncError {
    const error = new Error(message) as SyncError;
    error.code = code;
    error.retryable = this.isRetryableError(code);
    if (details) {
      error.details = details;
    }
    return error;
  }

  private isRetryableError(code: SyncErrorCode): boolean {
    const retryableCodes: SyncErrorCode[] = [
      'NETWORK_ERROR',
      'DEVICE_OFFLINE',
      'OPERATION_TIMEOUT',
      'CONCURRENT_MODIFICATION',
    ];
    return retryableCodes.includes(code);
  }

  private mapWorkspaceFromDb(row: any): Workspace {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      path: row.path,
      settings: row.settings || {},
      lastAccessed: new Date(row.last_accessed),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapWorkspaceSummaryFromDb(row: any): WorkspaceSummary {
    return {
      ...this.mapWorkspaceFromDb(row),
      fileCount: parseInt(row.file_count) || 0,
      syncedFiles: parseInt(row.synced_files) || 0,
      pendingFiles: parseInt(row.pending_files) || 0,
      conflictFiles: parseInt(row.conflict_files) || 0,
    };
  }

  private mapFileSyncStateFromDb(row: any): FileSyncState {
    return {
      id: row.id,
      userId: row.user_id,
      workspaceId: row.workspace_id,
      filePath: row.file_path,
      fileHash: row.file_hash,
      fileSize: row.file_size,
      lastModified: new Date(row.last_modified),
      syncStatus: row.sync_status as SyncStatus,
      conflictResolution: row.conflict_resolution as ConflictResolution,
      metadata: (row.metadata || {}) as FileSyncMetadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapSyncOperationFromDb(row: any): SyncOperation {
    const operation: SyncOperation = {
      id: row.id,
      userId: row.user_id,
      deviceId: row.device_id,
      operationType: row.operation_type as OperationType,
      resourceType: row.resource_type as ResourceType,
      resourceId: row.resource_id,
      operationData: row.operation_data || ({} as SyncOperationData),
      status: row.status as OperationStatus,
      conflictData: row.conflict_data,
      createdAt: new Date(row.created_at),
    };

    if (row.completed_at) {
      operation.completedAt = new Date(row.completed_at);
    }

    return operation;
  }

  private mapOfflineOperationFromDb(row: any): OfflineOperation {
    const operation: OfflineOperation = {
      id: row.id,
      userId: row.user_id,
      deviceId: row.device_id,
      operationType: row.operation_type as OperationType,
      operationData: row.operation_data || ({} as OfflineOperationData),
      createdAt: new Date(row.created_at),
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      status: row.status as OperationStatus,
      errorMessage: row.error_message,
    };

    if (row.next_retry_at) {
      operation.nextRetryAt = new Date(row.next_retry_at);
    }

    return operation;
  }
}
