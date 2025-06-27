/**
 * TASK-007.1.1.3: File Sync & Workspace Service Tests
 * Comprehensive test suite for file synchronization and workspace management
 */

import { Pool } from 'pg';
import { FileSyncService } from '../services/file-sync';
import {
  Workspace,
  FileSyncState,
  SyncOperation,
  OfflineOperation,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  SyncFileRequest,
  ResolveConflictRequest,
  CreateSyncOperationRequest,
  QueueOfflineOperationRequest,
  SyncStatus,
  ConflictResolution,
  OperationType,
  ResourceType,
  OperationStatus,
} from '../types/file-sync';

// Mock database pool
const mockPool = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn(),
} as unknown as Pool;

// Mock client
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('FileSyncService', () => {
  let fileSyncService: FileSyncService;
  const testUserId = 'test-user-id';
  const testWorkspaceId = 'test-workspace-id';
  const testDeviceId = 'test-device-id';

  beforeEach(() => {
    jest.clearAllMocks();
    fileSyncService = new FileSyncService(mockPool);
    (mockPool.connect as jest.Mock).mockResolvedValue(mockClient);
  });

  describe('Workspace Management', () => {
    describe('createWorkspace', () => {
      it('should create a new workspace successfully', async () => {
        const request: CreateWorkspaceRequest = {
          name: 'Test Workspace',
          path: '/test/workspace',
          settings: {
            syncEnabled: true,
            autoSync: true,
          },
        };

        const mockWorkspaceRow = {
          id: testWorkspaceId,
          user_id: testUserId,
          name: request.name,
          path: request.path,
          settings: request.settings,
          last_accessed: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockClient.query
          .mockResolvedValueOnce({ rows: [] }) // Check existing
          .mockResolvedValueOnce({ rows: [mockWorkspaceRow] }); // Insert

        const result = await fileSyncService.createWorkspace(testUserId, request);

        expect(result).toMatchObject({
          id: testWorkspaceId,
          userId: testUserId,
          name: request.name,
          path: request.path,
          settings: request.settings,
        });

        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      });

      it('should throw error if workspace with same path exists', async () => {
        const request: CreateWorkspaceRequest = {
          name: 'Test Workspace',
          path: '/test/workspace',
        };

        mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] });

        await expect(fileSyncService.createWorkspace(testUserId, request)).rejects.toThrow(
          'Workspace with this path already exists'
        );

        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      });
    });

    describe('getWorkspace', () => {
      it('should return workspace if found', async () => {
        const mockWorkspaceRow = {
          id: testWorkspaceId,
          user_id: testUserId,
          name: 'Test Workspace',
          path: '/test/workspace',
          settings: {},
          last_accessed: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        };

        (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockWorkspaceRow] });

        const result = await fileSyncService.getWorkspace(testUserId, testWorkspaceId);

        expect(result).toMatchObject({
          id: testWorkspaceId,
          userId: testUserId,
          name: 'Test Workspace',
        });
      });

      it('should return null if workspace not found', async () => {
        (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

        const result = await fileSyncService.getWorkspace(testUserId, testWorkspaceId);

        expect(result).toBeNull();
      });
    });

    describe('updateWorkspace', () => {
      it('should update workspace successfully', async () => {
        const request: UpdateWorkspaceRequest = {
          name: 'Updated Workspace',
          settings: {
            syncEnabled: false,
          },
        };

        const existingWorkspace = {
          id: testWorkspaceId,
          user_id: testUserId,
          name: 'Old Name',
          path: '/test/workspace',
          settings: { syncEnabled: true },
          last_accessed: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        };

        const updatedWorkspace = {
          ...existingWorkspace,
          name: request.name,
          settings: { syncEnabled: false },
        };

        mockClient.query
          .mockResolvedValueOnce({ rows: [existingWorkspace] }) // Get existing
          .mockResolvedValueOnce({ rows: [updatedWorkspace] }); // Update

        const result = await fileSyncService.updateWorkspace(testUserId, testWorkspaceId, request);

        expect(result.name).toBe(request.name);
        expect(result.settings.syncEnabled).toBe(false);
      });

      it('should throw error if workspace not found', async () => {
        const request: UpdateWorkspaceRequest = {
          name: 'Updated Workspace',
        };

        mockClient.query.mockResolvedValueOnce({ rows: [] });

        await expect(
          fileSyncService.updateWorkspace(testUserId, testWorkspaceId, request)
        ).rejects.toThrow('Workspace not found');
      });
    });

    describe('deleteWorkspace', () => {
      it('should delete workspace successfully', async () => {
        mockClient.query
          .mockResolvedValueOnce({ rows: [{ id: testWorkspaceId }] }) // Check exists
          .mockResolvedValueOnce({ rows: [] }); // Delete

        await fileSyncService.deleteWorkspace(testUserId, testWorkspaceId);

        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      });

      it('should throw error if workspace not found', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [] });

        await expect(fileSyncService.deleteWorkspace(testUserId, testWorkspaceId)).rejects.toThrow(
          'Workspace not found'
        );
      });
    });

    describe('listWorkspaces', () => {
      it('should list workspaces with stats', async () => {
        const mockWorkspaces = [
          {
            id: testWorkspaceId,
            user_id: testUserId,
            name: 'Workspace 1',
            path: '/test/workspace1',
            settings: {},
            last_accessed: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
            file_count: 10,
            synced_files: 8,
            pending_files: 1,
            conflict_files: 1,
          },
        ];

        (mockPool.query as jest.Mock)
          .mockResolvedValueOnce({ rows: mockWorkspaces })
          .mockResolvedValueOnce({ rows: [{ count: '1' }] });

        const result = await fileSyncService.listWorkspaces({
          userId: testUserId,
          includeStats: true,
        });

        expect(result.workspaces).toHaveLength(1);
        expect(result.workspaces[0]?.fileCount).toBe(10);
        expect(result.total).toBe(1);
        expect(result.hasMore).toBe(false);
      });
    });
  });

  describe('File Sync Management', () => {
    describe('syncFile', () => {
      it('should sync new file successfully', async () => {
        const request: SyncFileRequest = {
          workspaceId: testWorkspaceId,
          filePath: '/test/file.txt',
          fileHash: 'abc123',
          fileSize: 1024,
          lastModified: new Date(),
          metadata: {
            mimeType: 'text/plain',
          },
        };

        const mockSyncState = {
          id: 'sync-state-id',
          user_id: testUserId,
          workspace_id: testWorkspaceId,
          file_path: request.filePath,
          file_hash: request.fileHash,
          file_size: request.fileSize,
          last_modified: request.lastModified,
          sync_status: 'synced',
          conflict_resolution: null,
          metadata: request.metadata,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockClient.query
          .mockResolvedValueOnce({ rows: [{ id: testWorkspaceId }] }) // Check workspace
          .mockResolvedValueOnce({ rows: [] }) // Check existing file
          .mockResolvedValueOnce({ rows: [mockSyncState] }); // Insert new

        const result = await fileSyncService.syncFile(testUserId, request);

        expect(result.syncState.filePath).toBe(request.filePath);
        expect(result.syncState.syncStatus).toBe('synced');
        expect(result.requiresResolution).toBe(false);
        expect(result.conflicts).toBeUndefined();
      });

      it('should detect conflict when file hashes differ', async () => {
        const request: SyncFileRequest = {
          workspaceId: testWorkspaceId,
          filePath: '/test/file.txt',
          fileHash: 'new-hash',
          fileSize: 1024,
          lastModified: new Date(),
        };

        const existingFile = {
          id: 'sync-state-id',
          user_id: testUserId,
          workspace_id: testWorkspaceId,
          file_path: request.filePath,
          file_hash: 'old-hash',
          file_size: 512,
          last_modified: new Date(Date.now() - 1000),
          sync_status: 'synced',
          conflict_resolution: null,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        };

        const conflictState = {
          ...existingFile,
          sync_status: 'conflict',
        };

        mockClient.query
          .mockResolvedValueOnce({ rows: [{ id: testWorkspaceId }] }) // Check workspace
          .mockResolvedValueOnce({ rows: [existingFile] }) // Check existing file
          .mockResolvedValueOnce({ rows: [conflictState] }); // Update to conflict

        const result = await fileSyncService.syncFile(testUserId, request);

        expect(result.syncState.syncStatus).toBe('conflict');
        expect(result.requiresResolution).toBe(true);
        expect(result.conflicts).toHaveLength(1);
        expect(result.conflicts![0]?.type).toBe('content');
      });

      it('should throw error if workspace not found', async () => {
        const request: SyncFileRequest = {
          workspaceId: testWorkspaceId,
          filePath: '/test/file.txt',
          fileHash: 'abc123',
          lastModified: new Date(),
        };

        mockClient.query.mockResolvedValueOnce({ rows: [] });

        await expect(fileSyncService.syncFile(testUserId, request)).rejects.toThrow(
          'Workspace not found'
        );
      });
    });

    describe('getSyncState', () => {
      it('should get sync states with filters', async () => {
        const mockSyncStates = [
          {
            id: 'sync-state-1',
            user_id: testUserId,
            workspace_id: testWorkspaceId,
            file_path: '/test/file1.txt',
            file_hash: 'hash1',
            file_size: 1024,
            last_modified: new Date(),
            sync_status: 'synced',
            conflict_resolution: null,
            metadata: {},
            created_at: new Date(),
            updated_at: new Date(),
          },
        ];

        (mockPool.query as jest.Mock)
          .mockResolvedValueOnce({ rows: mockSyncStates })
          .mockResolvedValueOnce({ rows: [{ count: '1' }] });

        const result = await fileSyncService.getSyncState(testUserId, {
          workspaceId: testWorkspaceId,
          syncStatus: ['synced'],
          limit: 10,
        });

        expect(result.syncStates).toHaveLength(1);
        expect(result.total).toBe(1);
        expect(result.hasMore).toBe(false);
      });
    });

    describe('resolveConflict', () => {
      it('should resolve conflict successfully', async () => {
        const request: ResolveConflictRequest = {
          syncStateId: 'sync-state-id',
          resolution: 'local_wins',
          resolvedMetadata: {
            mimeType: 'text/plain',
          },
        };

        const conflictState = {
          id: 'sync-state-id',
          user_id: testUserId,
          workspace_id: testWorkspaceId,
          file_path: '/test/file.txt',
          file_hash: 'hash',
          file_size: 1024,
          last_modified: new Date(),
          sync_status: 'conflict',
          conflict_resolution: null,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        };

        const resolvedState = {
          ...conflictState,
          sync_status: 'synced',
          conflict_resolution: 'local_wins',
        };

        mockClient.query
          .mockResolvedValueOnce({ rows: [conflictState] }) // Get sync state
          .mockResolvedValueOnce({ rows: [resolvedState] }); // Update resolution

        const result = await fileSyncService.resolveConflict(testUserId, request);

        expect(result.success).toBe(true);
        expect(result.syncState.syncStatus).toBe('synced');
        expect(result.syncState.conflictResolution).toBe('local_wins');
      });

      it('should throw error if file not in conflict state', async () => {
        const request: ResolveConflictRequest = {
          syncStateId: 'sync-state-id',
          resolution: 'local_wins',
        };

        const syncState = {
          id: 'sync-state-id',
          user_id: testUserId,
          workspace_id: testWorkspaceId,
          file_path: '/test/file.txt',
          file_hash: 'hash',
          file_size: 1024,
          last_modified: new Date(),
          sync_status: 'synced', // Not in conflict
          conflict_resolution: null,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockClient.query.mockResolvedValueOnce({ rows: [syncState] });

        await expect(fileSyncService.resolveConflict(testUserId, request)).rejects.toThrow(
          'File is not in conflict state'
        );
      });
    });
  });

  describe('Sync Operations Management', () => {
    describe('createSyncOperation', () => {
      it('should create sync operation successfully', async () => {
        const request: CreateSyncOperationRequest = {
          operationType: 'sync',
          resourceType: 'file',
          resourceId: 'file-id',
          operationData: {
            source: {
              path: '/test/file.txt',
              hash: 'abc123',
            },
          },
        };

        const mockOperation = {
          id: 'operation-id',
          user_id: testUserId,
          device_id: testDeviceId,
          operation_type: request.operationType,
          resource_type: request.resourceType,
          resource_id: request.resourceId,
          operation_data: request.operationData,
          status: 'pending',
          conflict_data: null,
          created_at: new Date(),
          completed_at: null,
        };

        (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockOperation] });

        const result = await fileSyncService.createSyncOperation(testUserId, request);

        expect(result.operationType).toBe(request.operationType);
        expect(result.resourceType).toBe(request.resourceType);
        expect(result.status).toBe('pending');
      });
    });

    describe('getSyncOperations', () => {
      it('should get sync operations with filters', async () => {
        const mockOperations = [
          {
            id: 'operation-1',
            user_id: testUserId,
            device_id: testDeviceId,
            operation_type: 'sync',
            resource_type: 'file',
            resource_id: 'file-1',
            operation_data: {},
            status: 'completed',
            conflict_data: null,
            created_at: new Date(),
            completed_at: new Date(),
          },
        ];

        (mockPool.query as jest.Mock)
          .mockResolvedValueOnce({ rows: mockOperations })
          .mockResolvedValueOnce({ rows: [{ count: '1' }] });

        const result = await fileSyncService.getSyncOperations({
          userId: testUserId,
          deviceId: testDeviceId,
          status: ['completed'],
        });

        expect(result.operations).toHaveLength(1);
        expect(result.total).toBe(1);
        expect(result.hasMore).toBe(false);
      });
    });
  });

  describe('Offline Operations Management', () => {
    describe('queueOfflineOperation', () => {
      it('should queue offline operation successfully', async () => {
        const request: QueueOfflineOperationRequest = {
          operationType: 'sync',
          operationData: {
            workspaceId: testWorkspaceId,
            filePath: '/test/file.txt',
            timestamp: new Date(),
          },
          maxRetries: 5,
        };

        const mockOperation = {
          id: 'offline-operation-id',
          user_id: testUserId,
          device_id: testDeviceId,
          operation_type: request.operationType,
          operation_data: request.operationData,
          created_at: new Date(),
          retry_count: 0,
          max_retries: request.maxRetries,
          status: 'pending',
          error_message: null,
          next_retry_at: null,
        };

        (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockOperation] });

        const result = await fileSyncService.queueOfflineOperation(
          testUserId,
          testDeviceId,
          request
        );

        expect(result.operationType).toBe(request.operationType);
        expect(result.maxRetries).toBe(request.maxRetries);
        expect(result.status).toBe('pending');
      });
    });

    describe('getOfflineOperations', () => {
      it('should get offline operations with filters', async () => {
        const mockOperations = [
          {
            id: 'offline-operation-1',
            user_id: testUserId,
            device_id: testDeviceId,
            operation_type: 'sync',
            operation_data: {},
            created_at: new Date(),
            retry_count: 0,
            max_retries: 3,
            status: 'pending',
            error_message: null,
            next_retry_at: null,
          },
        ];

        (mockPool.query as jest.Mock)
          .mockResolvedValueOnce({ rows: mockOperations })
          .mockResolvedValueOnce({ rows: [{ count: '1' }] });

        const result = await fileSyncService.getOfflineOperations({
          userId: testUserId,
          deviceId: testDeviceId,
          status: ['pending'],
        });

        expect(result.operations).toHaveLength(1);
        expect(result.total).toBe(1);
        expect(result.hasMore).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      (mockPool.connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      await expect(
        fileSyncService.createWorkspace(testUserId, {
          name: 'Test',
          path: '/test',
        })
      ).rejects.toThrow('Connection failed');
    });

    it('should rollback transaction on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // Query fails

      await expect(
        fileSyncService.createWorkspace(testUserId, {
          name: 'Test',
          path: '/test',
        })
      ).rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
});
