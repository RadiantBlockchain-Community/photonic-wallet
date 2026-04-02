/**
 * Glyph v2 Timelocked Content Support
 * Reference: Glyph v2 Token Standard Section 17
 */

import { GlyphV2Metadata } from "./v2metadata";
import { GLYPH_TIMELOCK } from "./protocols";

/**
 * Check if timelocked content is unlocked (timelock has expired)
 */
export function isUnlocked(metadata: GlyphV2Metadata): boolean {
  if (!metadata.p.includes(GLYPH_TIMELOCK)) {
    return true; // Not timelocked, always unlocked
  }

  const app = (metadata as Record<string, unknown>).app as
    | { timelock?: { unlock_time?: number } }
    | undefined;

  if (!app?.timelock?.unlock_time) {
    return true; // No unlock time set
  }

  const now = Math.floor(Date.now() / 1000);
  return now >= app.timelock.unlock_time;
}

/**
 * Get time remaining until unlock (in seconds)
 * Returns 0 if already unlocked
 */
export function getTimeRemaining(metadata: GlyphV2Metadata): number {
  const app = (metadata as Record<string, unknown>).app as
    | { timelock?: { unlock_time?: number } }
    | undefined;

  if (!app?.timelock?.unlock_time) {
    return 0;
  }

  const now = Math.floor(Date.now() / 1000);
  const remaining = app.timelock.unlock_time - now;
  return remaining > 0 ? remaining : 0;
}

/**
 * Format time remaining as human-readable string
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "Unlocked";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(" ") : "< 1m";
}
