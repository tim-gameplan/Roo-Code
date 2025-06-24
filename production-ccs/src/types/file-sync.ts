/**
 * TASK-007.1.1.3: File Sync & Workspace Types
 * TypeScript type definitions for file synchronization and workspace management
 */

// =====================================================
// CORE TYPES
// =====================================================

export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error' | 'deleted';
export type ConflictResolution = 'local_wins' | 'remote_wins' | 'merge' | 'manual';
export type OperationType = 'create' | 'update' | 'delete' | 'move' | 'copy' | 'sync' | 'message';
export type ResourceType = 'file' | 'directory' | 'workspace' | 'conversation' | 'message';
export type OperationStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

// =====================================================
// WORKSPACE INTERFACES
// =====================================================

export interface Workspace {
  id: string;
  userId: string;
  name: string;
  path: string;
  settings: WorkspaceSettings;
  lastAccessed: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceSettings {
  syncEnabled?: boolean;
  autoSync?: boolean;
  syncInterval?: number; // minutes
  excludePatterns?: string[];
  includePatterns?: string[];
  maxFileSize?: number; // bytes
  conflictResolution?: ConflictResolution;
  notifications?: {
    syncComplete?: boolean;
    conflicts?: boolean;
    errors?: boolean;
  };
  compression?: {
    enabled?: boolean;
    level?: number;
  };
}

export interface WorkspaceSummary extends Workspace {
  fileCount: number;
  syncedFiles: number;
  pendingFiles: number;
  conflictFiles: number;
}

// =====================================================
// FILE SYNC STATE INTERFACES
// =====================================================

export interface FileSyncState {
  id: string;
  userId: string;
  workspaceId: string;
  filePath: string;
  fileHash: string;
  fileSize?: number;
  lastModified: Date;
  syncStatus: SyncStatus;
  conflictResolution?: ConflictResolution;
  metadata: FileSyncMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileSyncMetadata {
  mimeType?: string;
  encoding?: string;
  permissions?: string;
  isDirectory?: boolean;
  isSymlink?: boolean;
  linkTarget?: string;
  checksumAlgorithm?: string;
  compressionRatio?: number;
  lastSyncAttempt?: Date;
  syncAttempts?: number;
  conflictHistory?: ConflictHistoryEntry[];
  tags?: string[];
  customProperties?: Record<string, any>;
}

export interface ConflictHistoryEntry {
  timestamp: Date;
  resolution: ConflictResolution;
  localHash: string;
  remoteHash: string;
  resolvedHash: string;
  userId: string;
}

// =====================================================
// SYNC OPERATIONS INTERFACES
// =====================================================

export interface SyncOperation {
  id: string;
  userId: string;
  deviceId?: string;
  operationType: OperationType;
  resourceType: ResourceType;
  resourceId: string;
  operationData: SyncOperationData;
  status: OperationStatus;
  conflictData?: ConflictData;
  createdAt: Date;
  completedAt?: Date;
}

export interface SyncOperationData {
  source?: {
    path?: string;
    hash?: string;
    size?: number;
    lastModified?: Date;
  };
  target?: {
    path?: string;
    hash?: string;
    size?: number;
    lastModified?: Date;
  };
  changes?: {
    added?: string[];
    modified?: string[];
    deleted?: string[];
    moved?: Array<{ from: string; to: string }>;
  };
  metadata?: Record<string, any>;
  priority?: number;
  retryCount?: number;
  maxRetries?: number;
}

export interface ConflictData {
  type: 'content' | 'metadata' | 'permission' | 'existence';
  localVersion: {
    hash: string;
    lastModified: Date;
    size?: number;
  };
  remoteVersion: {
    hash: string;
    lastModified: Date;
    size?: number;
  };
  suggestedResolution?: ConflictResolution;
  userChoice?: ConflictResolution;
  resolvedAt?: Date;
  resolvedBy?: string;
}

// =====================================================
// OFFLINE OPERATIONS INTERFACES
// =====================================================

export interface OfflineOperation {
  id: string;
  userId: string;
  deviceId: string;
  operationType: OperationType;
  operationData: OfflineOperationData;
  createdAt: Date;
  retryCount: number;
  maxRetries: number;
  status: OperationStatus;
  errorMessage?: string;
  nextRetryAt?: Date;
}

export interface OfflineOperationData {
  workspaceId?: string;
  filePath?: string;
  content?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
  deviceInfo?: {
    platform: string;
    version: string;
    userAgent?: string;
  };
  networkInfo?: {
    online: boolean;
    connectionType?: string;
    effectiveType?: string;
  };
}

// =====================================================
// REQUEST/RESPONSE INTERFACES
// =====================================================

// Workspace Management
export interface CreateWorkspaceRequest {
  name: string;
  path: string;
  settings?: Partial<WorkspaceSettings>;
}

export interface UpdateWorkspaceRequest {
  name?: string;
  settings?: Partial<WorkspaceSettings>;
}

export interface WorkspaceListRequest {
  userId: string;
  includeStats?: boolean;
  sortBy?: 'name' | 'lastAccessed' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface WorkspaceListResponse {
  workspaces: WorkspaceSummary[];
  total: number;
  hasMore: boolean;
}

// File Sync Management
export interface SyncFileRequest {
  workspaceId: string;
  filePath: string;
  fileHash: string;
  fileSize?: number;
  lastModified: Date;
  content?: string;
  metadata?: Partial<FileSyncMetadata>;
}

export interface SyncFileResponse {
  syncState: FileSyncState;
  conflicts?: ConflictData[];
  requiresResolution?: boolean;
}

export interface GetSyncStateRequest {
  workspaceId: string;
  filePaths?: string[];
  syncStatus?: SyncStatus[];
  since?: Date;
  limit?: number;
  offset?: number;
}

export interface GetSyncStateResponse {
  syncStates: FileSyncState[];
  total: number;
  hasMore: boolean;
}

// Conflict Resolution
export interface ResolveConflictRequest {
  syncStateId: string;
  resolution: ConflictResolution;
  resolvedContent?: string;
  resolvedMetadata?: Partial<FileSyncMetadata>;
}

export interface ResolveConflictResponse {
  syncState: FileSyncState;
  success: boolean;
  message?: string;
}

// Sync Operations
export interface CreateSyncOperationRequest {
  operationType: OperationType;
  resourceType: ResourceType;
  resourceId: string;
  operationData: SyncOperationData;
  priority?: number;
}

export interface GetSyncOperationsRequest {
  userId: string;
  deviceId?: string;
  status?: OperationStatus[];
  operationType?: OperationType[];
  resourceType?: ResourceType[];
  since?: Date;
  limit?: number;
  offset?: number;
}

export interface GetSyncOperationsResponse {
  operations: SyncOperation[];
  total: number;
  hasMore: boolean;
}

// Offline Operations
export interface QueueOfflineOperationRequest {
  operationType: OperationType;
  operationData: OfflineOperationData;
  maxRetries?: number;
}

export interface GetOfflineOperationsRequest {
  userId: string;
  deviceId?: string;
  status?: OperationStatus[];
  readyForRetry?: boolean;
  limit?: number;
  offset?: number;
}

export interface GetOfflineOperationsResponse {
  operations: OfflineOperation[];
  total: number;
  hasMore: boolean;
}

// =====================================================
// SYNC EVENT INTERFACES
// =====================================================

export interface SyncEvent {
  id: string;
  type: SyncEventType;
  workspaceId: string;
  userId: string;
  deviceId?: string;
  data: SyncEventData;
  timestamp: Date;
}

export type SyncEventType =
  | 'file_changed'
  | 'file_deleted'
  | 'file_created'
  | 'file_moved'
  | 'sync_started'
  | 'sync_completed'
  | 'sync_failed'
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'workspace_created'
  | 'workspace_updated'
  | 'workspace_deleted';

export interface SyncEventData {
  filePath?: string;
  oldPath?: string;
  newPath?: string;
  syncStatus?: SyncStatus;
  conflictData?: ConflictData;
  operationId?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

// =====================================================
// UTILITY INTERFACES
// =====================================================

export interface SyncProgress {
  workspaceId: string;
  totalFiles: number;
  processedFiles: number;
  pendingFiles: number;
  conflictFiles: number;
  errorFiles: number;
  bytesTransferred: number;
  totalBytes: number;
  startTime: Date;
  estimatedCompletion?: Date;
  currentFile?: string;
  status: 'idle' | 'syncing' | 'paused' | 'completed' | 'error';
}

export interface SyncStatistics {
  workspaceId: string;
  period: 'hour' | 'day' | 'week' | 'month';
  filesSync: number;
  bytesTransferred: number;
  conflictsResolved: number;
  errorsEncountered: number;
  averageSyncTime: number;
  peakSyncTime: number;
  syncFrequency: number;
}

export interface DeviceSyncInfo {
  deviceId: string;
  deviceName: string;
  lastSyncAt?: Date;
  syncStatus: 'online' | 'offline' | 'syncing' | 'error';
  pendingOperations: number;
  conflictCount: number;
  version: string;
  capabilities: string[];
}

// =====================================================
// ERROR INTERFACES
// =====================================================

export interface SyncError extends Error {
  code: SyncErrorCode;
  workspaceId?: string;
  filePath?: string;
  operationId?: string;
  retryable: boolean;
  details?: Record<string, any>;
}

export type SyncErrorCode =
  | 'WORKSPACE_NOT_FOUND'
  | 'WORKSPACE_ALREADY_EXISTS'
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'CONFLICT_UNRESOLVED'
  | 'SYNC_IN_PROGRESS'
  | 'INVALID_FILE_HASH'
  | 'FILE_TOO_LARGE'
  | 'STORAGE_QUOTA_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'DEVICE_OFFLINE'
  | 'OPERATION_TIMEOUT'
  | 'INVALID_OPERATION'
  | 'CONCURRENT_MODIFICATION'
  | 'CHECKSUM_MISMATCH'
  | 'ENCODING_ERROR';

// =====================================================
// CONFIGURATION INTERFACES
// =====================================================

export interface SyncConfiguration {
  maxFileSize: number;
  maxWorkspaces: number;
  syncInterval: number;
  retryAttempts: number;
  retryDelay: number;
  conflictRetention: number; // days
  operationTimeout: number; // seconds
  batchSize: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  checksumAlgorithm: 'sha256' | 'md5' | 'blake2b';
  excludePatterns: string[];
  includePatterns: string[];
}

export interface SyncCapabilities {
  maxFileSize: number;
  supportedOperations: OperationType[];
  supportedResourceTypes: ResourceType[];
  conflictResolutionMethods: ConflictResolution[];
  compressionSupported: boolean;
  encryptionSupported: boolean;
  realtimeSyncSupported: boolean;
  offlineSyncSupported: boolean;
  version: string;
}

// =====================================================
// TYPE GUARDS
// =====================================================

export function isSyncStatus(value: string): value is SyncStatus {
  return ['synced', 'pending', 'conflict', 'error', 'deleted'].includes(value);
}

export function isConflictResolution(value: string): value is ConflictResolution {
  return ['local_wins', 'remote_wins', 'merge', 'manual'].includes(value);
}

export function isOperationType(value: string): value is OperationType {
  return ['create', 'update', 'delete', 'move', 'copy', 'sync', 'message'].includes(value);
}

export function isResourceType(value: string): value is ResourceType {
  return ['file', 'directory', 'workspace', 'conversation', 'message'].includes(value);
}

export function isOperationStatus(value: string): value is OperationStatus {
  return ['pending', 'processing', 'completed', 'failed', 'cancelled', 'expired'].includes(value);
}

export function isSyncEventType(value: string): value is SyncEventType {
  return [
    'file_changed',
    'file_deleted',
    'file_created',
    'file_moved',
    'sync_started',
    'sync_completed',
    'sync_failed',
    'conflict_detected',
    'conflict_resolved',
    'workspace_created',
    'workspace_updated',
    'workspace_deleted',
  ].includes(value);
}

// =====================================================
// UTILITY TYPES
// =====================================================

export type PartialWorkspace = Partial<Workspace>;
export type PartialFileSyncState = Partial<FileSyncState>;
export type PartialSyncOperation = Partial<SyncOperation>;
export type PartialOfflineOperation = Partial<OfflineOperation>;

export type WorkspaceWithoutTimestamps = Omit<
  Workspace,
  'createdAt' | 'updatedAt' | 'lastAccessed'
>;
export type FileSyncStateWithoutTimestamps = Omit<
  FileSyncState,
  'createdAt' | 'updatedAt' | 'lastModified'
>;

export type CreateWorkspaceData = Omit<
  Workspace,
  'id' | 'createdAt' | 'updatedAt' | 'lastAccessed'
>;
export type UpdateWorkspaceData = Partial<Pick<Workspace, 'name' | 'settings'>>;

export type CreateFileSyncStateData = Omit<FileSyncState, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateFileSyncStateData = Partial<
  Pick<
    FileSyncState,
    'fileHash' | 'fileSize' | 'lastModified' | 'syncStatus' | 'conflictResolution' | 'metadata'
  >
>;
