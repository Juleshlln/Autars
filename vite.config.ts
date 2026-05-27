import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { handleBrief, handleMission } from './server/llm-handlers'
import {
  handleAgentDecide,
  handleAgentIterate,
  handleAgentNext,
  handleAgentRun,
} from './server/agent-handlers'
import { hasAdmin } from './server/supabaseAdmin'

interface ServerEnv {
  ANTHROPIC_API_KEY?: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

function applyServerEnv(env: ServerEnv) {
  const passthrough: (keyof ServerEnv)[] = [
    'ANTHROPIC_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
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
              hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
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
