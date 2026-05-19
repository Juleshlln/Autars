import { Container, Graphics, Sprite, Text, Ticker } from 'pixi.js'
import type { AgentLifeState, AgentRuntime } from './store'
import { getSpriteTexture, SCALE, SPRITE_H, SPRITE_W } from './pixelArt'
import { TILE } from './office'

const FOOT_OFFSET = SPRITE_H * SCALE // sprite is drawn anchored at top-left, we lift it so feet are at y=0
const WALK_SPEED = 60 // px per second

export interface AgentEntityHandle {
  container: Container
  agentId: string
  setTargetTile: (tileX: number, tileY: number) => void
  setLifeState: (state: AgentLifeState) => void
  setEmote: (e: string | null) => void
  setProgress: (p: number) => void
  setSelected: (selected: boolean) => void
  isAtTarget: () => boolean
  destroy: () => void
  onClick: (cb: (sx: number, sy: number) => void) => void
}

export function makeAgentEntity(agent: AgentRuntime): AgentEntityHandle {
  const container = new Container()
  container.sortableChildren = true
  container.eventMode = 'static'
  container.cursor = 'pointer'

  // Compute drawn size in world coordinates.
  const drawW = SPRITE_W * SCALE
  const drawH = SPRITE_H * SCALE
  // Scale down so the 64×96 sprite footprint fits inside a tile column.
  const RENDER_SCALE = 0.62
  const renderW = drawW * RENDER_SCALE
  const renderH = drawH * RENDER_SCALE
  void renderW

  // Shadow
  const shadow = new Graphics()
  shadow.ellipse(0, 0, 16, 5).fill({ color: 0x0a0518, alpha: 0.45 })
  shadow.y = -2
  shadow.zIndex = 0
  container.addChild(shadow)

  // Sprite host — anchor.x = 0.5 / anchor.y = 1 (feet) to make positioning intuitive.
  const isStrategist = agent.id === 'strategist'
  const initialTexture = getSpriteTexture(
    agent.palette,
    agent.state === 'locked' ? 'locked' : 'idle',
    false,
    isStrategist,
  )
  const sprite = new Sprite(initialTexture)
  sprite.anchor.set(0.5, 1)
  sprite.scale.set(RENDER_SCALE)
  sprite.zIndex = 1
  container.addChild(sprite)

  // Selection ring
  const ring = new Graphics()
  ring.ellipse(0, -2, 20, 7).stroke({ color: 0xc084fc, width: 2 })
  ring.visible = false
  ring.zIndex = 0
  container.addChild(ring)

  // Speech bubble
  const bubble = new Container()
  bubble.visible = false
  bubble.y = -renderH - 12
  bubble.zIndex = 5
  const bubbleBg = new Graphics()
  bubbleBg.roundRect(-12, -16, 24, 22, 4).fill({ color: 0xfafafa }).stroke({ color: 0x1a1320, width: 2 })
  bubbleBg.moveTo(-4, 6).lineTo(0, 12).lineTo(4, 6).fill({ color: 0xfafafa }).stroke({
    color: 0x1a1320,
    width: 2,
  })
  bubble.addChild(bubbleBg)
  const bubbleText = new Text({
    text: agent.emote ?? '',
    style: {
      fill: 0x1a1320,
      fontFamily: 'Press Start 2P, "Courier New", monospace',
      fontSize: 12,
      fontWeight: 'bold',
    },
  })
  bubbleText.anchor.set(0.5)
  bubbleText.y = -4
  bubble.addChild(bubbleText)
  container.addChild(bubble)

  // Segmented crafting-style progress bar
  const progressBar = new Container()
  progressBar.y = -renderH - 4
  progressBar.zIndex = 4
  progressBar.visible = false
  const segments: Graphics[] = []
  const SEG_COUNT = 6
  const SEG_W = 6
  const SEG_GAP = 2
  const totalW = SEG_COUNT * SEG_W + (SEG_COUNT - 1) * SEG_GAP
  for (let i = 0; i < SEG_COUNT; i++) {
    const seg = new Graphics()
    seg.rect(0, 0, SEG_W, 6).fill({ color: 0x1a1320 }).stroke({ color: 0x6a4ed1, width: 1 })
    seg.x = -totalW / 2 + i * (SEG_W + SEG_GAP)
    progressBar.addChild(seg)
    segments.push(seg)
  }
  container.addChild(progressBar)

  // Label
  const label = new Text({
    text: agent.name.toUpperCase(),
    style: {
      fill: 0xfafafa,
      fontFamily: 'Press Start 2P, "Courier New", monospace',
      fontSize: 7,
      stroke: { color: 0x0a0518, width: 3 },
    },
  })
  label.anchor.set(0.5, 0)
  label.y = 6
  label.zIndex = 4
  container.addChild(label)

  /* ============================================================
     Animation state
     ============================================================ */

  let life: AgentLifeState = agent.state
  let frameTimer = 0
  let walkToggle = false
  let facing: 'left' | 'right' = 'right'
  let targetX = container.x
  let targetY = container.y
  let progress = agent.progress
  let selected = false
  let bubbleBob = 0
  let workBob = 0
  let clickCb: ((sx: number, sy: number) => void) | null = null

  function refreshTexture() {
    let kind: 'idle' | 'walkA' | 'walkB' | 'work' | 'celebrate' | 'locked' = 'idle'
    if (life === 'locked') kind = 'locked'
    else if (life === 'walking') kind = walkToggle ? 'walkA' : 'walkB'
    else if (life === 'working') kind = 'work'
    else if (life === 'celebrating' || life === 'delivered') kind = 'celebrate'
    else kind = 'idle'
    sprite.texture = getSpriteTexture(agent.palette, kind, facing === 'left', isStrategist)
  }

  function updateProgressBar() {
    const filled = Math.round(progress * SEG_COUNT)
    for (let i = 0; i < SEG_COUNT; i++) {
      segments[i]!.clear()
      if (i < filled) {
        segments[i]!
          .rect(0, 0, SEG_W, 6)
          .fill({ color: 0xc084fc })
          .stroke({ color: 0xfafafa, width: 1 })
      } else {
        segments[i]!
          .rect(0, 0, SEG_W, 6)
          .fill({ color: 0x1a1320 })
          .stroke({ color: 0x6a4ed1, width: 1 })
      }
    }
    progressBar.visible = life === 'working' && progress < 1
  }

  function updateBubble() {
    bubble.visible = agent.emote !== null && agent.emote !== undefined && agent.emote !== ''
    bubbleText.text = agent.emote ?? ''
  }

  container.on('pointertap', (e) => {
    if (clickCb) {
      const global = e.global
      clickCb(global.x, global.y)
    }
  })

  container.on('pointerover', () => {
    if (life !== 'locked') {
      sprite.tint = 0xfff5e8
    }
  })
  container.on('pointerout', () => {
    sprite.tint = 0xffffff
  })

  refreshTexture()
  updateBubble()
  updateProgressBar()

  const tickerFn = (ticker: Ticker) => {
    const dt = ticker.deltaMS / 1000

    // Walk toggle (animation frames)
    frameTimer += dt
    if (frameTimer > 0.18) {
      frameTimer = 0
      walkToggle = !walkToggle
      if (life === 'walking') refreshTexture()
    }

    // Movement
    const dx = targetX - container.x
    const dy = targetY - container.y
    const dist = Math.hypot(dx, dy)
    if (dist > 0.5 && life === 'walking') {
      const speed = WALK_SPEED
      const step = Math.min(dist, speed * dt)
      container.x += (dx / dist) * step
      container.y += (dy / dist) * step
      const newFacing: 'left' | 'right' = dx < 0 ? 'left' : 'right'
      if (newFacing !== facing) {
        facing = newFacing
        refreshTexture()
      }
    } else if (life === 'walking' && dist <= 0.5) {
      // arrived
      container.x = targetX
      container.y = targetY
      // do NOT auto-transition here; the scene / store decides what's next.
    }

    // Bubble bob
    if (bubble.visible) {
      bubbleBob += dt
      bubble.y = -renderH - 12 + Math.sin(bubbleBob * 4) * 2
    }

    // Working subtle bob
    if (life === 'working') {
      workBob += dt
      sprite.y = Math.sin(workBob * 5) * 1.5
    } else if (life === 'celebrating' || life === 'delivered') {
      workBob += dt
      sprite.y = -Math.abs(Math.sin(workBob * 6)) * 4
    } else {
      sprite.y = 0
    }

    // Idle subtle breathing
    if (life === 'idle') {
      sprite.scale.set(RENDER_SCALE, RENDER_SCALE + Math.sin(Date.now() / 600) * 0.01)
    } else {
      sprite.scale.set(RENDER_SCALE)
    }

    // Selection ring pulse
    if (selected) {
      const a = 0.55 + Math.sin(Date.now() / 280) * 0.25
      ring.alpha = a
    }
  }
  Ticker.shared.add(tickerFn)

  return {
    container,
    agentId: agent.id,
    setTargetTile(tileX, tileY) {
      targetX = (tileX + 0.5) * TILE
      targetY = (tileY + 1) * TILE
    },
    setLifeState(state) {
      life = state
      ring.visible = selected
      refreshTexture()
      updateProgressBar()
    },
    setEmote(e) {
      agent.emote = e
      updateBubble()
    },
    setProgress(p) {
      progress = p
      updateProgressBar()
    },
    setSelected(s) {
      selected = s
      ring.visible = s
    },
    isAtTarget: () => Math.hypot(targetX - container.x, targetY - container.y) < 1,
    destroy() {
      Ticker.shared.remove(tickerFn)
      container.destroy({ children: true })
    },
    onClick(cb) {
      clickCb = cb
    },
  }
  void FOOT_OFFSET
}
