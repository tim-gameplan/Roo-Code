/**
 * Conversation and Message Type Definitions
 *
 * Comprehensive TypeScript interfaces for conversation management,
 * message storage, and cross-device synchronization.
 *
 * @fileoverview Core types for conversation and message handling
 * @version 1.0.0
 * @created 2025-06-23
 */

// =====================================================
// BASE TYPES AND ENUMS
// =====================================================

export type MessageType =
  | 'user_message'
  | 'assistant_message'
  | 'system_message'
  | 'tool_use'
  | 'tool_result'
  | 'error_message'
  | 'status_update';

export type ChangeType = 'create' | 'update' | 'delete' | 'restore';

export type SyncStatus = 'pending' | 'synced' | 'conflict' | 'failed';

export type AttachmentType = 'file' | 'image' | 'code_snippet' | 'link' | 'document';

export type ParticipantRole = 'owner' | 'participant' | 'viewer';

// =====================================================
// CORE CONVERSATION INTERFACES
// =====================================================

export interface Conversation {
  id: string;
  user_id: string;
  title?: string;
  workspace_path?: string;
  metadata: ConversationMetadata;
  created_at: Date;
  updated_at: Date;
  last_activity: Date;
}

export interface ConversationMetadata {
  tags?: string[];
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  archived?: boolean;
  pinned?: boolean;
  color?: string;
  custom_fields?: Record<string, any>;
}

export interface ConversationSummary extends Conversation {
  message_count: number;
  last_message_at?: Date;
  device_count: number;
}

export interface ConversationStats {
  id: string;
  user_id: string;
  title?: string;
  workspace_path?: string;
  metadata: ConversationMetadata;
  created_at: Date;
  updated_at: Date;
  last_activity: Date;
  message_count: number;
  last_message_at?: Date;
}

// =====================================================
// MESSAGE INTERFACES
// =====================================================

export interface Message {
  id: string;
  conversation_id: string;
  user_id: string;
  device_id?: string;
  message_type: MessageType;
  content: MessageContent;
  metadata: MessageMetadata;
  parent_message_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface MessageContent {
  text?: string;
  html?: string;
  markdown?: string;
  data?: any;
  tool_name?: string;
  tool_input?: any;
  tool_output?: any;
  error_details?: ErrorDetails;
  timestamp?: string;
  [key: string]: any;
}

export interface MessageMetadata {
  source?: 'web' | 'mobile' | 'desktop' | 'api';
  edited?: boolean;
  edit_history?: EditHistoryEntry[];
  reactions?: MessageReaction[];
  mentions?: string[];
  attachments?: string[];
  thread_count?: number;
  is_pinned?: boolean;
  custom_data?: Record<string, any>;
}

export interface ErrorDetails {
  code: string;
  message: string;
  stack?: string;
  context?: Record<string, any>;
}

export interface EditHistoryEntry {
  timestamp: Date;
  previous_content: MessageContent;
  edit_reason?: string;
  device_id?: string;
}

export interface MessageReaction {
  emoji: string;
  user_id: string;
  timestamp: Date;
}

export interface MessageWithThread extends Message {
  thread_level: number;
  children?: MessageWithThread[];
}

// =====================================================
// MESSAGE CHANGE TRACKING
// =====================================================

export interface MessageChange {
  id: string;
  message_id: string;
  change_type: ChangeType;
  change_data: ChangeData;
  device_id?: string;
  user_id: string;
  timestamp: Date;
  sync_status: SyncStatus;
  conflict_id?: string;
}

export interface ChangeData {
  field?: string;
  old_value?: any;
  new_value?: any;
  operation?: 'insert' | 'update' | 'delete';
  full_message?: Message;
  conflict_resolution?: ConflictResolution;
}

export interface ConflictResolution {
  strategy: 'merge' | 'overwrite' | 'manual';
  resolved_by?: string;
  resolved_at?: Date;
  resolution_data?: any;
}

export interface PendingSyncChange extends MessageChange {
  conversation_id: string;
  conversation_title?: string;
}

// =====================================================
// ATTACHMENT INTERFACES
// =====================================================

export interface MessageAttachment {
  id: string;
  message_id: string;
  attachment_type: AttachmentType;
  file_name?: string;
  file_path?: string;
  file_size?: number;
  mime_type?: string;
  metadata: AttachmentMetadata;
  created_at: Date;
}

export interface AttachmentMetadata {
  thumbnail_url?: string;
  preview_url?: string;
  download_url?: string;
  dimensions?: {
    width: number;
    height: number;
  };
  duration?: number; // for video/audio
  language?: string; // for code snippets
  syntax?: string; // for code snippets
  description?: string;
  alt_text?: string;
  custom_data?: Record<string, any>;
}

// =====================================================
// PARTICIPANT INTERFACES
// =====================================================

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  role: ParticipantRole;
  permissions: ParticipantPermissions;
  joined_at: Date;
  last_read_message_id?: string;
}

