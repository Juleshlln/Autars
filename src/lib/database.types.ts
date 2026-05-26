// Hand-written DB types mirroring supabase/migrations/*.sql.
// Regenerate via `supabase gen types typescript` once a project is linked.

export type AgentDbStatus = 'idle' | 'working' | 'blocked' | 'done'
export type MissionDbStatus =
  | 'todo'
  | 'in_progress'
  | 'review'
  | 'done'
  | 'blocked'
  | 'waiting_user_decision'
  | 'completed'
  | 'failed'
export type MissionDbPriority = 'low' | 'medium' | 'high'
export type ActivityEventType =
  | 'agent_created'
  | 'mission_created'
  | 'mission_started'
  | 'mission_completed'
  | 'agent_status_changed'
  | 'workspace_updated'
  | 'workspace_created'
  | 'credits_consumed'
  | 'credits_insufficient'
  | 'credits_granted'
  | 'agent_leveled_up'

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing'
export type CreditTxType =
  | 'initial_grant'
  | 'monthly_refill'
  | 'mission_cost'
  | 'manual_adjustment'
  | 'refund'

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
  cost_credits: number
  type: string | null
  result: Record<string, unknown> | null
  order_index: number | null
  xp_reward: number
  started_at: string | null
  completed_at: string | null
  xp_awarded: boolean
  simulation_due_at: string | null
  created_at: string
  updated_at: string
}

export type PlanRow = {
  id: string
  name: string
  monthly_credits: number
  price_monthly: number | null
  currency: string
  is_active: boolean
  created_at: string
}

export type SubscriptionRow = {
  id: string
  user_id: string
  plan_id: string
  status: SubscriptionStatus
  current_period_start: string
  current_period_end: string | null
  created_at: string
  updated_at: string
}

export type CreditWalletRow = {
  id: string
  user_id: string
  balance: number
  monthly_allowance: number
  last_refill_at: string | null
  created_at: string
  updated_at: string
}

export type CreditTransactionRow = {
  id: string
  user_id: string
  workspace_id: string | null
  mission_id: string | null
  amount: number
  type: CreditTxType
  reason: string | null
  metadata: Record<string, unknown>
  created_at: string
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
  cost_credits?: number
  type?: string | null
  result?: Record<string, unknown> | null
  order_index?: number | null
  xp_reward?: number
  started_at?: string | null
  completed_at?: string | null
  xp_awarded?: boolean
  simulation_due_at?: string | null
}

export type SubscriptionInsert = {
  id?: string
  user_id: string
  plan_id: string
  status?: SubscriptionStatus
  current_period_start?: string
  current_period_end?: string | null
}

export type CreditWalletInsert = {
  id?: string
  user_id: string
  balance?: number
  monthly_allowance?: number
  last_refill_at?: string | null
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
      plans: {
        Row: PlanRow
        Insert: PlanRow
        Update: Partial<PlanRow>
        Relationships: []
      }
      subscriptions: {
        Row: SubscriptionRow
        Insert: SubscriptionInsert
        Update: Partial<SubscriptionRow>
        Relationships: []
      }
      credit_wallets: {
        Row: CreditWalletRow
        Insert: CreditWalletInsert
        Update: Partial<CreditWalletRow>
        Relationships: []
      }
      credit_transactions: {
        Row: CreditTransactionRow
        Insert: Omit<CreditTransactionRow, 'id' | 'created_at' | 'metadata'> & {
          id?: string
          metadata?: Record<string, unknown>
        }
        Update: Partial<CreditTransactionRow>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      consume_credits: {
        Args: {
          p_user_id: string
          p_workspace_id: string | null
          p_mission_id: string | null
          p_amount: number
          p_reason?: string | null
        }
        Returns: {
          ok: boolean
          new_balance: number | null
          transaction_id: string | null
          error: string | null
        }[]
      }
      award_mission_xp: {
        Args: { p_agent_id: string; p_xp: number }
        Returns: {
          ok: boolean
          new_xp: number | null
          new_level: number | null
          leveled_up: boolean
          error: string | null
        }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
