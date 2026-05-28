// =====================================================================
// LLM client — vendor-agnostic, OpenAI-compatible
// =====================================================================
// This module is the single entry point for every LLM call on the server.
// It returns an OpenAI SDK client configured with a customizable baseURL so
// the same code path works against:
//
//   - Anthropic Claude (via its OpenAI-compatible endpoint)
//     LLM_BASE_URL=https://api.anthropic.com/v1/
//     LLM_API_KEY=sk-ant-...
//     LLM_MODEL=claude-sonnet-4-5
//
//   - OpenAI proper
//     LLM_BASE_URL=https://api.openai.com/v1/
//     LLM_API_KEY=sk-...
//     LLM_MODEL=gpt-4o
//
//   - Local open-source models via Ollama (no key needed)
//     LLM_BASE_URL=http://localhost:11434/v1/
//     LLM_API_KEY=ollama
//     LLM_MODEL=llama3.1:70b
//
//   - vLLM, LM Studio, llama.cpp server, OpenRouter, Together, Groq, etc.
//     Any endpoint that speaks the OpenAI Chat Completions protocol works.
//
// To swap providers in production, change `.env.local` — no code change.
// =====================================================================

import OpenAI from 'openai'

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1/'
const DEFAULT_MODEL = 'claude-sonnet-4-5'

let _client: OpenAI | null = null

export interface LLMConfig {
  baseURL: string
  apiKey: string
  model: string
  provider: 'anthropic' | 'openai' | 'ollama' | 'custom'
}

export class MissingAiApiKeyError extends Error {
  readonly code = 'missing_ai_api_key'
  constructor() {
    super(
      'missing_ai_api_key: set LLM_API_KEY (or legacy ANTHROPIC_API_KEY) in the server environment.',
    )
    this.name = 'MissingAiApiKeyError'
  }
}

export function getLLMConfig(): LLMConfig {
  const baseURL = process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL
  const apiKey =
    process.env.LLM_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? ''
  const model = process.env.LLM_MODEL ?? DEFAULT_MODEL
  const provider = detectProvider(baseURL)
  if (!apiKey && provider !== 'ollama') {
    throw new MissingAiApiKeyError()
  }
  return { baseURL, apiKey: apiKey || 'unused', model, provider }
}

function detectProvider(baseURL: string): LLMConfig['provider'] {
  if (baseURL.includes('anthropic')) return 'anthropic'
  if (baseURL.includes('openai.com')) return 'openai'
  if (baseURL.includes('localhost') || baseURL.includes('127.0.0.1'))
    return 'ollama'
  return 'custom'
}

export function getLLM(): OpenAI {
  if (_client) return _client
  const cfg = getLLMConfig()
  _client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    // Long ceiling because tool-use turns occasionally take 60s+ on
    // Anthropic. Two retries on transient `Connection error.` faults.
    timeout: 180_000,
    maxRetries: 2,
  })
  return _client
}

export function resetLLMClient(): void {
  _client = null
}
