/**
 * Session configuration constants
 */

/** Maximum commit duration in seconds (15 days) */
export const MAX_COMMIT_DURATION_SECONDS = 15 * 24 * 60 * 60 // 15 days

/** Maximum commit duration in days */
export const MAX_COMMIT_DURATION_DAYS = 15

/** Maximum reveal duration in seconds (7 days) */
export const MAX_REVEAL_DURATION_SECONDS = 7 * 24 * 60 * 60 // 7 days

/** Maximum reveal duration in days */
export const MAX_REVEAL_DURATION_DAYS = 7

/** Average block time in seconds (for calculating block range) */
export const AVERAGE_BLOCK_TIME_SECONDS = 12

/** Calculate how many blocks to query based on max commit duration */
export function getMaxBlockRange(): number {
  // Query blocks for MAX_COMMIT_DURATION + some buffer
  const totalSeconds = MAX_COMMIT_DURATION_SECONDS + 24 * 60 * 60 // +1 day buffer
  return Math.ceil(totalSeconds / AVERAGE_BLOCK_TIME_SECONDS)
}

/** Duration picker options for commit phase */
export const COMMIT_DURATION_OPTIONS = {
  minDays: 0,
  maxDays: MAX_COMMIT_DURATION_DAYS,
  minHours: 0,
  maxHours: 23,
  minMinutes: 0,
  maxMinutes: 59,
}

/** Duration picker options for reveal phase */
export const REVEAL_DURATION_OPTIONS = {
  minDays: 0,
  maxDays: MAX_REVEAL_DURATION_DAYS,
  minHours: 0,
  maxHours: 23,
  minMinutes: 0,
  maxMinutes: 59,
}
