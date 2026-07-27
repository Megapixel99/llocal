import React, { useState } from 'react'
import { useAtom } from 'jotai'
import { toast } from 'sonner'
import { Button } from '@renderer/ui/Button'
import { t } from '@renderer/utils/utils'
import { remoteConfigAtom } from '@renderer/platform/config'
import { rebuildOllamaClients } from '@renderer/utils/ollama'
import { pingOllama, pingServer } from '@renderer/platform/serverClient'

const fieldClass =
  'p-3 w-full bg-foreground placeholder:text-black placeholder:text-opacity-60 dark:bg-opacity-20 dark:bg-background dark:text-white dark:placeholder-white dark:placeholder:opacity-60 outline-none rounded-xl text-sm bg-opacity-20 backdrop-blur-lg shadow-xl'

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text'
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}): React.ReactElement {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs opacity-70">{label}</span>
      <input
        className={fieldClass}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

export const ServerSettings = (): React.ReactElement => {
  const [config, setConfig] = useAtom(remoteConfigAtom)
  const [form, setForm] = useState(config)
  const [testing, setTesting] = useState(false)

  function update(patch: Partial<typeof form>): void {
    setForm((prev) => ({ ...prev, ...patch }))
  }
  function updateGit(patch: Partial<typeof form.git>): void {
    setForm((prev) => ({ ...prev, git: { ...prev.git, ...patch } }))
  }

  function handleSave(): void {
    setConfig(form)
    rebuildOllamaClients()
    toast.success(t('Settings saved'))
  }

  async function testOllama(): Promise<void> {
    setTesting(true)
    try {
      const models = await pingOllama(form.ollamaBaseUrl)
      toast.success(`${t('Ollama reachable')} (${models.length} ${t('models')})`)
    } catch (e) {
      toast.error(`${t('Ollama not reachable')}: ${e}`)
    } finally {
      setTesting(false)
    }
  }

  async function testServer(): Promise<void> {
    if (!form.serverBaseUrl) {
      toast.info(t('Enter a companion server URL first'))
      return
    }
    setTesting(true)
    try {
      const health = await pingServer(form.serverBaseUrl, form.serverToken)
      toast.success(
        `${t('Server reachable')} v${health.version}${health.execEnabled ? ' · exec on' : ''}`
      )
    } catch (e) {
      toast.error(`${t('Server not reachable')}: ${e}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-xl w-full">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg">{t('Ollama server')}</h2>
        <Field
          label={t('Ollama base URL')}
          value={form.ollamaBaseUrl}
          placeholder="http://192.168.1.10:11434"
          onChange={(v) => update({ ollamaBaseUrl: v })}
        />
        <Button variant="primary" className="w-fit" onClick={testOllama} disabled={testing}>
          {t('Test Ollama')}
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">{t('Companion server')}</h2>
        <p className="text-xs opacity-60">
          {t('Runs on the Ollama host for RAG, web search, TTS, Git and commands.')}
        </p>
        <Field
          label={t('Server URL')}
          value={form.serverBaseUrl}
          placeholder="http://192.168.1.10:8787"
          onChange={(v) => update({ serverBaseUrl: v })}
        />
        <Field
          label={t('Server token')}
          value={form.serverToken}
          type="password"
          onChange={(v) => update({ serverToken: v })}
        />
        <Button variant="primary" className="w-fit" onClick={testServer} disabled={testing}>
          {t('Test server')}
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">{t('Repository (GitHub)')}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Owner')} value={form.git.owner} onChange={(v) => updateGit({ owner: v })} />
          <Field label={t('Repo')} value={form.git.repo} onChange={(v) => updateGit({ repo: v })} />
        </div>
        <Field label={t('Branch')} value={form.git.branch} onChange={(v) => updateGit({ branch: v })} />
        <Field
          label={t('GitHub token')}
          value={form.git.token}
          type="password"
          onChange={(v) => updateGit({ token: v })}
        />
      </section>

      <Button variant="primary" className="w-fit self-start" onClick={handleSave}>
        {t('Save settings')}
      </Button>
    </div>
  )
}
