import { describe, it, expect } from 'vitest'
import {
  parseCommandFile,
  expandCommand,
  commandNameFromRelPath,
  dedupeCommands,
  type Command
} from '../src/shared/commands'
import { maybeExpandCommand, filterCommands } from '../src/renderer/src/utils/commands'

/** Build a Command with sensible defaults so tests only specify what matters. */
function cmd(partial: Partial<Command> & { name: string }): Command {
  return {
    namespace: '',
    description: '',
    argumentHint: '',
    model: '',
    allowedTools: '',
    body: '',
    source: '',
    ...partial
  }
}

describe('parseCommandFile', () => {
  it('reads frontmatter fields and strips them from the body', () => {
    const raw = [
      '---',
      'description: Scaffold an API',
      'argument-hint: [endpoint]',
      'model: llama3',
      'allowed-tools: none',
      '---',
      'Build $ARGUMENTS with tests.'
    ].join('\n')
    const parsed = parseCommandFile(raw)
    expect(parsed).toEqual({
      description: 'Scaffold an API',
      argumentHint: '[endpoint]',
      model: 'llama3',
      allowedTools: 'none',
      body: 'Build $ARGUMENTS with tests.'
    })
  })

  it('treats a file with no frontmatter as an all-body template', () => {
    const parsed = parseCommandFile('Just a body $ARGUMENTS')
    expect(parsed.body).toBe('Just a body $ARGUMENTS')
    expect(parsed.description).toBe('')
  })

  it('strips surrounding quotes and tolerates missing keys', () => {
    const raw = '---\ndescription: "Quoted desc"\n---\nBody'
    const parsed = parseCommandFile(raw)
    expect(parsed.description).toBe('Quoted desc')
    expect(parsed.model).toBe('')
  })

  it('handles CRLF line endings', () => {
    const raw = '---\r\ndescription: Windows\r\n---\r\nBody here'
    const parsed = parseCommandFile(raw)
    expect(parsed.description).toBe('Windows')
    expect(parsed.body).toBe('Body here')
  })

  it('accepts underscore variants of hyphenated keys', () => {
    const raw = '---\nargument_hint: [x]\nallowed_tools: read\n---\nBody'
    const parsed = parseCommandFile(raw)
    expect(parsed.argumentHint).toBe('[x]')
    expect(parsed.allowedTools).toBe('read')
  })
})

describe('commandNameFromRelPath', () => {
  it('maps a root file to a bare name', () => {
    expect(commandNameFromRelPath('review.md')).toEqual({ name: 'review', namespace: '' })
  })

  it('maps a sub-folder to a namespace', () => {
    expect(commandNameFromRelPath('tools/api-scaffold.md')).toEqual({
      name: 'tools:api-scaffold',
      namespace: 'tools'
    })
  })

  it('joins nested folders with colons', () => {
    expect(commandNameFromRelPath('a/b/c.md')).toEqual({ name: 'a:b:c', namespace: 'a:b' })
  })

  it('normalizes Windows path separators', () => {
    expect(commandNameFromRelPath('tools\\scan.md')).toEqual({
      name: 'tools:scan',
      namespace: 'tools'
    })
  })
})

describe('expandCommand', () => {
  it('substitutes every $ARGUMENTS occurrence', () => {
    expect(expandCommand('Do $ARGUMENTS then $ARGUMENTS', 'x')).toBe('Do x then x')
  })

  it('substitutes positional args', () => {
    expect(expandCommand('Convert $1 to $2', 'json yaml')).toBe('Convert json to yaml')
  })

  it('leaves missing positional args empty', () => {
    expect(expandCommand('$1 $2', 'only')).toBe('only')
  })

  it('appends args when the template has no placeholder', () => {
    expect(expandCommand('Summarize this.', 'hello world')).toBe('Summarize this.\n\nhello world')
  })

  it('does not append when there are no args', () => {
    expect(expandCommand('Summarize this.', '')).toBe('Summarize this.')
  })

  it('trims surrounding whitespace in the arguments', () => {
    expect(expandCommand('Echo $ARGUMENTS', '  spaced  ')).toBe('Echo spaced')
  })
})

describe('dedupeCommands', () => {
  it('keeps the first occurrence (highest priority) and sorts by name', () => {
    const high = [cmd({ name: 'x', body: 'HIGH' })]
    const low = [cmd({ name: 'x', body: 'LOW' }), cmd({ name: 'a', body: 'A' })]
    const merged = dedupeCommands([high, low])
    expect(merged.map((c) => c.name)).toEqual(['a', 'x'])
    expect(merged.find((c) => c.name === 'x')?.body).toBe('HIGH')
  })
})

describe('maybeExpandCommand', () => {
  const commands = [
    cmd({ name: 'summarize', body: 'Summarize:\n$ARGUMENTS' }),
    cmd({ name: 'tools:scan', body: 'Scan $ARGUMENTS for issues' })
  ]

  it('expands a known command with arguments', () => {
    expect(maybeExpandCommand('/summarize the meeting notes', commands)).toBe(
      'Summarize:\nthe meeting notes'
    )
  })

  it('expands a namespaced command', () => {
    expect(maybeExpandCommand('/tools:scan ./src', commands)).toBe('Scan ./src for issues')
  })

  it('is case-insensitive on the command name', () => {
    expect(maybeExpandCommand('/SUMMARIZE hi', commands)).toBe('Summarize:\nhi')
  })

  it('passes an unknown slash command through untouched', () => {
    expect(maybeExpandCommand('/nope do a thing', commands)).toBe('/nope do a thing')
  })

  it('passes a plain prompt through untouched', () => {
    expect(maybeExpandCommand('just chatting', commands)).toBe('just chatting')
  })
})

describe('filterCommands', () => {
  const commands = [
    cmd({ name: 'summarize', description: 'Summarize text' }),
    cmd({ name: 'tools:security-scan', description: 'Find vulnerabilities' })
  ]

  it('returns everything for an empty query', () => {
    expect(filterCommands(commands, '')).toHaveLength(2)
  })

  it('matches on the command name', () => {
    expect(filterCommands(commands, 'security').map((c) => c.name)).toEqual([
      'tools:security-scan'
    ])
  })

  it('matches on the description', () => {
    expect(filterCommands(commands, 'vulner').map((c) => c.name)).toEqual(['tools:security-scan'])
  })

  it('is case-insensitive', () => {
    expect(filterCommands(commands, 'SUMM').map((c) => c.name)).toEqual(['summarize'])
  })
})
