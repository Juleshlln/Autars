import { requireSupabase } from '../lib/supabaseClient'
import type {
  CreditTransactionRow,
  CreditWalletRow,
  PlanRow,
  SubscriptionRow,
} from '../lib/database.types'

export interface CreditWallet {
  id: string
  userId: string
  balance: number
  monthlyAllowance: number
  lastRefillAt: string | null
}

export interface Subscription {
  id: string
  userId: string
  planId: string
  status: SubscriptionRow['status']
  currentPeriodStart: string
  currentPeriodEnd: string | null
}

export interface Plan {
  id: string
  name: string
  monthlyCredits: number
  priceMonthly: number | null
  currency: string
  isActive: boolean
}

export interface CreditTransaction {
  id: string
  userId: string
  workspaceId: string | null
  missionId: string | null
  amount: number
  type: CreditTransactionRow['type']
  reason: string | null
  createdAt: string
}

export interface ConsumeResult {
  ok: boolean
  newBalance: number | null
  transactionId: string | null
  error: string | null
}

function walletRowToUi(row: CreditWalletRow): CreditWallet {
  return {
    id: row.id,
    userId: row.user_id,
    balance: row.balance,
    monthlyAllowance: row.monthly_allowance,
    lastRefillAt: row.last_refill_at,
  }
}

function subscriptionRowToUi(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    status: row.status,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
  }
}

function planRowToUi(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    monthlyCredits: row.monthly_credits,
    priceMonthly: row.price_monthly,
    currency: row.currency,
    isActive: row.is_active,
  }
}

function txRowToUi(row: CreditTransactionRow): CreditTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    missionId: row.mission_id,
    amount: row.amount,
    type: row.type,
    reason: row.reason,
    createdAt: row.created_at,
  }
}

export async function fetchWallet(userId: string): Promise<CreditWallet | null> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('credit_wallets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? walletRowToUi(data) : null
}

export async function fetchActiveSubscription(
  userId: string,
): Promise<Subscription | null> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? subscriptionRowToUi(data) : null
}

export async function fetchPlans(): Promise<Plan[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('monthly_credits', { ascending: true })
  if (error) throw error
  return (data ?? []).map(planRowToUi)
}

export async function fetchPlan(planId: string): Promise<Plan | null> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle()
  if (error) throw error
  return data ? planRowToUi(data) : null
}

export async function fetchRecentTransactions(
  userId: string,
  limit = 20,
): Promise<CreditTransaction[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(txRowToUi)
}

/**
 * Atomic credit consumption via the SQL RPC. Returns a structured result so
 * callers can react to the 'insufficient_credits' / 'no_wallet' / 'forbidden'
 * error codes without try/catch noise.
 */
export async function consumeCredits(params: {
  userId: string
  workspaceId: string | null
  missionId: string | null
  amount: number
  reason?: string | null
}): Promise<ConsumeResult> {
  const sb = requireSupabase()
  const { data, error } = await sb.rpc('consume_credits', {
    p_user_id: params.userId,
    p_workspace_id: params.workspaceId,
    p_mission_id: params.missionId,
    p_amount: params.amount,
    p_reason: params.reason ?? null,
  })
  if (error) {
    return {
      ok: false,
      newBalance: null,
      transactionId: null,
      error: error.message,
    }
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) {
    return {
      ok: false,
      newBalance: null,
      transactionId: null,
      error: 'no_response',
    }
  }
  return {
    ok: Boolean(row.ok),
    newBalance: row.new_balance ?? null,
    transactionId: row.transaction_id ?? null,
    error: row.error ?? null,
  }
}
