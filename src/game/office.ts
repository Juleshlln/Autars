import { Container, Graphics, Sprite, Texture, Ticker } from 'pixi.js'

/* ============================================================
   Office tile map renderer

   Coordinate system: tileSize = 32 px, grid = 24 × 14 tiles.
   At HQ level 1 the visible decoration is sparse (garage vibe),
   level 2 fills out the room, level 3+ adds a second floor of screens.
   ============================================================ */

export const TILE = 32
export const GRID_W = 24
export const GRID_H = 14

export const OFFICE_PX_W = GRID_W * TILE
export const OFFICE_PX_H = GRID_H * TILE

/* Premium dark palette — the office reads like a holographic surveillance feed.
   Floors and walls stay in deep blue-violets so the agents and neon flow lines
   are the only bright elements. */
const FLOOR_LIGHT = 0x141525
const FLOOR_DARK = 0x101120
const WALL_TOP = 0x0a0b14
const WALL_LIGHT = 0x1c1d2c
const WALL_TRIM = 0x2a2b3d

const DESK_TOP = 0x1d1e2c
const DESK_EDGE = 0x0e0f17
const SCREEN_FRAME = 0x0a0b12
const SCREEN_ON = 0x4f7fff
const SCREEN_ON_2 = 0x7b7bec
const KEYBOARD = 0x0a0b12

const WHITEBOARD = 0xcacbd9
const WHITEBOARD_FRAME = 0x0c0d18
const MARKER_RED = 0xc25a5a
const MARKER_BLUE = 0x6ab5d6

const PLANT_DARK = 0x1a3b2f
const PLANT_LIGHT = 0x2f6b54
const PLANT_POT = 0x2a1f1a

const RUG = 0x1e1b3a
const RUG_LIGHT = 0x2a2750

/* Draw a pixel-art rectangle with a 1px dark outline + light highlight. */
function chunkRect(g: Graphics, x: number, y: number, w: number, h: number, color: number) {
  g.rect(x, y, w, h).fill({ color })
}

function outlineRect(g: Graphics, x: number, y: number, w: number, h: number, color: number, outline = 0x0a0518) {
  g.rect(x, y, w, h).fill({ color }).stroke({ color: outline, width: 2, alignment: 1 })
}

/* ============================================================
   Generators per HQ level
   ============================================================ */

export interface OfficeBuild {
  container: Container
  destroy: () => void
}

export function buildOffice(level: number): OfficeBuild {
  const root = new Container()
  root.sortableChildren = true

  // Floor — checkerboard pixel tiles
  const floor = new Graphics()
  for (let y = 2; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const c = (x + y) % 2 === 0 ? FLOOR_LIGHT : FLOOR_DARK
      chunkRect(floor, x * TILE, y * TILE, TILE, TILE, c)
    }
  }
  // Faint floor lines — barely visible grid that hints at the tile system
  for (let y = 2; y <= GRID_H; y++) {
    floor.rect(0, y * TILE - 1, OFFICE_PX_W, 1).fill({ color: 0x05060c, alpha: 0.55 })
  }
  for (let x = 0; x <= GRID_W; x++) {
    floor.rect(x * TILE - 1, 2 * TILE, 1, (GRID_H - 2) * TILE).fill({ color: 0x05060c, alpha: 0.55 })
  }
  floor.zIndex = 0
  root.addChild(floor)

  // Back wall
  const wall = new Graphics()
  chunkRect(wall, 0, 0, OFFICE_PX_W, 2 * TILE, WALL_TOP)
  // Wall trim
  wall.rect(0, 2 * TILE - 4, OFFICE_PX_W, 4).fill({ color: WALL_TRIM })
  // Light strips on the wall
  for (let i = 1; i < 6; i++) {
    const x = (OFFICE_PX_W / 6) * i
    wall.rect(x - 1, 6, 2, 2 * TILE - 12).fill({ color: WALL_LIGHT, alpha: 0.6 })
  }
  // Wall text logo: "AUTARS HQ"
  drawPixelText(wall, 'AUTARS HQ', OFFICE_PX_W / 2 - 56, 14, WALL_TRIM)
  wall.zIndex = 1
  root.addChild(wall)

  // Rug
  const rug = new Graphics()
  outlineRect(rug, 7 * TILE, 7 * TILE, 10 * TILE, 4 * TILE, RUG, RUG_LIGHT)
  for (let i = 0; i < 6; i++) {
    rug.rect(7 * TILE + 8 + i * 50, 7 * TILE + 8, 32, 4 * TILE - 16).fill({ color: RUG_LIGHT, alpha: 0.25 })
  }
  rug.zIndex = 2
  root.addChild(rug)

  // Desks (placed at tile coordinates that match workspaces in store.ts)
  drawDesk(root, 6, 5, /*has screen*/ true, SCREEN_ON)
  drawDesk(root, 12, 5, false)
  if (level >= 2) drawDesk(root, 18, 5, true, SCREEN_ON_2)
  if (level >= 2) drawDesk(root, 6, 9, true, SCREEN_ON)
  if (level >= 3) drawDesk(root, 18, 9, true, SCREEN_ON_2)

  // Whiteboard
  drawWhiteboard(root, 12, 3)
  // Brainstorm corkboard
  drawBrainstorm(root, 4, 11)
  // Server rack (level 2+)
  if (level >= 2) drawServerRack(root, 20, 11)
  // Coffee machine
  drawCoffeeMachine(root, 12, 11)

  // Plants
  drawPlant(root, 2, 12)
  if (level >= 2) drawPlant(root, 21, 4)
  if (level >= 3) drawPlant(root, 22, 12)

  // Window panels on the back wall (level 2+) — pure decoration
  if (level >= 2) drawWindow(root, 3, 0)
  if (level >= 2) drawWindow(root, 20, 0)

  return {
    container: root,
    destroy: () => root.destroy({ children: true }),
  }
}

