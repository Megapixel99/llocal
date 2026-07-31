/**
 * Pure state logic for the little composer mascot ("Lo").
 *
 * The mascot sits above the input box and reacts to what the app is doing. While
 * a prompt is in flight it shows one of two poses:
 *   - reading    — the model is thinking or researching (a `<think>` block or a
 *                  DeepResearch web sweep); Lo reads a little book;
 *   - responding — the model is writing the answer; Lo types on a tiny laptop.
 * When a run finishes it celebrates briefly, and otherwise it idles — resting
 * mostly, but now and then peeking around, batting a little ball, having a big
 * stretch, waving hello, or dozing off for a moment while it waits.
 *
 * Like the other cores in src/shared, this file is pure and deterministic (it
 * never reads the clock — callers pass `now` / elapsed time), so the animation
 * state machine can be unit-tested without React or the DOM. The SVG + CSS that
 * render these states live in components/Chat/Mascot.tsx.
 */

/** High-level animation state. */
export type MascotState = 'idle' | 'reading' | 'responding' | 'celebrate'

/** What the model is doing while busy. */
export type BusyPhase = 'reading' | 'responding'

/**
 * Sub-activity used while idling, to give the mascot a bit of life:
 *   - rest    — the calm default bob;
 *   - peek    — glances left and right;
 *   - play    — bats a little bouncing ball;
 *   - stretch — reaches its arms up for a big stretch;
 *   - wave    — waves a friendly hello;
 *   - sleep   — dozes off with drifting "Zzz".
 */
export type IdleActivity = 'rest' | 'peek' | 'play' | 'stretch' | 'wave' | 'sleep'

/** How long the celebration plays after a run finishes (ms). */
export const CELEBRATE_MS = 1600

export interface MascotInputs {
  /** True while a prompt is being answered. */
  busy: boolean
  /**
   * What the model is doing while busy: 'reading' (thinking/researching) or
   * 'responding' (writing the answer). Defaults to 'responding' (e.g. the coding
   * agent, which is working away) when unknown.
   */
  phase?: BusyPhase
  /** Epoch ms until which to celebrate; set when a run finishes. */
  celebrateUntil?: number
  /** Current time (epoch ms), supplied by the caller. */
  now: number
}

/**
 * Map the app's state to the mascot's animation state. Being busy always wins
 * (it's actively working) and picks reading vs responding from `phase`;
 * otherwise a recent finish celebrates until its window elapses; otherwise idle.
 */
export function computeMascotState({ busy, phase, celebrateUntil, now }: MascotInputs): MascotState {
  if (busy) return phase === 'reading' ? 'reading' : 'responding'
  if (celebrateUntil && now < celebrateUntil) return 'celebrate'
  return 'idle'
}

/**
 * Decide, from what a model has streamed so far, whether it is still
 * thinking/reading or has begun writing the answer — so the mascot can switch
 * between the reading and typing poses. Handles both inline `<think>…</think>`
 * blocks and Ollama's separate reasoning ("thinking") token stream.
 */
export function streamPhase(content: string, thinkingLength: number): BusyPhase {
  const c = content ?? ''
  const lastOpen = c.lastIndexOf('<think>')
  const lastClose = c.lastIndexOf('</think>')
  // Currently inside an unclosed <think> block → still reasoning.
  if (lastOpen !== -1 && lastOpen > lastClose) return 'reading'
  // Any answer text outside the think block means the answer has started.
  const answer = c.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  if (answer.length > 0) return 'responding'
  // Only separate reasoning tokens so far (or nothing yet) → still reading.
  if (thinkingLength > 0) return 'reading'
  return 'reading'
}

/**
 * The idle "personality" loop: mostly resting, with an occasional peek around,
 * a little game of ball, a big stretch, a friendly wave, or a short doze. Each
 * lively beat is separated by a rest so the mascot never feels frantic. Driven
 * purely by how long it's been idle so the choice is deterministic and
 * testable. `idleMs` is clamped at 0.
 */
const IDLE_CYCLE: readonly IdleActivity[] = [
  'rest',
  'rest',
  'peek',
  'rest',
  'play',
  'rest',
  'stretch',
  'rest',
  'wave',
  'rest',
  'sleep',
  'rest'
]

export function pickIdleActivity(idleMs: number, periodMs = 5000): IdleActivity {
  const ms = idleMs > 0 ? idleMs : 0
  const step = periodMs > 0 ? periodMs : 5000
  const idx = Math.floor(ms / step) % IDLE_CYCLE.length
  return IDLE_CYCLE[idx]
}
