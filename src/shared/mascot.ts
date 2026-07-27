/**
 * Pure state logic for the little composer mascot ("Lo").
 *
 * The mascot sits above the input box and reacts to what the app is doing:
 * it taps away at a tiny laptop while a prompt is being answered, celebrates
 * briefly when a run finishes, and otherwise idles — occasionally peeking
 * around or batting a little ball while it waits for you.
 *
 * Like the other cores in src/shared, this file is pure and deterministic (it
 * never reads the clock — callers pass `now` / elapsed time), so the animation
 * state machine can be unit-tested without React or the DOM. The SVG + CSS that
 * render these states live in components/Chat/Mascot.tsx.
 */

/** High-level animation state. */
export type MascotState = 'idle' | 'thinking' | 'celebrate'

/** Sub-activity used while idling, to give the mascot a bit of life. */
export type IdleActivity = 'rest' | 'peek' | 'play'

/** How long the celebration plays after a run finishes (ms). */
export const CELEBRATE_MS = 1600

export interface MascotInputs {
  /** True while a prompt is being answered (drives the "typing" animation). */
  busy: boolean
  /** Epoch ms until which to celebrate; set when a run finishes. */
  celebrateUntil?: number
  /** Current time (epoch ms), supplied by the caller. */
  now: number
}

/**
 * Map the app's state to the mascot's animation state. Being busy always wins
 * (it's actively working); otherwise a recent finish celebrates until its
 * window elapses; otherwise it idles.
 */
export function computeMascotState({ busy, celebrateUntil, now }: MascotInputs): MascotState {
  if (busy) return 'thinking'
  if (celebrateUntil && now < celebrateUntil) return 'celebrate'
  return 'idle'
}

/**
 * The idle "personality" loop: mostly resting, with an occasional peek around
 * or a little game of ball. Driven purely by how long it's been idle so the
 * choice is deterministic and testable. `idleMs` is clamped at 0.
 */
const IDLE_CYCLE: readonly IdleActivity[] = ['rest', 'rest', 'peek', 'rest', 'play', 'rest']

export function pickIdleActivity(idleMs: number, periodMs = 5000): IdleActivity {
  const ms = idleMs > 0 ? idleMs : 0
  const step = periodMs > 0 ? periodMs : 5000
  const idx = Math.floor(ms / step) % IDLE_CYCLE.length
  return IDLE_CYCLE[idx]
}
