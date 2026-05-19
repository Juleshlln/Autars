import { Texture } from 'pixi.js'
import type { AgentPalette } from './store'

/* ============================================================
   Pixel-art helpers — turns ASCII art into PIXI textures.
   Each character is a color code referencing a palette.

   Color codes:
     . → transparent
     # → outline (very dark)
     s → skin
     S → skin highlight
     h → hair
     H → hair highlight
     b → shirt (body)
     B → shirt accent / stripe
     p → pants
     P → pants highlight
     z → shoes
     g → glasses lens
     G → glasses frame
     t → hat top
     T → hat brim
     w → white (eyes, teeth)
     k → near-black (eyes/pupils)
   ============================================================ */

export const SPRITE_W = 16
export const SPRITE_H = 24
export const SCALE = 4 // upscale on the texture so the canvas is crisp at any zoom

type Frame = string[]

/* Body silhouettes (16×24). Empty rows kept short for readability — padded later. */

const IDLE_BASE: Frame = [
  '....######......',
  '...#ssssss#.....',
  '..#ssssssss#....',
  '..#sShhhhSs#....',
  '.#sshhhhhhss#...',
  '.#sshhhhhhss#...',
  '.#sshhhhhhss#...',
  '..#wgkwkgws#....',
  '..#ssssssss#....',
  '..#ssssssss#....',
  '...#bBBBb#......',
  '..#bbBbBbb#.....',
  '.#bbbBBBbbb#....',
  '.#bbbBBBbbb#....',
  '#bbbbBBBbbbb#...',
  '#bbbbbbbbbbb#...',
  '.#bbbbbbbbb#....',
  '..#pppppppp#....',
  '..#pppppppp#....',
  '..#pppppppp#....',
  '..#pp####pp#....',
  '..#pp#..#pp#....',
  '..#zz#..#zz#....',
  '..####..####....',
]

const WALK_A: Frame = [
  '....######......',
  '...#ssssss#.....',
  '..#ssssssss#....',
  '..#sShhhhSs#....',
  '.#sshhhhhhss#...',
  '.#sshhhhhhss#...',
  '.#sshhhhhhss#...',
  '..#wgkwkgws#....',
  '..#ssssssss#....',
  '..#ssssssss#....',
  '...#bBBBb#......',
  '..#bbBbBbb#.....',
  '.#bbbBBBbbb#....',
  '.#bbbBBBbbb#....',
  '#bbbbBBBbbbb#...',
  '#bbbbbbbbbbb#...',
  '.#bbbbbbbbb#....',
  '..#pppppppp#....',
  '...#pppppp#.....',
  '..#pppppppp#....',
  '..#pp####...#...',
  '..#pp#..#pp#....',
  '..#zz#..#zz#....',
  '..####..####....',
]

const WALK_B: Frame = [
  '....######......',
  '...#ssssss#.....',
  '..#ssssssss#....',
  '..#sShhhhSs#....',
  '.#sshhhhhhss#...',
  '.#sshhhhhhss#...',
  '.#sshhhhhhss#...',
  '..#wgkwkgws#....',
  '..#ssssssss#....',
  '..#ssssssss#....',
  '...#bBBBb#......',
  '..#bbBbBbb#.....',
  '.#bbbBBBbbb#....',
  '.#bbbBBBbbb#....',
  '#bbbbBBBbbbb#...',
  '#bbbbbbbbbbb#...',
  '.#bbbbbbbbb#....',
  '..#pppppppp#....',
  '..#pppppppp#....',
  '...#pppppp#.....',
  '...#####pp#.....',
  '..#pp#..#pp#....',
  '..#zz#..#zz#....',
  '..####..####....',
]

const WORK: Frame = [
  '....######......',
  '...#ssssss#.....',
  '..#ssssssss#....',
  '..#sShhhhSs#....',
  '.#sshhhhhhss#...',
  '.#sshhhhhhss#...',
  '.#sshhhhhhss#...',
  '..#wgkwkgws#....',
  '..#ssssssss#....',
  '..#ssssssss#....',
  '...#bBBBb#......',
  '##bbBbBbb##.....',
  '#sbbbBBBbbs#....',
  '#sbbbBBBbbs#....',
  '.#bbbBBBbbb#....',
  '.#bbbbbbbbb#....',
  '..#bbbbbbb#.....',
  '..#pppppppp#....',
  '..#pppppppp#....',
  '..#pppppppp#....',
  '..#pp####pp#....',
  '..#pp#..#pp#....',
  '..#zz#..#zz#....',
  '..####..####....',
]

const CELEBRATE: Frame = [
  '.s#......#s.....',
  '.s#......#s.....',
  '..######........',
  '.#ssssss#.......',
  '#ssssssss#......',
  '#sShhhhSs#......',
  '#sshhhhhhs#.....',
  '#sshhhhhhs#.....',
  '#sshhhhhhs#.....',
  '.#wgkwkgws#.....',
  '.#ssssssss#.....',
  '.#bBBBBBBb#.....',
  '#bbBBBBBBbb#....',
  '#bbBBBBBBbb#....',
  '#bbBBBBBBbb#....',
  '.#bbbbbbbbb#....',
  '..#pppppppp#....',
  '..#pppppppp#....',
  '..#pppppppp#....',
  '..#pp####pp#....',
  '..#pp#..#pp#....',
  '..#zz#..#zz#....',
  '..####..####....',
  '................',
]