export interface ParticipantPermissions {
  can_read?: boolean;
  can_write?: boolean;
  can_edit_messages?: boolean;
  can_delete_messages?: boolean;
  can_manage_participants?: boolean;
  can_change_settings?: boolean;
  custom_permissions?: Record<string, boolean>;
}

// =====================================================
// REQUEST/RESPONSE INTERFACES
// =====================================================

export interface CreateConversationRequest {
  title?: string;
  workspace_path?: string;
  metadata?: Partial<ConversationMetadata>;
}

export interface CreateConversationResponse {
  conversation: Conversation;
  success: boolean;
  error?: string;
}

export interface UpdateConversationRequest {
  conversation_id: string;
  title?: string;
  workspace_path?: string;
  metadata?: Partial<ConversationMetadata>;
}

export interface UpdateConversationResponse {
  conversation: Conversation;
  success: boolean;
  error?: string;
}

export interface GetConversationsRequest {
  user_id: string;
  limit?: number;
  offset?: number;
  workspace_path?: string;
  include_archived?: boolean;
  sort_by?: 'created_at' | 'updated_at' | 'last_activity' | 'title';
  sort_order?: 'asc' | 'desc';
  search_query?: string;
}

export interface GetConversationsResponse {
  conversations: ConversationSummary[];
  total_count: number;
  has_more: boolean;
  success: boolean;
  error?: string;
}

export interface CreateMessageRequest {
  conversation_id: string;
  message_type: MessageType;
  content: MessageContent;
  metadata?: Partial<MessageMetadata>;
  parent_message_id?: string;
  device_id?: string;
}

export interface CreateMessageResponse {
  message: Message;
  success: boolean;
  error?: string;
}

export interface UpdateMessageRequest {
  message_id: string;
  content?: Partial<MessageContent>;
  metadata?: Partial<MessageMetadata>;
  device_id?: string;
}

export interface UpdateMessageResponse {
  message: Message;
  change: MessageChange;
  success: boolean;
  error?: string;
}

export interface GetMessagesRequest {
  conversation_id: string;
  limit?: number;
  offset?: number;
  include_threads?: boolean;
  message_types?: MessageType[];
  since?: Date;
  until?: Date;
  search_query?: string;
}

export interface GetMessagesResponse {
  messages: MessageWithThread[];
  total_count: number;
  has_more: boolean;
  success: boolean;
  error?: string;
}

export interface DeleteMessageRequest {
  message_id: string;
  device_id?: string;
  soft_delete?: boolean;
}

export interface DeleteMessageResponse {
  success: boolean;
  change?: MessageChange;
  error?: string;
}

// =====================================================
// SYNCHRONIZATION INTERFACES
// =====================================================

export interface SyncRequest {
  user_id: string;
  device_id: string;
  last_sync_timestamp?: Date;
  conversation_ids?: string[];
  include_conflicts?: boolean;
}

