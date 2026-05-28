import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { handleBrief, handleMission } from './server/llm-handlers'
import {
  handleAgentDecide,
  handleAgentIterate,
  handleAgentNext,
  handleAgentRun,
} from './server/agent-handlers'
import { handleStripeWebhook } from './server/stripe-webhook'
import { hasAdmin } from './server/supabaseAdmin'

interface ServerEnv {
  LLM_BASE_URL?: string
  LLM_API_KEY?: string
  LLM_MODEL?: string
  ANTHROPIC_API_KEY?: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  // Embeddings / RAG
  OPENAI_API_KEY?: string
  OPENAI_EMBED_API_KEY?: string
  OPENAI_EMBED_BASE_URL?: string
  // Outbound action tools
  MAKE_WEBHOOK_URL?: string
  BREVO_API_KEY?: string
  BREVO_DEFAULT_FROM_EMAIL?: string
  BREVO_DEFAULT_FROM_NAME?: string
  VERCEL_TOKEN?: string
  VERCEL_TEAM_ID?: string
  // Stripe webhook
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_DEFAULT_CREDITS?: string
}

function applyServerEnv(env: ServerEnv) {
  const passthrough: (keyof ServerEnv)[] = [
    'LLM_BASE_URL',
    'LLM_API_KEY',
    'LLM_MODEL',
    'ANTHROPIC_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'OPENAI_API_KEY',
    'OPENAI_EMBED_API_KEY',
    'OPENAI_EMBED_BASE_URL',
    'MAKE_WEBHOOK_URL',
    'BREVO_API_KEY',
    'BREVO_DEFAULT_FROM_EMAIL',
    'BREVO_DEFAULT_FROM_NAME',
    'VERCEL_TOKEN',
    'VERCEL_TEAM_ID',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_DEFAULT_CREDITS',
  ]
  for (const key of passthrough) {
    const value = env[key]
    if (value && !process.env[key]) process.env[key] = value
  }
}

function llmProxyPlugin(env: ServerEnv): PluginOption {
  return {
    name: 'llm-proxy',
    configureServer(server) {
      applyServerEnv(env)
      // Single dispatcher middleware. We match by full request URL (path +
      // query) inside the handler instead of relying on connect's mount path,
      // because in Vite 8 the SPA fallback can intercept mounted /api/* paths
      // depending on plugin ordering. A catch-all that calls `next()` for
      // non-matches is the most robust pattern.
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        const path = url.split('?')[0]

        // GET /api/llm/health
        if (path === '/api/llm/health') {
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              hasKey: Boolean(
                process.env.LLM_API_KEY ?? process.env.ANTHROPIC_API_KEY,
              ),
              llmBaseUrl: process.env.LLM_BASE_URL ?? null,
              llmModel: process.env.LLM_MODEL ?? null,
              hasSupabaseAdmin: hasAdmin(),
            }),
          )
          return
        }

        // POST endpoints
        if (req.method === 'POST') {
          if (path === '/api/llm/brief') return void handleBrief(req, res)
          if (path === '/api/llm/mission') return void handleMission(req, res)
          if (path === '/api/agents/run') return void handleAgentRun(req, res)
          if (path === '/api/agents/iterate') return void handleAgentIterate(req, res)
          if (path === '/api/agents/decide') return void handleAgentDecide(req, res)
          if (path === '/api/agents/next') return void handleAgentNext(req, res)
          if (path === '/api/stripe/webhook') return void handleStripeWebhook(req, res)
        }

        next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '') as ServerEnv
  return {
    plugins: [react(), llmProxyPlugin(env)],
    server: {
      allowedHosts: true,
    },
  }
})
