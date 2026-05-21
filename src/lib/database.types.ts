// Hand-written DB types mirroring supabase/migrations/001_init_autars_mvp.sql.
// Regenerate via `supabase gen types typescript` once a project is linked.

export type AgentDbStatus = 'idle' | 'working' | 'blocked' | 'done'
export type MissionDbStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked'
export type MissionDbPriority = 'low' | 'medium' | 'high'
export type ActivityEventType =
  | 'agent_created'
  | 'mission_created'
  | 'mission_started'
  | 'mission_completed'
  | 'agent_status_changed'
  | 'workspace_updated'

export type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export type WorkspaceRow = {
  id: string
  owner_id: string
  name: string
  description: string | null
  stage: string
  created_at: string
  updated_at: string
}

export type AgentRow = {
  id: string
  workspace_id: string
  owner_id: string
  name: string
  role: string
  specialty: string | null
  status: AgentDbStatus
  avatar_type: string
  level: number
  xp: number
  created_at: string
  updated_at: string
}

export type MissionRow = {
  id: string
  workspace_id: string
  agent_id: string | null
  owner_id: string
  title: string
  description: string | null
  status: MissionDbStatus
  priority: MissionDbPriority
  output_type: string | null
  output_content: string | null
  due_date: string | null
  created_at: string
  updated_at: string
}

export type ActivityEventRow = {
  id: string
  workspace_id: string
  agent_id: string | null
  mission_id: string | null
  owner_id: string
  event_type: ActivityEventType
  title: string
  description: string | null
  metadata: Record<string, unknown>
  created_at: string
}

// ---- Insert payloads ----
export type ProfileInsert = {
  id: string
  email?: string | null
  full_name?: string | null
  avatar_url?: string | null
}

export type WorkspaceInsert = {
  id?: string
  owner_id: string
  name: string
  description?: string | null
  stage?: string
}

export type AgentInsert = {
  id?: string
  workspace_id: string
  owner_id: string
  name: string
  role: string
  specialty?: string | null
  status?: AgentDbStatus
  avatar_type?: string
  level?: number
  xp?: number
}

export type MissionInsert = {
  id?: string
  workspace_id: string
  owner_id: string
  agent_id?: string | null
  title: string
  description?: string | null
  status?: MissionDbStatus
  priority?: MissionDbPriority
  output_type?: string | null
  output_content?: string | null
  due_date?: string | null
}

export type ActivityEventInsert = {
  id?: string
  workspace_id: string
  owner_id: string
  agent_id?: string | null
  mission_id?: string | null
  event_type: ActivityEventType
  title: string
  description?: string | null
  metadata?: Record<string, unknown>
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: ProfileInsert
        Update: Partial<ProfileRow>
        Relationships: []
      }
      workspaces: {
        Row: WorkspaceRow
        Insert: WorkspaceInsert
        Update: Partial<WorkspaceRow>
        Relationships: []
      }
      agents: {
        Row: AgentRow
        Insert: AgentInsert
        Update: Partial<AgentRow>
        Relationships: []
      }
      missions: {
        Row: MissionRow
        Insert: MissionInsert
        Update: Partial<MissionRow>
        Relationships: []
      }
      activity_events: {
        Row: ActivityEventRow
        Insert: ActivityEventInsert
        Update: Partial<ActivityEventRow>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

