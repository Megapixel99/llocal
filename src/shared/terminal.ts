/**
 * Platform-agnostic core for the interactive terminal panel.
 *
 * Like src/shared/commands.ts this module has NO Electron / DOM dependency — it
 * only transforms streamed text. That keeps the tricky bits (chunk-boundary line
 * assembly, ANSI stripping, session state) pure and unit-testable, so they can be
 * shared by the Electron renderer (TerminalPanel), and reused elsewhere if the
 * companion server grows a streaming exec route.
 *
 * Three helpers:
 *   1. LineBuffer      — accepts arbitrary streamed chunks and yields complete lines,
 *                        holding a partial line across chunk boundaries and handling
 *                        `\r\n` and lone `\r` (carriage-return overwrite).
 *   2. stripAnsi       — removes ANSI escape / color codes from a string.
 *   3. terminalReducer — a {status, exitCode, lines} state machine driven by
 *                        start / data / exit actions.
 */

/**
 * Well-known ANSI escape-sequence matcher (CSI + OSC forms), the same shape used
 * by the `ansi-regex` package. Kept inline so we add no dependency.
 */
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g

/** Remove ANSI escape codes (colors, cursor moves, etc.) from a string. */
export function stripAnsi(str: string): string {
  return str.replace(ANSI_PATTERN, '')
}

/**
 * Incremental line assembler for streamed output.
 *
 * `push(chunk)` returns the lines that were *completed* by that chunk (i.e. ended
 * with a newline). Text with no trailing newline is held as the "pending" line and
 * carried into the next chunk, so a line split across two chunks is reassembled.
 *
 * Line-break handling:
 *   - `\n` and `\r\n` terminate a line (a `\r` immediately before `\n` is dropped).
 *   - A lone `\r` is a carriage-return *overwrite*: the cursor returns to column 0,
 *     so the pending line is cleared and following text overwrites it. This is what
 *     progress bars / spinners emit, and it's tracked across chunk boundaries too.
 */
export class LineBuffer {
  private partial = ''
  /** True when the previous char was a `\r` whose role (CRLF vs overwrite) is undecided. */
  private sawCR = false

  push(chunk: string): string[] {
    const completed: string[] = []
    for (const ch of chunk) {
      if (this.sawCR) {
        this.sawCR = false
        if (ch === '\n') {
          // `\r\n` — a single newline.
          completed.push(this.partial)
          this.partial = ''
          continue
        }
        // The `\r` stood alone: carriage-return overwrite of the current line.
        this.partial = ''
        // fall through and process `ch` as normal content / control below
      }

      if (ch === '\n') {
        completed.push(this.partial)
        this.partial = ''
      } else if (ch === '\r') {
        // Defer: could be the `\r` of a `\r\n`, or a lone overwrite `\r`.
        this.sawCR = true
      } else {
        this.partial += ch
      }
    }
    return completed
  }

  /** The current, not-yet-terminated line. */
  get pending(): string {
    return this.partial
  }

  /** Return and clear the pending partial line (e.g. when the stream ends). */
  flush(): string {
    const rest = this.partial
    this.partial = ''
    this.sawCR = false
    return rest
  }
}

/**
 * Apply a raw output chunk to a rendered `lines` array, treating the LAST element
 * as the in-progress line. This is the display-oriented counterpart to LineBuffer:
 * newlines push new lines, a lone `\r` overwrites the current line. Pure — returns
 * a new array and never mutates the input.
 */
export function applyChunk(lines: string[], chunk: string): string[] {
  const out = lines.length ? lines.slice() : ['']
  let cur = out.pop() ?? ''
  for (let i = 0; i < chunk.length; i++) {
    const ch = chunk[i]
    if (ch === '\n') {
      out.push(cur)
      cur = ''
    } else if (ch === '\r') {
      // `\r\n` -> let the `\n` do the line break; a lone `\r` overwrites the line.
      if (chunk[i + 1] === '\n') continue
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

export type TerminalStatus = 'idle' | 'running' | 'exited'

export interface TerminalState {
  status: TerminalStatus
  exitCode: number | null
  /** Rendered output; the last element is the current (possibly partial) line. */
  lines: string[]
}

export type TerminalAction =
  | { type: 'start' }
  | { type: 'data'; chunk: string }
  | { type: 'exit'; code: number | null }

export const initialTerminalState: TerminalState = {
  status: 'idle',
  exitCode: null,
  lines: []
}

/**
 * Session state machine for one terminal:
 *   - `start` — (re)begin a run: status → 'running', clear output and exit code.
 *   - `data`  — feed a streamed chunk; appends text / overwrites the current line.
 *   - `exit`  — the child ended: status → 'exited', record the exit code.
 */
export function terminalReducer(state: TerminalState, action: TerminalAction): TerminalState {
  switch (action.type) {
    case 'start':
      return { status: 'running', exitCode: null, lines: [] }
    case 'data':
      return { ...state, lines: applyChunk(state.lines, action.chunk) }
    case 'exit':
      return { ...state, status: 'exited', exitCode: action.code }
    default:
      return state
  }
}
