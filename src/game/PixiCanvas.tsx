import { useEffect, useRef } from 'react'
import { Application, Container, Graphics, Ticker, Text } from 'pixi.js'
import { Viewport } from 'pixi-viewport'
import {
  buildAutarsCore,
  buildFlowParticles,
  buildOffice,
  GRID_H,
  OFFICE_PX_H,
  OFFICE_PX_W,
  spawnParticle,
  TILE,
} from './office'
import { makeAgentEntity, type AgentEntityHandle } from './AgentEntity'
import { useGame, type AgentLifeState, type AgentRuntime } from './store'

const BG = 0x0a0b11

interface IdlePlan {
  currentTargetId: string
  nextMoveAt: number
  cycle: number
}

interface Props {
  className?: string
}

export function PixiCanvas({ className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const officeRef = useRef<{ container: Container; destroy: () => void } | null>(null)
  const coreRef = useRef<ReturnType<typeof buildAutarsCore> | null>(null)
  const flowLayerRef = useRef<Container | null>(null)
  const flowGfxRef = useRef<Graphics | null>(null)
  const particleHostRef = useRef<Container | null>(null)
  const particleTexRef = useRef<ReturnType<typeof buildFlowParticles>['tex'] | null>(null)
  const agentsRef = useRef<Map<string, AgentEntityHandle>>(new Map())
  const hqLevelRef = useRef<number>(0)
  const lastParticleSpawnRef = useRef<Map<string, number>>(new Map())
  const viewportRef = useRef<Viewport | null>(null)
  const idlePlansRef = useRef<Map<string, IdlePlan>>(new Map())
  const lastAgentStateRef = useRef<Map<string, AgentLifeState>>(new Map())
  const lastInboundSpawnRef = useRef<number>(0)
  const lastSaleAtRef = useRef<number>(0)

  /* Setup once */
  useEffect(() => {
    if (!hostRef.current) return
    const host = hostRef.current
    const app = new Application()
    appRef.current = app
    const agentEntities = agentsRef.current
    let disposed = false

    async function setup() {
      await app.init({
        background: BG,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        resizeTo: host,
      })
      if (disposed) {
        app.destroy(true, { children: true })
        return
      }
      host.appendChild(app.canvas)

      const vp = new Viewport({
        events: app.renderer.events,
        screenWidth: app.renderer.width,
        screenHeight: app.renderer.height,
        worldWidth: OFFICE_PX_W,
        worldHeight: OFFICE_PX_H,
      })
      app.stage.addChild(vp)
      vp.drag({ mouseButtons: 'middle-right' })
        .pinch()
        .wheel({ smooth: 6 })
        .clampZoom({ minScale: 0.5, maxScale: 2.2 })
        .clamp({ direction: 'all' })
      viewportRef.current = vp

      // Fit office into view
      const fit = () => {
        const sw = app.renderer.width / (window.devicePixelRatio || 1)
        const sh = app.renderer.height / (window.devicePixelRatio || 1)
        const scaleX = sw / OFFICE_PX_W
        const scaleY = sh / OFFICE_PX_H
        const scale = Math.min(scaleX, scaleY) * 0.96
        vp.setZoom(scale, true)
        vp.moveCenter(OFFICE_PX_W / 2, OFFICE_PX_H / 2)
      }
      fit()
      window.addEventListener('resize', fit)

      // Office (initial)
      const initialLevel = useGame.getState().hqLevel
      const office = buildOffice(initialLevel)
      vp.addChild(office.container)
      officeRef.current = office
      hqLevelRef.current = initialLevel

      // Flow lines layer (between office and agents)
      const flowLayer = new Container()
      flowLayer.zIndex = 4
      vp.addChild(flowLayer)
      flowLayerRef.current = flowLayer
      const flowGfx = new Graphics()
      flowLayer.addChild(flowGfx)
      flowGfxRef.current = flowGfx

      // Autars Core
      const core = buildAutarsCore()
      core.container.zIndex = 5
      vp.addChild(core.container)
      coreRef.current = core

      // Particle host
      const { container: particleHost, tex } = buildFlowParticles()
      particleHost.zIndex = 6
      vp.addChild(particleHost)
      particleHostRef.current = particleHost
      particleTexRef.current = tex

      // Agents
      const state = useGame.getState()
      for (const id of state.agentOrder) {
        const a = state.agents[id]
        if (!a) continue
        // eslint-disable-next-line react-hooks/immutability
        spawnAgent(a)
      }

      // FPS-style background subscription: pull from store via ticker (avoid re-renders)
      // eslint-disable-next-line react-hooks/immutability
      const tickerFn = () => syncFromStore(performance.now())
      Ticker.shared.add(tickerFn)
      ;(app as Application & { __tickerFn?: () => void }).__tickerFn = tickerFn

      // mission progress driver
      const missionTicker = () => {
        useGame.getState().tickMissions(performance.now())
      }
      Ticker.shared.add(missionTicker)
      ;(app as Application & { __missionTicker?: () => void }).__missionTicker =
        missionTicker

      // Caption above core
      const caption = new Text({
        text: 'AUTARS CORE',
        style: {
          fill: 0xc4b5fd,
          fontSize: 9,
          fontFamily: 'Press Start 2P, "Courier New", monospace',
          stroke: { color: 0x0a0518, width: 3 },
        },
      })
      caption.anchor.set(0.5, 1)
      caption.position.set(OFFICE_PX_W / 2, (GRID_H - 2) * TILE / 2 + 2 * TILE - 60)
      caption.zIndex = 5
      vp.addChild(caption)

      // First-time sync
      syncFromStore(performance.now())
    }

    setup().catch((e) => {
      console.error('PixiCanvas init failed', e)
    })

    return () => {
      disposed = true
      const a = appRef.current
      if (a) {
        const tickerFn = (a as Application & { __tickerFn?: () => void }).__tickerFn
        const missionTicker = (a as Application & { __missionTicker?: () => void })
          .__missionTicker
        if (tickerFn) Ticker.shared.remove(tickerFn)
        if (missionTicker) Ticker.shared.remove(missionTicker)
        coreRef.current?.destroy()
        for (const [, ent] of agentEntities) ent.destroy()
        agentEntities.clear()
        officeRef.current?.destroy()
        a.destroy(true, { children: true, texture: false })
      }
      appRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ============================================================
     Helpers
     ============================================================ */

  function spawnAgent(a: AgentRuntime) {
    const vp = viewportRef.current
    if (!vp) return
    const entity = makeAgentEntity(a)
    entity.container.zIndex = 7
    vp.addChild(entity.container)

    // Initial position
    const ws =
      useGame.getState().workspaces[a.workspaceId ?? a.homeWorkspaceId] ??
      useGame.getState().workspaces[a.homeWorkspaceId]
    if (ws) {
      entity.container.x = (ws.x + 0.5) * TILE
      entity.container.y = (ws.y + 1) * TILE
      entity.setTargetTile(ws.x, ws.y)
    }
    entity.setLifeState(a.state)
    entity.setEmote(a.emote)
    entity.setProgress(a.progress)

    entity.onClick((sx, sy) => {
      const state = useGame.getState()
      const agent = state.agents[a.id]
      if (!agent) return
      if (agent.state === 'locked') {
        state.unlockAgent(a.id)
        return
      }
      if (agent.state === 'delivered') {
        state.completeMission(a.id)
        return
      }
      state.openContextMenu(a.id, sx, sy)
    })

    agentsRef.current.set(a.id, entity)
  }

  /* Sync runtime state from the Zustand store to PIXI every frame. */
  function syncFromStore(now: number) {
    const state = useGame.getState()
    // HQ level change → rebuild office
    if (state.hqLevel !== hqLevelRef.current) {
      const vp = viewportRef.current
      if (vp && officeRef.current) {
        vp.removeChild(officeRef.current.container)
        officeRef.current.destroy()
        const next = buildOffice(state.hqLevel)
        vp.addChildAt(next.container, 0)
        officeRef.current = next
        hqLevelRef.current = state.hqLevel
      }
    }

    // Selected agent → selection ring
    const selectedId = state.selectedAgentId
    for (const [id, ent] of agentsRef.current) {
      ent.setSelected(id === selectedId)
    }

    // Agent state sync
    for (const id of state.agentOrder) {
      const a = state.agents[id]
      const ent = agentsRef.current.get(id)
      if (!a || !ent) continue
      const prevState = lastAgentStateRef.current.get(id)
      ent.setLifeState(a.state)
      ent.setEmote(a.emote)
      ent.setProgress(a.progress)
      const ws = a.workspaceId ? state.workspaces[a.workspaceId] : null
      if (a.state === 'idle') {
        if (prevState !== a.state) {
          const home = state.workspaces[a.homeWorkspaceId]
          idlePlansRef.current.set(id, {
            currentTargetId: a.homeWorkspaceId,
            nextMoveAt: now + idleDelayFor(a, 0),
            cycle: 0,
          })
          if (home) ent.setIdleTargetTile(home.x, home.y, prevState !== undefined)
        }
        driveIdleAgent(a, ent, state, now)
      } else {
        idlePlansRef.current.delete(id)
        if (ws) ent.setTargetTile(ws.x, ws.y)
      }
      lastAgentStateRef.current.set(id, a.state)
    }

    drawFlowLines(state)
    spawnFlowParticles(state)
    spawnInboundTraffic(state, now)
    handleSaleEvents(state)
    updateCoreIntensity(state)
  }

  /* Server-rack tile coords (matches WORKSPACES.server in store.ts) */
  function serverPosition() {
    return { x: 20 * TILE + TILE * 0.5, y: 11 * TILE - 6 }
  }

  /* Inbound network packets — small cyan pulses falling from the "internet"
     (top of the map) toward the server rack whenever a product is online. */
  function spawnInboundTraffic(
    state: ReturnType<typeof useGame.getState>,
    now: number,
  ) {
    const host = particleHostRef.current
    const tex = particleTexRef.current
    if (!host || !tex) return
    const products = state.activeProducts.filter(
      (p) => p.ventureId === state.activeVentureId,
    )
    if (products.length === 0) return
    const interval = Math.max(380, 1100 - products.length * 140)
    if (now - lastInboundSpawnRef.current < interval) return
    lastInboundSpawnRef.current = now
    const target = serverPosition()
    const fromX = 6 * TILE + Math.random() * (OFFICE_PX_W - 12 * TILE)
    spawnParticle(
      host,
      tex,
      { x: fromX, y: TILE * 0.5 },
      target,
      0x22d3ee,
      1300,
    )
  }

  /* Sale events — gold/green shockwave from the server + floating "+N€" text. */
  function handleSaleEvents(state: ReturnType<typeof useGame.getState>) {
    if (state.lastSaleAt === lastSaleAtRef.current) return
    lastSaleAtRef.current = state.lastSaleAt
    if (state.lastSaleAt === 0) return
    const vp = viewportRef.current
    if (!vp) return
    const pos = serverPosition()
    spawnSaleShockwave(vp, pos.x, pos.y)
    spawnSalePopup(vp, pos.x, pos.y - 24, state.lastSaleAmount)
  }

  function drawFlowLines(state: ReturnType<typeof useGame.getState>) {
    const g = flowGfxRef.current
    if (!g) return
    g.clear()
    const coreX = OFFICE_PX_W / 2
    const coreY = (GRID_H - 2) * TILE / 2 + 2 * TILE
    for (const id of state.agentOrder) {
      const a = state.agents[id]
      if (!a) continue
      if (a.state === 'locked' || a.state === 'idle') continue
      const ent = agentsRef.current.get(id)
      if (!ent) continue
      const ax = ent.container.x
      const ay = ent.container.y - 26
      const color = hexFromColor(a.themeColor)
      const isFlowing = a.state === 'working' || a.state === 'walking'
      // base line
      g.moveTo(coreX, coreY)
        .quadraticCurveTo((coreX + ax) / 2, (coreY + ay) / 2 - 30, ax, ay)
        .stroke({
          color,
          width: isFlowing ? 2.5 : 1.5,
          alpha: isFlowing ? 0.85 : 0.35,
          cap: 'round',
        })
      // halo for celebrating
      if (a.state === 'delivered' || a.state === 'celebrating') {
        g.moveTo(coreX, coreY)
          .quadraticCurveTo((coreX + ax) / 2, (coreY + ay) / 2 - 30, ax, ay)
          .stroke({ color: 0x34d399, width: 4, alpha: 0.45, cap: 'round' })
      }
    }
  }

  function spawnFlowParticles(state: ReturnType<typeof useGame.getState>) {
    const host = particleHostRef.current
    const tex = particleTexRef.current
    if (!host || !tex) return
    const now = performance.now()
    const coreX = OFFICE_PX_W / 2
    const coreY = (GRID_H - 2) * TILE / 2 + 2 * TILE
    for (const id of state.agentOrder) {
      const a = state.agents[id]
      if (!a || a.state !== 'working') continue
      const last = lastParticleSpawnRef.current.get(id) ?? 0
      if (now - last < 380) continue
      lastParticleSpawnRef.current.set(id, now)
      const ent = agentsRef.current.get(id)
      if (!ent) continue
      spawnParticle(
        host,
        tex,
        { x: ent.container.x, y: ent.container.y - 26 },
        { x: coreX, y: coreY },
        hexFromColor(a.themeColor),
      )
    }
  }

  function updateCoreIntensity(state: ReturnType<typeof useGame.getState>) {
    const working = state.agentOrder
      .map((id) => state.agents[id])
      .filter((a) => a && (a.state === 'working' || a.state === 'walking')).length
    coreRef.current?.setIntensity(1 + working * 0.25)
  }

  function driveIdleAgent(
    agent: AgentRuntime,
    ent: AgentEntityHandle,
    state: ReturnType<typeof useGame.getState>,
    now: number,
  ) {
    if (!ent.isAtTarget()) return
    let plan = idlePlansRef.current.get(agent.id)
    if (!plan) {
      plan = {
        currentTargetId: agent.homeWorkspaceId,
        nextMoveAt: now + idleDelayFor(agent, 0),
        cycle: 0,
      }
      idlePlansRef.current.set(agent.id, plan)
    }
    if (now < plan.nextMoveAt) return

    const target = pickIdleTarget(agent, state, plan)
    if (!target) return

    plan.currentTargetId = target.id
    plan.cycle += 1
    plan.nextMoveAt = now + idleDelayFor(agent, plan.cycle)
    ent.setIdleTargetTile(target.x, target.y, true)
  }

  return <div ref={hostRef} className={className} />
}

function idleDelayFor(agent: AgentRuntime, cycle: number) {
  return 2800 + ((agent.spriteSeed + cycle) % 5) * 900
}

function pickIdleTarget(
  agent: AgentRuntime,
  state: ReturnType<typeof useGame.getState>,
  plan: IdlePlan,
) {
  const preferred = idleTargetIds(agent)
    .map((id) => state.workspaces[id])
    .filter(Boolean)
  if (preferred.length === 0) return state.workspaces[agent.homeWorkspaceId] ?? null

  let index = (agent.spriteSeed + plan.cycle) % preferred.length
  if (preferred.length > 1 && preferred[index]?.id === plan.currentTargetId) {
    index = (index + 1) % preferred.length
  }
  return preferred[index] ?? preferred[0] ?? null
}

function idleTargetIds(agent: AgentRuntime) {
  const home = agent.homeWorkspaceId
  if (agent.id === 'analyst') return [home, 'whiteboard', 'coffee']
  if (agent.id === 'brandBuilder') return [home, 'computer-2', 'brainstorm', 'coffee']
  if (agent.id === 'offerArchitect') return [home, 'brainstorm', 'whiteboard', 'coffee']
  if (agent.id === 'growthOperator') return [home, 'server', 'brainstorm', 'coffee']
  return [home, 'computer-1', 'whiteboard', 'coffee']
}

function hexFromColor(s: string): number {
  if (s.startsWith('#')) return parseInt(s.slice(1), 16)
  return parseInt(s, 16)
}

/* Gold-green expanding ring centered on the server rack on every sale. */
function spawnSaleShockwave(parent: Container, x: number, y: number) {
  const ring = new Graphics()
  ring.zIndex = 8
  ring.x = x
  ring.y = y
  parent.addChild(ring)
  const start = performance.now()
  const duration = 950
  const tickerFn = (ticker: Ticker) => {
    const t = Math.min(1, (performance.now() - start) / duration)
    const radius = 8 + t * 140
    ring.clear()
    ring.circle(0, 0, radius).stroke({
      color: 0xfacc15,
      width: 3 - t * 2,
      alpha: 0.85 * (1 - t),
    })
    ring.circle(0, 0, radius * 0.65).stroke({
      color: 0x34d399,
      width: 2 - t * 1.4,
      alpha: 0.7 * (1 - t),
    })
    if (t >= 1) {
      Ticker.shared.remove(tickerFn)
      ring.destroy()
    }
    void ticker
  }
  Ticker.shared.add(tickerFn)
}

/* Floating "+N€" popup that rises from the server on each sale. */
function spawnSalePopup(parent: Container, x: number, y: number, amount: number) {
  const label = new Text({
    text: `+${amount}€`,
    style: {
      fill: 0xfde68a,
      fontSize: 11,
      fontFamily: 'Press Start 2P, "Courier New", monospace',
      stroke: { color: 0x0a0518, width: 3 },
    },
  })
  label.anchor.set(0.5, 1)
  label.x = x
  label.y = y
  label.zIndex = 9
  parent.addChild(label)
  const start = performance.now()
  const duration = 1400
  const tickerFn = (ticker: Ticker) => {
    const t = Math.min(1, (performance.now() - start) / duration)
    label.y = y - t * 36
    label.alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85
    if (t >= 1) {
      Ticker.shared.remove(tickerFn)
      label.destroy()
    }
    void ticker
  }
  Ticker.shared.add(tickerFn)
}
