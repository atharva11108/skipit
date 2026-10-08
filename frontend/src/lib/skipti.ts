export interface UserView {
  id: string;
  email: string;
  display_name: string;
  auth_mode: string;
}

export interface AuthResponse {
  user: UserView | null;
  message: string;
  requires_confirmation: boolean;
}

export interface McpTokenResponse {
  token: string;
  message: string;
}

export type EntryType = "fact" | "preference" | "constraint" | "goal";

export interface PersonaEntry {
  id: string;
  owner_id: string;
  category: string;
  label: string;
  value: string;
  entry_type: EntryType;
  scope: "global" | "domain" | "project" | "session";
  sensitivity: "standard" | "sensitive";
  temporary: boolean;
  approval_status: "candidate" | "approved" | "rejected";
  source: string;
  last_confirmed_at: string;
  created_at: string;
  updated_at: string;
}

export interface PersonaView {
  owner: UserView;
  revision: number;
  entries: PersonaEntry[];
  categories: string[];
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  purpose: string;
  stack: string[];
  status: "active" | "paused" | "archived";
  revision: number;
  completed: string[];
  in_progress: string[];
  blockers: string[];
  decisions: string[];
  next_steps: string[];
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail {
  project: Project;
  context_entries: PersonaEntry[];
  pending_proposals: number;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  owner_id: string;
  relative_path: string;
  size: number;
  content_type: string;
  mode: "stored" | "context_only";
  status: "stored_private" | "context_created_original_discarded";
  storage_path: string | null;
  created_at: string;
}

export interface ProjectFilesResponse {
  files: ProjectFile[];
  total_bytes: number;
}

export interface DownloadResponse {
  url: string;
  expires_in: number;
}

export interface ProgressProposal {
  id: string;
  project_id: string;
  owner_id: string;
  summary: string;
  completed: string[];
  in_progress: string[];
  blockers: string[];
  decisions: string[];
  next_steps: string[];
  source_provider: string;
  verification_status: "reported" | "user_confirmed" | "test_verified" | "blocked" | "superseded";
  status: "pending_approval" | "approved" | "rejected" | "conflict";
  base_revision: number;
  created_at: string;
}

export interface ProjectCheckpoint {
  id: string;
  project_id: string;
  owner_id: string;
  revision: number;
  summary: string;
  state: Record<string, unknown>;
  source: string;
  approval_status: string;
  created_at: string;
}

export interface ContextSelection {
  id: string;
  category: string;
  label: string;
  value: string;
  source: string;
  reason: string;
  project_id: string | null;
}

export interface ContextSearchResponse {
  query: string;
  selected: ContextSelection[];
  available_count: number;
  excluded_count: number;
  approximate_tokens: number;
  project_revision: number | null;
}

export interface PlaygroundResponse {
  answer: string;
  retrieval: ContextSearchResponse;
  provider: string;
  model: string;
  mcp_tool: string;
}

export interface ShareGrant {
  id: string;
  project_id: string | null;
  permissions: string[];
  expires_at: string;
  revoked_at: string | null;
  redeemed_at: string | null;
  status: string;
  retain_chat_until_expiry: boolean;
}

export interface ShareCreated extends ShareGrant {
  connect_url: string;
  qr_data_uri: string;
  ai_context_url: string;
}

export interface ExternalContextLink {
  ai_context_url: string;
  status: string;
  expires_at: string;
}

export interface GuestChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface GuestProjectView {
  id: string;
  name: string;
  revision: number;
  description: string | null;
  stack: string[];
  completed: string[];
  in_progress: string[];
  blockers: string[];
  decisions: string[];
  next_steps: string[];
}

export interface GuestContext {
  grant: ShareGrant;
  persona_entries: PersonaEntry[];
  project: GuestProjectView | null;
  recent_messages: GuestChatMessage[];
  remaining_seconds: number;
}

export interface GuestChatResponse {
  answer: string;
  retrieval: ContextSearchResponse;
  provider: string;
  model: string;
  remaining_seconds: number;
  message: GuestChatMessage;
}

export interface Overview {
  owner: UserView;
  persona_revision: number;
  persona_entries: number;
  project_count: number;
  active_shares: number;
  projects: Project[];
  recent_entries: PersonaEntry[];
  mcp_endpoint: string;
  integration_status: Record<string, string>;
}

export interface InterviewStart {
  session_id: string;
  question: string;
  category: string;
  progress: number;
}

export interface InterviewAnswerResponse {
  session_id: string;
  question: string | null;
  category: string | null;
  progress: number;
  candidates: PersonaEntry[];
  complete: boolean;
  ai_available: boolean;
}

export interface ExportResponse {
  filename: string;
  markdown: string;
  revision: number;
  exported_at: string;
}