import { describe, it, expect } from 'vitest'
import {
  LineBuffer,
  applyChunk,
  stripAnsi,
  terminalReducer,
  initialTerminalState,
  type TerminalState
} from '../src/shared/terminal'

describe('LineBuffer', () => {
  it('yields complete lines and holds the trailing partial', () => {
    const buf = new LineBuffer()
    expect(buf.push('hello\nworld')).toEqual(['hello'])
    expect(buf.pending).toBe('world')
  })

  it('reassembles a line split across chunk boundaries', () => {
    const buf = new LineBuffer()
    expect(buf.push('foo')).toEqual([])
    expect(buf.push('bar\nbaz')).toEqual(['foobar'])
    expect(buf.pending).toBe('baz')
  })

  it('emits every line for a multi-line chunk', () => {
    const buf = new LineBuffer()
    expect(buf.push('a\nb\nc\n')).toEqual(['a', 'b', 'c'])
    expect(buf.pending).toBe('')
  })

  it('treats \\r\\n as a single newline', () => {
    const buf = new LineBuffer()
    expect(buf.push('one\r\ntwo\r\n')).toEqual(['one', 'two'])
  })

  it('handles a \\r\\n that straddles two chunks', () => {
    const buf = new LineBuffer()
    expect(buf.push('line\r')).toEqual([]) // decision deferred until we see the next char
    expect(buf.push('\nnext')).toEqual(['line'])
    expect(buf.pending).toBe('next')
  })

  it('overwrites the pending line on a lone \\r (progress-bar style)', () => {
    const buf = new LineBuffer()
    buf.push('10%')
    expect(buf.pending).toBe('10%')
    buf.push('\r100%')
    expect(buf.pending).toBe('100%') // the "10%" was overwritten, no line emitted
    expect(buf.push('\n')).toEqual(['100%'])
  })

  it('carries a lone \\r overwrite across a chunk boundary', () => {
    const buf = new LineBuffer()
    buf.push('downloading...\r')
    expect(buf.push('done')).toEqual([])
    expect(buf.pending).toBe('done')
  })

  it('flush returns and clears the partial line', () => {
    const buf = new LineBuffer()
    buf.push('leftover')
    expect(buf.flush()).toBe('leftover')
    expect(buf.pending).toBe('')
  })
})

describe('stripAnsi', () => {
  it('removes SGR color codes', () => {
    expect(stripAnsi('[31mred[0m')).toBe('red')
  })

  it('removes multiple / combined codes', () => {
    expect(stripAnsi('[1;32mbold green[0m text')).toBe('bold green text')
  })

  it('removes cursor-movement sequences', () => {
    expect(stripAnsi('a[2Kb[1Gc')).toBe('abc')
  })

  it('leaves plain text untouched', () => {
    expect(stripAnsi('no escapes here')).toBe('no escapes here')
  })
})

describe('applyChunk', () => {
  it('appends into an empty rendered buffer', () => {
    expect(applyChunk([], 'hello')).toEqual(['hello'])
  })

  it('appends onto the current (last) line', () => {
    expect(applyChunk(['foo'], 'bar')).toEqual(['foobar'])
  })

  it('starts a new line on \\n', () => {
    expect(applyChunk(['foo'], '\nbar')).toEqual(['foo', 'bar'])
  })

  it('overwrites the current line on a lone \\r', () => {
    expect(applyChunk(['10%'], '\r99%')).toEqual(['99%'])
  })

  it('treats \\r\\n as a newline, not an overwrite', () => {
    expect(applyChunk(['a'], '\r\nb')).toEqual(['a', 'b'])
  })

  it('does not mutate the input array', () => {
    const input = ['x']
    applyChunk(input, 'y\nz')
    expect(input).toEqual(['x'])
  })
})

describe('terminalReducer', () => {
  it('start transitions idle -> running and clears state', () => {
    const exited: TerminalState = { status: 'exited', exitCode: 1, lines: ['old'] }
    expect(terminalReducer(exited, { type: 'start' })).toEqual({
      status: 'running',
      exitCode: null,
      lines: []
    })
  })

  it('data appends streamed output while running', () => {
    let state = terminalReducer(initialTerminalState, { type: 'start' })
    state = terminalReducer(state, { type: 'data', chunk: 'building\n' })
    state = terminalReducer(state, { type: 'data', chunk: 'done' })
    expect(state.lines).toEqual(['building', 'done'])
    expect(state.status).toBe('running')
  })

  it('data overwrites the current line on a carriage return', () => {
    let state = terminalReducer(initialTerminalState, { type: 'start' })
    state = terminalReducer(state, { type: 'data', chunk: '1%' })
    state = terminalReducer(state, { type: 'data', chunk: '\r100%' })
    expect(state.lines).toEqual(['100%'])
  })

  it('exit records the code and sets status without dropping output', () => {
    let state = terminalReducer(initialTerminalState, { type: 'start' })
    state = terminalReducer(state, { type: 'data', chunk: 'output' })
    state = terminalReducer(state, { type: 'exit', code: 0 })
    expect(state.status).toBe('exited')
    expect(state.exitCode).toBe(0)
    expect(state.lines).toEqual(['output'])
  })

  it('exit tolerates a null code (killed by signal)', () => {
    const running: TerminalState = { status: 'running', exitCode: null, lines: [] }
    expect(terminalReducer(running, { type: 'exit', code: null }).exitCode).toBeNull()
  })
})
