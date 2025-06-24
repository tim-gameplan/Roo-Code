/**
 * File Management Types
 * Comprehensive type definitions for file upload, download, and management operations
 */

export interface FileMetadata {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  checksum: string;
  uploadedAt: Date;
  uploadedBy: string;
  conversationId?: string;
  workspaceId?: string;
  isPublic: boolean;
  downloadCount: number;
  lastAccessedAt?: Date;
  expiresAt?: Date;
  tags?: string[];
  description?: string;
}

export interface FileUploadRequest {
  file: Buffer | ReadableStream;
  filename: string;
  mimeType: string;
  size: number;
  conversationId?: string;
  workspaceId?: string;
  isPublic?: boolean;
  description?: string;
  tags?: string[];
  expiresAt?: Date;
}

export interface FileUploadResponse {
  fileId: string;
  filename: string;
  size: number;
  mimeType: string;
  uploadUrl?: string;
  downloadUrl: string;
  checksum: string;
  uploadedAt: Date;
  expiresAt?: Date;
}

export interface FileDownloadRequest {
  fileId: string;
  range?: {
    start: number;
    end: number;
  };
  userId: string;
}

export interface FileDownloadResponse {
  stream: ReadableStream;
  metadata: FileMetadata;
  contentLength: number;
  contentRange?: string;
  etag: string;
  lastModified: Date;
}

export interface FileChunk {
  chunkId: string;
  fileId: string;
  chunkNumber: number;
  totalChunks: number;
  data: Buffer;
  size: number;
  checksum: string;
}

export interface FileUploadProgress {
  fileId: string;
  filename: string;
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
  speed: number; // bytes per second
  estimatedTimeRemaining: number; // seconds
  status: 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';
  error?: string;
}

export interface FileThumbnail {
  fileId: string;
  thumbnailId: string;
  size: 'small' | 'medium' | 'large';
  width: number;
  height: number;
  mimeType: string;
  data: Buffer;
  generatedAt: Date;
}

export interface FilePermission {
  fileId: string;
  userId: string;
  permission: 'read' | 'write' | 'delete' | 'share';
  grantedBy: string;
  grantedAt: Date;
  expiresAt?: Date;
}

export interface FileShareLink {
  id: string;
  fileId: string;
  token: string;
  createdBy: string;
  createdAt: Date;
  expiresAt?: Date;
  downloadLimit?: number;
  downloadCount: number;
  isActive: boolean;
  password?: string;
}

export interface FileSearchQuery {
  query?: string;
  mimeTypes?: string[];
  tags?: string[];
  conversationId?: string;
  workspaceId?: string;
  uploadedBy?: string;
  uploadedAfter?: Date;
  uploadedBefore?: Date;
  minSize?: number;
  maxSize?: number;
  isPublic?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'uploadedAt' | 'filename' | 'size' | 'downloadCount';
  sortOrder?: 'asc' | 'desc';
}

export interface FileSearchResult {
  files: FileMetadata[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
}

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  scanResults?: {
    virusFound: boolean;
    scanEngine: string;
    scanDate: Date;
    threats?: string[];
  };
}

export interface FileStorageConfig {
  provider: 'local' | 's3' | 'gcs' | 'azure';
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  maxFileSize: number;
  allowedMimeTypes: string[];
  virusScanEnabled: boolean;
  thumbnailGeneration: boolean;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
}

export interface FileEvent {
  type:
    | 'upload_started'
    | 'upload_progress'
    | 'upload_completed'
    | 'upload_failed'
    | 'download_started'
    | 'download_completed'
    | 'file_deleted'
    | 'file_shared'
    | 'thumbnail_generated'
    | 'virus_detected';
  fileId: string;
  userId: string;
  timestamp: Date;
  data?: any;
  conversationId?: string;
  workspaceId?: string;
}

// WebSocket Events for Real-time File Operations
export interface FileWebSocketEvents {
  'file:upload:progress': FileUploadProgress;
  'file:upload:completed': FileUploadResponse;
  'file:upload:failed': { fileId: string; error: string };
  'file:download:started': { fileId: string; filename: string };
  'file:download:completed': { fileId: string; filename: string };
  'file:deleted': { fileId: string; filename: string };
  'file:shared': { fileId: string; shareLink: FileShareLink };
  'file:thumbnail:generated': { fileId: string; thumbnailId: string };
  'file:virus:detected': { fileId: string; threats: string[] };
}

// Error Types
export class FileError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'FileError';
  }
}

export class FileNotFoundError extends FileError {
  constructor(fileId: string) {
    super(`File not found: ${fileId}`, 'FILE_NOT_FOUND', 404);
  }
}

export class FilePermissionError extends FileError {
  constructor(operation: string) {
    super(`Permission denied for file operation: ${operation}`, 'FILE_PERMISSION_DENIED', 403);
  }
}

export class FileSizeError extends FileError {
  constructor(size: number, maxSize: number) {
    super(`File size ${size} exceeds maximum allowed size ${maxSize}`, 'FILE_SIZE_EXCEEDED', 413);
  }
}

export class FileTypeError extends FileError {
  constructor(mimeType: string) {
    super(`File type not allowed: ${mimeType}`, 'FILE_TYPE_NOT_ALLOWED', 415);
  }
}

export class FileVirusError extends FileError {
  constructor(threats: string[]) {
    super(`Virus detected in file: ${threats.join(', ')}`, 'FILE_VIRUS_DETECTED', 422, { threats });
  }
}

export class FileStorageError extends FileError {
  constructor(operation: string, details?: any) {
    super(`File storage operation failed: ${operation}`, 'FILE_STORAGE_ERROR', 500, details);
  }
}
