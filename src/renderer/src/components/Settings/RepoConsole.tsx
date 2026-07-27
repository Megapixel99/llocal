import React, { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@renderer/ui/Button'
import { t } from '@renderer/utils/utils'
import { execCommand, git } from '@renderer/platform/serverClient'

/**
 * Minimal repository + command console for the mobile app. File edits and
 * commands run on the companion server (the Ollama host), so no code lives on
 * the phone. Depends on the repo + server config in Server & Repository settings.
 */
export const RepoConsole = (): React.ReactElement => {
  const [files, setFiles] = useState<string[]>([])
  const [activePath, setActivePath] = useState('')
  const [content, setContent] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const [command, setCommand] = useState('')
  const [output, setOutput] = useState('')

  async function withBusy(fn: () => Promise<void>): Promise<void> {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setBusy(false)
    }
  }

  const cloneRepo = (): Promise<void> =>
    withBusy(async () => {
      const res = await git.clone()
      toast.success(`${t('Repository ready')}: ${res.repoKey}`)
      const tree = await git.tree()
      setFiles(tree.files)
    })

  const openFile = (path: string): Promise<void> =>
    withBusy(async () => {
      const file = await git.read(path)
      setActivePath(path)
      setContent(file.content)
      setMessage(`Update ${path}`)
    })

  const commitFile = (): Promise<void> =>
    withBusy(async () => {
      const res = await git.write(activePath, content, message)
      toast[res.ok ? 'success' : 'info'](res.output || t('Committed'))
    })

  const pushRepo = (): Promise<void> =>
    withBusy(async () => {
      const res = await git.push()
      toast[res.ok ? 'success' : 'error'](res.output || (res.ok ? t('Pushed') : t('Push failed')))
    })

  const runCommand = (): Promise<void> =>
    withBusy(async () => {
      const res = await execCommand(command)
      setOutput(
        `$ ${command}\n${res.stdout}${res.stderr ? `\n[stderr]\n${res.stderr}` : ''}\n[exit ${res.code}]`
      )
    })

  const cellBtn = 'w-full text-left text-xs p-2 rounded-lg hover:bg-foreground/10 truncate'

  return (
    <div className="flex flex-col gap-6 w-full max-w-3xl">
      <section className="flex flex-col gap-3">
        <div className="flex gap-2 items-center flex-wrap">
          <Button variant="primary" onClick={cloneRepo} disabled={busy}>
            {t('Clone / Pull')}
          </Button>
          <Button variant="primary" onClick={pushRepo} disabled={busy}>
            {t('Push')}
          </Button>
        </div>

        {files.length > 0 && (
          <div className="flex flex-col md:flex-row gap-4">
            <div className="md:w-1/3 max-h-72 overflow-y-auto rounded-xl bg-background/10 p-2">
              {files.map((f) => (
                <button
                  key={f}
                  className={`${cellBtn} ${activePath === f ? 'bg-foreground/10' : ''}`}
                  onClick={() => openFile(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <span className="text-xs opacity-70">{activePath || t('Select a file')}</span>
              <textarea
                className="w-full h-56 p-3 font-mono text-xs rounded-xl bg-background/10 outline-none"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={!activePath}
                spellCheck={false}
              />
              <input
                className="p-2 text-xs rounded-lg bg-background/10 outline-none"
                value={message}
                placeholder={t('Commit message')}
                onChange={(e) => setMessage(e.target.value)}
              />
              <Button variant="primary" className="w-fit" onClick={commitFile} disabled={!activePath || busy}>
                {t('Commit')}
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg">{t('Run a command on the host')}</h2>
        <p className="text-xs opacity-60">
          {t('Requires command execution to be enabled on the companion server.')}
        </p>
        <div className="flex gap-2">
          <input
            className="flex-1 p-2 font-mono text-xs rounded-lg bg-background/10 outline-none"
            value={command}
            placeholder="unzip archive.zip"
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && command.trim()) runCommand()
            }}
          />
          <Button variant="primary" onClick={runCommand} disabled={busy || !command.trim()}>
            {t('Run')}
          </Button>
        </div>
        {output && (
          <pre className="whitespace-pre-wrap text-xs p-3 rounded-xl bg-background/10 max-h-72 overflow-y-auto">
            {output}
          </pre>
        )}
      </section>
    </div>
  )
}
