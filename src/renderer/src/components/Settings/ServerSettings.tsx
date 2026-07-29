import React, { useState, useEffect } from 'react'
import { useAtom } from 'jotai'
import { toast } from 'sonner'
import { LuCopy, LuRefreshCw, LuAlertTriangle, LuExternalLink, LuQrCode, LuScanLine } from 'react-icons/lu'
import { Button } from '@renderer/ui/Button'
import { t } from '@renderer/utils/utils'
import { remoteConfigAtom } from '@renderer/platform/config'
import { rebuildOllamaClients } from '@renderer/utils/ollama'
import { pingOllama, pingServer, fetchPairing, type PairingResponse } from '@renderer/platform/serverClient'
import { parsePairingPayload, encodePairingPayload, PAIRING_VERSION } from '../../../../shared/pairing'
import { parseAllowlist } from '../../../../shared/exec-policy'
import { isElectron } from '@renderer/platform/detect'
import { QrCode } from '@renderer/ui/QrCode'
import { QrScanner } from './QrScanner'

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

/** Copy text to the clipboard with a graceful fallback, then toast. */
async function copyText(text: string, label: string): Promise<void> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    toast.success(`${label} ${t('copied')}`)
  } catch {
    toast.error(t('Could not copy to clipboard'))
  }
}