export interface SyncResponse {
  changes: MessageChange[];
  conflicts: ConflictData[];
  last_sync_timestamp: Date;
  success: boolean;
  error?: string;
}

export interface ConflictData {
  conflict_id: string;
  message_id: string;
  conflicting_changes: MessageChange[];
  suggested_resolution?: ConflictResolution;
  requires_manual_resolution: boolean;
}

export interface ResolveConflictRequest {
  conflict_id: string;
  resolution: ConflictResolution;
  device_id: string;
}

export interface ResolveConflictResponse {
  resolved_message: Message;
  applied_changes: MessageChange[];
  success: boolean;
  error?: string;
}

// =====================================================
// SEARCH AND FILTERING INTERFACES
// =====================================================

export interface SearchRequest {
  user_id: string;
  query: string;
  conversation_ids?: string[];
  message_types?: MessageType[];
  date_range?: {
    start: Date;
    end: Date;
  };
  workspace_paths?: string[];
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total_count: number;
  has_more: boolean;
  search_metadata: SearchMetadata;
  success: boolean;
  error?: string;
}

export interface SearchResult {
  message: Message;
  conversation: Conversation;
  highlights: SearchHighlight[];
  relevance_score: number;
}

export interface SearchHighlight {
  field: string;
  fragment: string;
  start_offset: number;
  end_offset: number;
}

export interface SearchMetadata {
  query_time_ms: number;
  total_documents_searched: number;
  filters_applied: string[];
}

// =====================================================
// ANALYTICS AND METRICS INTERFACES
// =====================================================

export interface ConversationAnalytics {
  conversation_id: string;
  message_count: number;
  participant_count: number;
  average_response_time_ms: number;
  most_active_device: string;
  activity_timeline: ActivityPoint[];
  message_type_distribution: Record<MessageType, number>;
}

export interface ActivityPoint {
  timestamp: Date;
  message_count: number;
  active_devices: number;
}

export interface UserConversationMetrics {
  user_id: string;
  total_conversations: number;
  total_messages: number;
  average_messages_per_conversation: number;
  most_active_workspace: string;
  device_usage: Record<string, number>;
  daily_activity: Record<string, number>;
}

// =====================================================
// UTILITY TYPES
// =====================================================

export type ConversationFilter = {
  workspace_path?: string;
  tags?: string[];
  priority?: ConversationMetadata['priority'];
  archived?: boolean;
  date_range?: {
    start: Date;
    end: Date;
  };
};

export type MessageFilter = {
  message_types?: MessageType[];
  device_ids?: string[];
  has_attachments?: boolean;
  date_range?: {
    start: Date;
    end: Date;
  };
  search_content?: string;
};

export type SortOptions = {
  field: string;
  order: 'asc' | 'desc';
};

export type PaginationOptions = {
  limit: number;
  offset: number;
};

// =====================================================
// ERROR TYPES
// =====================================================

export interface ConversationError extends Error {
  code:
    | 'CONVERSATION_NOT_FOUND'
    | 'INVALID_CONVERSATION_DATA'
    | 'PERMISSION_DENIED'
    | 'SYNC_CONFLICT';
  conversation_id?: string;
  user_id?: string;
  details?: Record<string, any>;
}

export interface MessageError extends Error {
  code:
    | 'MESSAGE_NOT_FOUND'
    | 'INVALID_MESSAGE_DATA'
    | 'THREAD_DEPTH_EXCEEDED'
    | 'CONTENT_TOO_LARGE';
  message_id?: string;
  conversation_id?: string;
  details?: Record<string, any>;
}

export interface SyncError extends Error {
  code:
    | 'SYNC_FAILED'
    | 'CONFLICT_RESOLUTION_FAILED'
    | 'DEVICE_NOT_AUTHORIZED'
    | 'TIMESTAMP_MISMATCH';
  device_id?: string;
  user_id?: string;
  conflict_id?: string;
  details?: Record<string, any>;
}

// All types are already exported with their interface declarations above
