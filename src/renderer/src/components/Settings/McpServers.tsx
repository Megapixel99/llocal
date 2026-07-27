import React, { useState } from 'react'
import { useAtom } from 'jotai'
import { toast } from 'sonner'
import { MdDeleteForever } from 'react-icons/md'
import { Button } from '@renderer/ui/Button'
import { t } from '@renderer/utils/utils'
import { remoteConfigAtom } from '@renderer/platform/config'
import { safeParseMcpServer, type McpServer } from '../../../../shared/mcp'

const fieldClass =
  'p-3 w-full bg-foreground placeholder:text-black placeholder:text-opacity-60 dark:bg-opacity-20 dark:bg-background dark:text-white dark:placeholder-white dark:placeholder:opacity-60 outline-none rounded-xl text-sm bg-opacity-20 backdrop-blur-lg shadow-xl'

/** Parse `KEY=value` lines into an object (blank/malformed lines are ignored). */
function parseKeyValues(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    if (key) out[key] = line.slice(idx + 1).trim()
  }
  return out
}

function Field({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}): React.ReactElement {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs opacity-70">{label}</span>
      <input
        className={fieldClass}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

const EMPTY_FORM = {
  name: '',
  type: 'stdio' as 'stdio' | 'http',
  command: '',
  args: '',
  env: '',
  url: '',
  headers: ''
}

/**
 * Settings panel to add / remove / enable external MCP (Model Context Protocol)
 * servers. Enabled servers' tools are merged into the coding agent's tool set and
 * gated by the same approval flow as write_file / run_command. Config is persisted
 * with the rest of the app config (remoteConfigAtom → localStorage).
 */
export const McpServers = (): React.ReactElement => {
  const [config, setConfig] = useAtom(remoteConfigAtom)
  const servers = config.mcpServers ?? []
  const [form, setForm] = useState(EMPTY_FORM)

  function update(patch: Partial<typeof form>): void {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  function save(next: McpServer[]): void {
    setConfig({ mcpServers: next })
  }

  function addServer(): void {
    const candidate =
      form.type === 'stdio'
        ? {
            name: form.name.trim(),
            enabled: true,
            type: 'stdio' as const,
            command: form.command.trim(),
            args: form.args.trim() ? form.args.trim().split(/\s+/) : [],
            env: parseKeyValues(form.env)
          }
        : {
            name: form.name.trim(),
            enabled: true,
            type: 'http' as const,
            url: form.url.trim(),
            headers: parseKeyValues(form.headers)
          }

    const parsed = safeParseMcpServer(candidate)
    if (!parsed.ok) {
      toast.error(`${t('Invalid MCP server')}: ${parsed.error}`)
      return
    }
    if (servers.some((s) => s.name === parsed.server.name)) {
      toast.error(t('A server with that name already exists'))
      return
    }
    save([...servers, parsed.server])
    setForm(EMPTY_FORM)
    toast.success(t('MCP server added'))
  }

  function removeServer(name: string): void {
    save(servers.filter((s) => s.name !== name))
  }

  function toggleServer(name: string): void {
    save(servers.map((s) => (s.name === name ? { ...s, enabled: !s.enabled } : s)))
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-xl">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg">{t('MCP servers')}</h2>
        <p className="text-xs opacity-60">
          {t(
            "Connect external Model Context Protocol servers. Enabled servers' tools are offered to the coding agent and require your approval before each call."
          )}
        </p>
      </section>

      {servers.length > 0 && (
        <section className="flex flex-col gap-2">
          {servers.map((s) => (
            <div
              key={s.name}
              className="flex items-center gap-3 rounded-xl bg-background/10 p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={() => toggleServer(s.name)}
                title={t('Enable')}
              />
              <div className="flex flex-col overflow-hidden">
                <span className="font-medium truncate">{s.name}</span>
                <span className="text-xs opacity-60 truncate">
                  {s.type === 'stdio' ? `${s.command} ${s.args.join(' ')}` : s.url}
                </span>
              </div>
              <button
                className="ml-auto opacity-70 hover:opacity-100"
                onClick={() => removeServer(s.name)}
                title={t('Remove')}
              >
                <MdDeleteForever size={18} />
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-base">{t('Add a server')}</h3>
        <Field
          label={t('Name')}
          value={form.name}
          placeholder="filesystem"
          onChange={(v) => update({ name: v })}
        />

        <div className="flex gap-2">
          {(['stdio', 'http'] as const).map((tp) => (
            <Button
              key={tp}
              variant={form.type === tp ? 'primary' : 'secondary'}
              className="text-xs"
              onClick={() => update({ type: tp })}
            >
              {tp}
            </Button>
          ))}
        </div>

        {form.type === 'stdio' ? (
          <>
            <Field
              label={t('Command')}
              value={form.command}
              placeholder="npx"
              onChange={(v) => update({ command: v })}
            />
            <Field
              label={t('Arguments (space-separated)')}
              value={form.args}
              placeholder="-y @modelcontextprotocol/server-filesystem /path"
              onChange={(v) => update({ args: v })}
            />
            <Field
              label={t('Environment (KEY=value per line)')}
              value={form.env}
              placeholder="API_KEY=abc123"
              onChange={(v) => update({ env: v })}
            />
          </>
        ) : (
          <>
            <Field
              label={t('URL')}
              value={form.url}
              placeholder="http://localhost:8000/mcp"
              onChange={(v) => update({ url: v })}
            />
            <Field
              label={t('Headers (KEY=value per line)')}
              value={form.headers}
              placeholder="Authorization=Bearer token"
              onChange={(v) => update({ headers: v })}
            />
          </>
        )}

        <Button variant="primary" className="w-fit" onClick={addServer}>
          {t('Add server')}
        </Button>
      </section>
    </div>
  )
}