export const ServerSettings = (): React.ReactElement => {
  const [config, setConfig] = useAtom(remoteConfigAtom)
  const [form, setForm] = useState(config)
  const [testing, setTesting] = useState(false)
  const [pairing, setPairing] = useState<PairingResponse | null>(null)
  const [pairingBusy, setPairingBusy] = useState(false)
  const [pastePayload, setPastePayload] = useState('')
  const [scanning, setScanning] = useState(false)

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

  /** Build a pairing payload locally from the configured URL + token — no server round-trip. */
  function localPairing(serverUrl: string, token: string): PairingResponse {
    return {
      payload: encodePairingPayload({ serverUrl, token, version: PAIRING_VERSION }),
      serverUrl,
      candidateUrls: [],
      hosts: [],
      port: 0,
      version: PAIRING_VERSION,
      execEnabled: false
    }
  }

  // Expose the pairing QR automatically whenever a valid URL + token are set — no click
  // needed. "Show pairing code" then only enriches it with the server's LAN candidate URLs.
  useEffect(() => {
    if (form.serverBaseUrl && form.serverToken) {
      try {
        setPairing(localPairing(form.serverBaseUrl, form.serverToken))
      } catch {
        setPairing(null) // invalid URL/token — nothing to show yet
      }
    } else {
      setPairing(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.serverBaseUrl, form.serverToken])

  /**
   * Show a pairing QR (or rotate the token first).
   *
   * The QR is generated LOCALLY from the URL + token already in the form, so a scannable
   * code appears immediately — even on the desktop, which needn't reach its own companion
   * server. When the server IS reachable we then swap in its richer payload (LAN candidate
   * URLs, /exec warning). Rotation truly needs the server, since it mints the new token there.
   */
  async function loadPairing(rotate: boolean): Promise<void> {
    if (!form.serverBaseUrl) {
      toast.info(t('Enter a companion server URL first'))
      return
    }
    if (!form.serverToken) {
      toast.info(t('Enter a server token first'))
      return
    }
    setPairingBusy(true)
    try {
      // Instant local QR (skipped for rotate — the payload's token must come from the server).
      if (!rotate) {
        try {
          setPairing(localPairing(form.serverBaseUrl, form.serverToken))
        } catch (e) {
          // Bad URL/token — encodePairingPayload validates; surface it and stop.
          toast.error(`${t('Invalid pairing code')}: ${e}`)
          return
        }
      }
      // Enrich from the server when reachable (LAN candidate URLs, exec warning, rotated token).
      try {
        const res = await fetchPairing(form.serverBaseUrl, form.serverToken, rotate)
        setPairing(res)
        // A rotated token invalidates the old one — persist the new token (and the
        // server-reported URL) immediately so this app stays connected.
        if (rotate) {
          const next = { serverBaseUrl: res.serverUrl, serverToken: parsePairingPayload(res.payload).token }
          update(next)
          setConfig(next)
          rebuildOllamaClients()
          toast.success(t('Token rotated and saved'))
        } else {
          toast.success(t('Pairing code ready'))
        }
      } catch (e) {
        if (rotate) {
          // Nothing to fall back on — rotation requires the server.
          toast.error(`${t('Could not reach server')}: ${e}`)
        } else {
          // The local QR is already showing; pairing still works, just without LAN hints.
          toast.success(t('Pairing code ready (using the URL you entered — server offline)'))
        }
      }
    } finally {
      setPairingBusy(false)
    }
  }

  /** Apply a pairing payload (mobile flow): configure URL + token. Shared by paste and QR-scan. */
  function applyPayload(raw: string): void {
    try {
      const parsed = parsePairingPayload(raw.trim())
      const next = { serverBaseUrl: parsed.serverUrl, serverToken: parsed.token }
      update(next)
      setConfig(next)
      rebuildOllamaClients()
      setPastePayload('')
      setScanning(false)
      toast.success(t('Paired with server'))
    } catch (e) {
      toast.error(`${t('Invalid pairing code')}: ${e}`)
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
          {t(
            'Runs on your model host. Both this desktop and your phone connect to it to sync chats and settings, optionally reach the model, and use RAG, web search, TTS, Git and commands.'
          )}
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
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 shrink-0"
            checked={form.routeOllamaThroughServer}
            onChange={(e) => update({ routeOllamaThroughServer: e.target.checked })}
          />
          <span className="flex flex-col">
            <span className="text-sm">{t('Route model traffic through this server')}</span>
            <span className="text-xs opacity-60">
              {t(
                'Send inference to the server’s /ollama proxy (one authenticated endpoint). Recommended when the model runs on the server host — the “Ollama base URL” above is then ignored.'
              )}
            </span>
          </span>
        </label>
      </section>

      {/* --- Pair a device -------------------------------------------------- */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg">{t('Pair a device')}</h2>
        <p className="text-xs opacity-60">
          {t(
            'Once a Server URL + token are set, the QR below appears automatically — scan it in LLocal on your phone to configure it in one step. Refresh to add the server’s LAN addresses.'
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            className="w-fit"
            onClick={() => loadPairing(false)}
            disabled={pairingBusy || !form.serverBaseUrl || !form.serverToken}
          >
            {t('Refresh from server')}
          </Button>
          <Button
            variant="secondary"
            className="w-fit flex items-center gap-2"
            onClick={() => loadPairing(true)}
            disabled={pairingBusy}
          >
            <LuRefreshCw className={pairingBusy ? 'animate-spin' : ''} />
            {t('Rotate token')}
          </Button>
        </div>

        {pairing && (
          <div className="flex flex-col gap-2 rounded-xl bg-background bg-opacity-20 dark:bg-opacity-20 p-3">
            {/* Scan this from the phone (Settings → Server & Repository → Scan QR). */}
            <div className="flex items-center gap-2 self-center">
              <LuQrCode className="opacity-60" />
              <span className="text-xs opacity-70">{t('Scan this on your phone')}</span>
            </div>
            <div className="self-center">
              <QrCode value={pairing.payload} />
            </div>
            <span className="text-xs opacity-70">{t('…or copy the pairing code')}</span>
            <div className="flex items-start gap-2">
              <code className="text-xs break-all flex-1 opacity-90">{pairing.payload}</code>
              <button
                type="button"
                title={t('Copy pairing code')}
                className="opacity-60 hover:opacity-100 transition-all shrink-0"
                onClick={() => copyText(pairing.payload, t('Pairing code'))}
              >
                <LuCopy />
              </button>
            </div>
            {pairing.candidateUrls.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs opacity-70">{t('Reachable on your LAN')}</span>
                {pairing.candidateUrls.map((u) => (
                  <div key={u} className="flex items-center gap-2">
                    <code className="text-xs opacity-90">{u}</code>
                    <button
                      type="button"
                      title={t('Copy URL')}
                      className="opacity-60 hover:opacity-100 transition-all"
                      onClick={() => copyText(u, t('URL'))}
                    >
                      <LuCopy />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {pairing.execEnabled && (
              <p className="text-xs text-amber-500 flex items-start gap-1">
                <LuAlertTriangle className="mt-0.5 shrink-0" />
                <span>{pairing.execWarning || t('/exec is enabled on this server.')}</span>
              </p>
            )}
          </div>
        )}
      </section>

      {/* --- Scan / paste a pairing code (mobile) -------------------------- */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg">{t('Pair this device')}</h2>
        <p className="text-xs opacity-60">
          {t('On your phone, scan the QR shown on your desktop — or paste the code below.')}
        </p>

        {/* Scan the desktop's QR with the camera (mobile only). */}
        {!isElectron() &&
          (scanning ? (
            <QrScanner onDecode={(text) => applyPayload(text)} onCancel={() => setScanning(false)} />
          ) : (
            <Button
              variant="primary"
              className="w-fit flex items-center gap-2"
              onClick={() => setScanning(true)}
            >
              <LuScanLine /> {t('Scan QR')}
            </Button>
          ))}

        <label className="flex flex-col gap-1">
          <span className="text-xs opacity-70">{t('…or paste the pairing code')}</span>
          <textarea
            className={`${fieldClass} font-mono min-h-[72px] resize-y`}
            value={pastePayload}
            placeholder={t('Paste the code from your desktop here')}
            onChange={(e) => setPastePayload(e.target.value)}
          />
        </label>
        <Button
          variant="primary"
          className="w-fit"
          onClick={() => applyPayload(pastePayload)}
          disabled={!pastePayload.trim()}
        >
          {t('Apply pairing code')}
        </Button>
      </section>

      {/* --- Command execution (advanced) ---------------------------------- */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg">{t('Command execution')}</h2>
        <p className="text-xs text-amber-500 flex items-start gap-1">
          <LuAlertTriangle className="mt-0.5 shrink-0" />
          <span>
            {t(
              'Lets you run shell commands the model writes. Every run still needs your approval and must match the allowlist below. On this desktop commands run on THIS computer; on the phone they run on your Mac. Only enable this if you understand the risk — a command from a poisoned context could be destructive.'
            )}
          </span>
        </p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="shrink-0"
            checked={form.execEnabled}
            onChange={(e) => update({ execEnabled: e.target.checked })}
          />
          <span className="text-sm">{t('Enable running commands from code blocks')}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs opacity-70">
            {t('Allowlist (one command per line, or comma-separated). Empty = nothing runs.')}
          </span>
          <textarea
            className={`${fieldClass} font-mono min-h-[72px] resize-y`}
            value={form.execAllowlist.join('\n')}
            placeholder={'git\nls\nnpm\nrg'}
            onChange={(e) => update({ execAllowlist: parseAllowlist(e.target.value) })}
          />
        </label>
        <p className="text-xs opacity-60">
          {t(
            'Matching is by the first word (a program name), so “git” permits any git subcommand. For the phone→Mac path, the companion server must also be started with LLOCAL_ENABLE_EXEC=1 and its own LLOCAL_EXEC_ALLOWLIST.'
          )}
        </p>
      </section>

      {/* --- Remote access help -------------------------------------------- */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg">{t('Remote access')}</h2>
        <p className="text-xs text-amber-500 flex items-start gap-1">
          <LuAlertTriangle className="mt-0.5 shrink-0" />
          <span>
            {t(
              'Only expose the companion server over a LAN or private VPN, never the open internet. Always use a long, random token, and keep /exec disabled unless you truly need it.'
            )}
          </span>
        </p>

        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">{t('Tailscale (recommended)')}</span>
            <a
              className="opacity-60 hover:opacity-100 transition-all"
              href="https://tailscale.com/download"
              target="_blank"
              rel="noreferrer"
              title="tailscale.com/download"
            >
              <LuExternalLink />
            </a>
          </div>
          <ol className="list-decimal list-inside text-xs opacity-70 flex flex-col gap-0.5">
            <li>{t('Install Tailscale on the server host and on your phone; sign in to the same tailnet.')}</li>
            <li>{t('Find the host’s tailnet IP (100.x.y.z) or MagicDNS name (`tailscale ip -4`).')}</li>
            <li>{t('Use http://<tailnet-ip>:8787 as the Server URL, then pair as above.')}</li>
          </ol>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">{t('Cloudflare Tunnel')}</span>
            <a
              className="opacity-60 hover:opacity-100 transition-all"
              href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/"
              target="_blank"
              rel="noreferrer"
              title="developers.cloudflare.com/cloudflare-one"
            >
              <LuExternalLink />
            </a>
          </div>
          <ol className="list-decimal list-inside text-xs opacity-70 flex flex-col gap-0.5">
            <li>{t('Install cloudflared on the host and run `cloudflared tunnel login`.')}</li>
            <li>{t('Expose the server: `cloudflared tunnel --url http://localhost:8787`.')}</li>
            <li>{t('Put Cloudflare Access in front of the hostname so only you can reach it, then use the https URL to pair.')}</li>
          </ol>
        </div>
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
