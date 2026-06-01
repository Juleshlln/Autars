// =====================================================================
// Centralised XP / level formula
// =====================================================================
// Single source of truth for the *rolling* progression used across Autars.
// It mirrors the Postgres RPCs `award_mission_xp` / `award_hq_xp` exactly so
// the UI never shows a level that disagrees with the database:
//
//   XP to go from level L to L+1   =  L * 100
//   on level-up the surplus rolls over → a row stores { level, xp } where
//   `xp` is the remainder already accumulated INSIDE the current `level`.
//
// Agents and the QG (workspace) both use this. Keep it in sync with the SQL.
// =====================================================================

export const XP_PER_LEVEL_BASE = 100

/** XP required to advance FROM `level` to `level + 1`. */
export function getXpForNextLevel(level: number): number {
  return Math.max(1, Math.floor(level)) * XP_PER_LEVEL_BASE
}

/**
 * Level reached for a given CUMULATIVE total XP — the faithful inverse of the
 * award loop. Most callers already store `level` separately (the DB rows do)
 * and won't need this; it exists for totals/analytics and to guarantee one
 * formula lives in one place.
 */
export function getLevelFromXp(totalXp: number): number {
  let level = 1
  let remaining = Math.max(0, Math.floor(totalXp))
  while (remaining >= getXpForNextLevel(level)) {
    remaining -= getXpForNextLevel(level)
    level += 1
  }
  return level
}

/** Remainder of XP already accumulated inside the current level. */
export function getXpIntoLevel(totalXp: number): number {
  let level = 1
  let remaining = Math.max(0, Math.floor(totalXp))
  while (remaining >= getXpForNextLevel(level)) {
    remaining -= getXpForNextLevel(level)
    level += 1
  }
  return remaining
}

/** 0..1 progress of `xpIntoLevel` toward the next level. */
export function levelProgress(xpIntoLevel: number, level: number): number {
  const need = getXpForNextLevel(level)
  if (need <= 0) return 0
  return Math.min(1, Math.max(0, xpIntoLevel / need))
}
