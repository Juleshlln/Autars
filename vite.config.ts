import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { handleBrief, handleMission } from './server/llm-handlers'

function llmProxyPlugin(envKey: string): PluginOption {
  return {
    name: 'llm-proxy',
    configureServer(server) {
      if (envKey && !process.env.ANTHROPIC_API_KEY) {
        process.env.ANTHROPIC_API_KEY = envKey
      }
      server.middlewares.use('/api/llm/brief', (req, res, next) => {
        if (req.method !== 'POST') return next()
        void handleBrief(req, res)
      })
      server.middlewares.use('/api/llm/mission', (req, res, next) => {
        if (req.method !== 'POST') return next()
        void handleMission(req, res)
      })
      server.middlewares.use('/api/llm/health', (req, res) => {
        void req
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({ hasKey: Boolean(process.env.ANTHROPIC_API_KEY) }),
        )
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.ANTHROPIC_API_KEY ?? ''
  return {
    plugins: [react(), llmProxyPlugin(apiKey)],
    server: {
      allowedHosts: true,
    },
  }
})