/* Hat layers — overlaid on top of base body. Used for the strategist. */
const HAT_CAP: Frame = [
  '...#TTTT#.......',
  '..#tttttt#......',
  '..#tttttt#......',
  '.#TTTTTTTT#TT#..',
  '..####..####....',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
]

/* Locked silhouette frame — agent appears as a ghostly silhouette. */
const LOCKED: Frame = [
  '....######......',
  '...########.....',
  '..##########....',
  '..##########....',
  '.############...',
  '.############...',
  '.############...',
  '..##########....',
  '..##########....',
  '..##########....',
  '...########.....',
  '..##########....',
  '.############...',
  '.############...',
  '############....',
  '############....',
  '.##########.....',
  '..##########....',
  '..##########....',
  '..##########....',
  '..####..####....',
  '..####..####....',
  '..####..####....',
  '..####..####....',
]

export type SpriteKind = 'idle' | 'walkA' | 'walkB' | 'work' | 'celebrate' | 'locked'

const FRAME_BY_KIND: Record<SpriteKind, Frame> = {
  idle: IDLE_BASE,
  walkA: WALK_A,
  walkB: WALK_B,
  work: WORK,
  celebrate: CELEBRATE,
  locked: LOCKED,
}

/* ============================================================
   Renderer
   ============================================================ */

function paletteColor(palette: AgentPalette, code: string): number | null {
  switch (code) {
    case '.':
      return null
    case '#':
      return 0x1a1320
    case 's':
      return palette.skin
    case 'S':
      return lighten(palette.skin, 0.12)
    case 'h':
      return palette.hair
    case 'H':
      return lighten(palette.hair, 0.18)
    case 'b':
      return palette.shirt
    case 'B':
      return palette.shirtAccent
    case 'p':
      return palette.pants
    case 'P':
      return lighten(palette.pants, 0.12)
    case 'z':
      return palette.shoes
    case 'g':
      return palette.glasses ?? 0xffffff
    case 'G':
      return 0x111111
    case 't':
      return palette.hatTop ?? palette.shirtAccent
    case 'T':
      return palette.hatBrim ?? 0x1a1320
    case 'w':
      return 0xfafafa
    case 'k':
      return 0x111111
    default:
      return null
  }
}

function lighten(color: number, amount: number) {
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff
  const nr = Math.min(255, Math.round(r + (255 - r) * amount))
  const ng = Math.min(255, Math.round(g + (255 - g) * amount))
  const nb = Math.min(255, Math.round(b + (255 - b) * amount))
  return (nr << 16) | (ng << 8) | nb
}

function colorToRgb(c: number): [number, number, number, number] {
  return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff, 255]
}

/* Render a frame (possibly with a hat overlay) to a tinted canvas, then to a Texture. */
function renderFrameTexture(
  palette: AgentPalette,
  base: Frame,
  hat: Frame | null,
  flip: boolean,
): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = SPRITE_W * SCALE
  canvas.height = SPRITE_H * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  const drawFrame = (frame: Frame) => {
    for (let y = 0; y < SPRITE_H; y++) {
      const row = frame[y] ?? ''
      for (let x = 0; x < SPRITE_W; x++) {
        const c = row[x] ?? '.'
        const color = paletteColor(palette, c)
        if (color === null) continue
        const [r, g, b, a] = colorToRgb(color)
        ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`
        const px = flip ? (SPRITE_W - 1 - x) : x
        ctx.fillRect(px * SCALE, y * SCALE, SCALE, SCALE)
      }
    }
  }

  drawFrame(base)
  if (hat) drawFrame(hat)

  const texture = Texture.from(canvas)
  texture.source.scaleMode = 'nearest'
  return texture
}

/* ============================================================
   Public API — sprite cache keyed by palette + kind + flip
   ============================================================ */

const cache = new Map<string, Texture>()

export function getSpriteTexture(
  palette: AgentPalette,
  kind: SpriteKind,
  flip = false,
  hasHat = false,
): Texture {
  const key = `${kind}|${flip ? 'L' : 'R'}|${hasHat ? 'H' : 'N'}|${paletteKey(palette)}`
  const cached = cache.get(key)
  if (cached) return cached
  const base = FRAME_BY_KIND[kind]
  const hat = hasHat && kind !== 'locked' ? HAT_CAP : null
  const tex = renderFrameTexture(palette, base, hat, flip)
  cache.set(key, tex)
  return tex
}

function paletteKey(p: AgentPalette) {
  return `${p.skin}-${p.hair}-${p.shirt}-${p.shirtAccent}-${p.pants}-${p.shoes}-${p.hatTop ?? 0}-${
    p.hatBrim ?? 0
  }-${p.glasses ?? 0}`
}