/* ============================================================
   Furniture primitives
   ============================================================ */

function drawDesk(parent: Container, tileX: number, tileY: number, hasScreen: boolean, screenColor = SCREEN_ON) {
  const g = new Graphics()
  const x = tileX * TILE - TILE
  const y = tileY * TILE
  // Desk top
  outlineRect(g, x, y, TILE * 2, TILE - 4, DESK_TOP)
  // Desk legs (front face)
  g.rect(x + 4, y + TILE - 4, 6, 12).fill({ color: DESK_EDGE })
  g.rect(x + TILE * 2 - 10, y + TILE - 4, 6, 12).fill({ color: DESK_EDGE })
  // Keyboard
  g.rect(x + 14, y + 14, 36, 6).fill({ color: KEYBOARD })

  if (hasScreen) {
    // Monitor body
    outlineRect(g, x + 18, y - 22, 28, 22, SCREEN_FRAME)
    // Screen surface
    g.rect(x + 20, y - 20, 24, 16).fill({ color: screenColor })
    // Scanlines for a CRT feel
    for (let i = 0; i < 4; i++) {
      g.rect(x + 20, y - 20 + i * 4, 24, 1).fill({ color: 0x000000, alpha: 0.18 })
    }
    // Stand
    g.rect(x + 30, y - 4, 4, 6).fill({ color: SCREEN_FRAME })
    g.rect(x + 24, y + 2, 16, 3).fill({ color: SCREEN_FRAME })
  }

  g.zIndex = 3
  parent.addChild(g)
}

function drawWhiteboard(parent: Container, tileX: number, tileY: number) {
  const g = new Graphics()
  const x = tileX * TILE - TILE
  const y = tileY * TILE - 8
  // Frame
  outlineRect(g, x, y, TILE * 2, TILE + 8, WHITEBOARD_FRAME)
  // Surface
  g.rect(x + 3, y + 3, TILE * 2 - 6, TILE + 2).fill({ color: WHITEBOARD })
  // Diagrams: simple boxes connected by lines
  g.rect(x + 8, y + 10, 14, 8).fill({ color: MARKER_BLUE })
  g.rect(x + 30, y + 10, 14, 8).fill({ color: MARKER_RED })
  g.rect(x + 52, y + 10, 8, 8).fill({ color: 0x222222 })
  g.rect(x + 22, y + 13, 8, 2).fill({ color: 0x222222 })
  g.rect(x + 44, y + 13, 8, 2).fill({ color: 0x222222 })
  g.rect(x + 8, y + 24, 50, 2).fill({ color: 0x222222, alpha: 0.5 })
  g.rect(x + 8, y + 28, 36, 2).fill({ color: 0x222222, alpha: 0.5 })
  g.zIndex = 3
  parent.addChild(g)
}

