// =====================================================================
// Centralised XP / level formula
// =====================================================================
// Single source of truth for the *rolling* progression used across Autars.
// It mirrors the Postgres RPCs EXACTLY so the UI never shows a level that
// disagrees with the database:
//
//   * agents (award_mission_xp): XP to reach L+1 = L * 100
//   * QG     (award_hq_xp):      XP to reach L+1 = L * 250
//
//   On level-up the surplus rolls over → a row stores { level, xp } where
//   `xp` is the remainder already accumulated INSIDE the current `level`.
//
// Keep these constants in sync with the SQL (migrations 004/005 + 011).
// =====================================================================

export const XP_BASE_BY_KIND = { agent: 100, hq: 250 } as const
export type XpKind = keyof typeof XP_BASE_BY_KIND

/** XP required to advance FROM `level` to `level + 1` (defaults to agent scale). */
export function getXpForNextLevel(level: number, kind: XpKind = 'agent'): number {
  return Math.max(1, Math.floor(level)) * XP_BASE_BY_KIND[kind]
}

/**
 * Level reached for a given CUMULATIVE total XP — the faithful inverse of the
 * award loop. Most callers already store `level` separately (the DB rows do)
 * and won't need this; it exists for totals/analytics and to guarantee one
 * formula lives in one place.
 */
export function getLevelFromXp(totalXp: number, kind: XpKind = 'agent'): number {
  let level = 1
  let remaining = Math.max(0, Math.floor(totalXp))
  while (remaining >= getXpForNextLevel(level, kind)) {
    remaining -= getXpForNextLevel(level, kind)
    level += 1
  }
  return level
}

/** Remainder of XP already accumulated inside the current level. */
export function getXpIntoLevel(totalXp: number, kind: XpKind = 'agent'): number {
  let level = 1
  let remaining = Math.max(0, Math.floor(totalXp))
  while (remaining >= getXpForNextLevel(level, kind)) {
    remaining -= getXpForNextLevel(level, kind)
    level += 1
  }
  return remaining
}

/** 0..1 progress of `xpIntoLevel` toward the next level. */
export function levelProgress(
  xpIntoLevel: number,
  level: number,
  kind: XpKind = 'agent',
): number {
  const need = getXpForNextLevel(level, kind)
  if (need <= 0) return 0
  return Math.min(1, Math.max(0, xpIntoLevel / need))
}