function drawBrainstorm(parent: Container, tileX: number, tileY: number) {
  const g = new Graphics()
  const x = tileX * TILE
  const y = tileY * TILE - 24
  // Corkboard
  outlineRect(g, x, y, TILE * 2, TILE + 16, 0x6a4032)
  g.rect(x + 3, y + 3, TILE * 2 - 6, TILE + 10).fill({ color: 0xb88660 })
  // Sticky notes
  const colors = [0xfde68a, 0xfca5a5, 0xa5f3fc, 0xc4b5fd]
  for (let i = 0; i < 6; i++) {
    const cx = x + 6 + (i % 3) * 18
    const cy = y + 6 + Math.floor(i / 3) * 16
    g.rect(cx, cy, 12, 12).fill({ color: colors[i % colors.length]! })
    g.rect(cx + 4, cy, 4, 2).fill({ color: 0x6a4032, alpha: 0.6 })
  }
  g.zIndex = 3
  parent.addChild(g)
}

function drawServerRack(parent: Container, tileX: number, tileY: number) {
  const g = new Graphics()
  const x = tileX * TILE
  const y = tileY * TILE - 28
  outlineRect(g, x, y, TILE, TILE + 20, 0x1a1228)
  for (let i = 0; i < 6; i++) {
    g.rect(x + 4, y + 4 + i * 8, TILE - 8, 5).fill({ color: 0x2a2040 })
    g.rect(x + 6, y + 5 + i * 8, 4, 3).fill({ color: i % 2 === 0 ? 0x34d399 : 0xfbbf24 })
    g.rect(x + 12, y + 5 + i * 8, 2, 3).fill({ color: 0xef4444 })
  }
  g.zIndex = 3
  parent.addChild(g)
}

function drawCoffeeMachine(parent: Container, tileX: number, tileY: number) {
  const g = new Graphics()
  const x = tileX * TILE
  const y = tileY * TILE - 18
  outlineRect(g, x + 4, y, TILE - 8, TILE + 8, 0x1f2937)
  // Display
  g.rect(x + 8, y + 4, TILE - 16, 6).fill({ color: 0x22d3ee })
  // Spout
  g.rect(x + 10, y + 14, TILE - 20, 4).fill({ color: 0xd1d5db })
  // Cup
  g.rect(x + 12, y + 22, TILE - 24, 8).fill({ color: 0xfafafa })
  g.rect(x + 14, y + 20, TILE - 28, 4).fill({ color: 0x6b3a18 })
  g.zIndex = 3
  parent.addChild(g)
}

function drawPlant(parent: Container, tileX: number, tileY: number) {
  const g = new Graphics()
  const x = tileX * TILE
  const y = tileY * TILE - 16
  // Pot
  g.rect(x + 4, y + 18, 24, 10).fill({ color: PLANT_POT })
  g.rect(x + 4, y + 16, 24, 4).fill({ color: 0x3a1f10 })
  // Leaves
  g.circle(x + 16, y + 10, 12).fill({ color: PLANT_DARK })
  g.circle(x + 10, y + 6, 7).fill({ color: PLANT_LIGHT })
  g.circle(x + 22, y + 8, 7).fill({ color: PLANT_LIGHT })
  g.circle(x + 16, y + 4, 6).fill({ color: PLANT_DARK })
  g.zIndex = 3
  parent.addChild(g)
}

function drawWindow(parent: Container, tileX: number, tileY: number) {
  const g = new Graphics()
  const x = tileX * TILE
  const y = tileY * TILE
  outlineRect(g, x, y + 8, TILE * 2, TILE + 6, 0x67e8f9)
  g.rect(x + 3, y + 11, TILE * 2 - 6, TILE).fill({ color: 0x1e293b })
  // Stars
  for (let i = 0; i < 8; i++) {
    const sx = x + 5 + (i * 8) % (TILE * 2 - 10)
    const sy = y + 14 + Math.floor((i * 13) % (TILE - 6))
    g.rect(sx, sy, 2, 2).fill({ color: 0xfafafa, alpha: 0.9 })
  }
  // Window mullions
  g.rect(x + TILE - 1, y + 8, 2, TILE + 6).fill({ color: 0x67e8f9 })
  g.zIndex = 2
  parent.addChild(g)
}

/* ============================================================
   Tiny pixel-text rasterizer for the wall logo
   ============================================================ */

const PIXEL_FONT: Record<string, string[]> = {
  A: ['.##.', '#..#', '####', '#..#', '#..#'],
  U: ['#..#', '#..#', '#..#', '#..#', '.##.'],
  T: ['####', '.#..', '.#..', '.#..', '.#..'],
  R: ['###.', '#..#', '###.', '#.#.', '#..#'],
  S: ['.###', '#...', '.##.', '...#', '###.'],
  H: ['#..#', '#..#', '####', '#..#', '#..#'],
  Q: ['.##.', '#..#', '#.##', '#..#', '.###'],
  ' ': ['....', '....', '....', '....', '....'],
}

function drawPixelText(g: Graphics, text: string, x: number, y: number, color: number) {
  const px = 2
  let cursor = x
  for (const ch of text.toUpperCase()) {
    const glyph = PIXEL_FONT[ch] ?? PIXEL_FONT[' ']!
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row]!.length; col++) {
        if (glyph[row]![col] === '#') {
          g.rect(cursor + col * px, y + row * px, px, px).fill({ color })
        }
      }
    }
    cursor += 5 * px
  }
}

/* ============================================================
   Pulsing Autars Core — central energy node
   ============================================================ */

export function buildAutarsCore(): { container: Container; setIntensity: (n: number) => void; destroy: () => void } {
  const root = new Container()
  const cx = OFFICE_PX_W / 2
  const cy = (GRID_H - 2) * TILE / 2 + 2 * TILE
  root.x = cx
  root.y = cy

  // Outer glow (additive sprite)
  const halo = new Graphics()
  halo.circle(0, 0, 68).fill({ color: 0xc084fc, alpha: 0.18 })
  halo.circle(0, 0, 52).fill({ color: 0x7b7bec, alpha: 0.25 })
  halo.zIndex = 0
  root.addChild(halo)

  // Rings
  const ring = new Graphics()
  ring.circle(0, 0, 48).stroke({ color: 0xc084fc, width: 2, alpha: 0.4 })
  ring.circle(0, 0, 38).stroke({ color: 0x7b7bec, width: 1, alpha: 0.6 })
  ring.zIndex = 1
  root.addChild(ring)

  // Core diamond
  const core = new Graphics()
  core.moveTo(0, -28).lineTo(22, 0).lineTo(0, 28).lineTo(-22, 0).closePath()
  core.fill({ color: 0xa855f7 })
  core.moveTo(0, -18).lineTo(14, 0).lineTo(0, 18).lineTo(-14, 0).closePath()
  core.fill({ color: 0xfafafa, alpha: 0.85 })
  core.zIndex = 2
  root.addChild(core)

  // "A" letter
  const letter = new Graphics()
  letter.rect(-2, -8, 4, 16).fill({ color: 0x6a32c8 })
  letter.rect(-8, 6, 16, 3).fill({ color: 0x6a32c8 })
  letter.rect(-7, 0, 14, 3).fill({ color: 0x6a32c8 })
  letter.zIndex = 3
  root.addChild(letter)

  let intensity = 1
  let t = 0
  const tickerFn = (ticker: Ticker) => {
    t += ticker.deltaMS / 1000
    const pulse = 0.92 + Math.sin(t * 1.6) * 0.05 * intensity
    root.scale.set(pulse)
    halo.alpha = 0.7 + Math.sin(t * 1.8) * 0.18 * intensity
    ring.rotation = t * 0.3
  }
  Ticker.shared.add(tickerFn)

  return {
    container: root,
    setIntensity: (n) => {
      intensity = n
    },
    destroy: () => {
      Ticker.shared.remove(tickerFn)
      root.destroy({ children: true })
    },
  }
}

/* ============================================================
   Floating particle helper for flow lines
   ============================================================ */

export function buildFlowParticles(): { container: Container; tex: Texture } {
  const container = new Container()
  // build a tiny glowing dot once and reuse
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 8
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(4, 4, 0, 4, 4, 4)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.5, 'rgba(192,132,252,0.75)')
  grad.addColorStop(1, 'rgba(192,132,252,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 8, 8)
  const tex = Texture.from(canvas)
  return { container, tex }
}

export function spawnParticle(
  parent: Container,
  tex: Texture,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: number,
  durationMs = 1100,
) {
  const sprite = new Sprite(tex)
  sprite.anchor.set(0.5)
  sprite.x = from.x
  sprite.y = from.y
  sprite.tint = color
  sprite.alpha = 0
  sprite.scale.set(1.5)
  parent.addChild(sprite)
  const start = performance.now()
  const tickerFn = (ticker: Ticker) => {
    const elapsed = performance.now() - start
    const t = Math.min(1, elapsed / durationMs)
    sprite.x = from.x + (to.x - from.x) * t
    sprite.y = from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * 14
    sprite.alpha = Math.sin(t * Math.PI)
    sprite.scale.set(1.6 - t * 0.6)
    if (t >= 1) {
      Ticker.shared.remove(tickerFn)
      sprite.destroy()
    }
    void ticker
  }
  Ticker.shared.add(tickerFn)
}
