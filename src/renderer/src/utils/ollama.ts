import { Ollama } from 'ollama/browser'
import { toast } from 'sonner'
import { t } from './utils'
import { getOllamaEndpoint, isRoutingOllamaThroughServer } from '@renderer/platform/config'

// The Ollama client stores its host (and headers) at construction time, so to
// support a user-configurable server (a remote IP, or the companion server's
// token-gated /ollama proxy) we build the clients lazily from the current config
// and rebuild them whenever the effective endpoint changes.
let cachedKey = ''
let _ollama: Ollama | null = null
let _helperOllama: Ollama | null = null

function ensureClients(): void {
  const { host, headers } = getOllamaEndpoint()
  // Include the auth header in the cache key so toggling routing rebuilds clients.
  const key = `${host}|${headers?.Authorization ?? ''}`
  if (!_ollama || !_helperOllama || key !== cachedKey) {
    cachedKey = key
    _ollama = new Ollama({ host, headers })
    // a separate client so that aborting a pull does not abort an on-going chat
    // (or vice-versa); all non-chat calls should use the helper client.
    _helperOllama = new Ollama({ host, headers })
  }
}

/** Chat/generate client, bound to the currently configured Ollama host. */
export function getOllama(): Ollama {
  ensureClients()
  return _ollama as Ollama
}

/** Model-management client, decoupled from the chat client. */
export function getHelperOllama(): Ollama {
  ensureClients()
  return _helperOllama as Ollama
}

/** Force the clients to be rebuilt after the configured host changes. */
export function rebuildOllamaClients(): void {
  _ollama = null
  _helperOllama = null
  ensureClients()
}

async function installOllama(): Promise<void> {
  toast.info(t("Please be patient with the Ollama installation, there are background process running to get the Ollama installer up and running for you! (Should take about a mintue)"))
  const install = await window.api.installingOllama()
  if (install) {
    toast.success(t('Ollama has been successfully installed!'))
    setTimeout(() => {
      toast.info(
        t('Whenever ollama is served, initially there is a cold-boot (slow start) and then it will work as expected. Anyways, you can now download models via Pull models in settings!')
      )
    }, 2000)
  } else {
    toast.error(t('Installation failed. (Press CTRL + R to refresh, or go to llocal.in)'))
  }
}

export async function ollamaServe(setIsOllamaInstalled): Promise<void> {
  // Thin client: the model lives on the companion-server host, so there is no
  // local Ollama to check/download/install. Treat it as present and skip the
  // desktop install flow entirely.
  if (isRoutingOllamaThroughServer()) {
    setIsOllamaInstalled(true)
    return
  }
  const check = await window.api.checkingOllama()
  if (!check) {
    const alreadyDownloaded = await window.api.checkingBinaries()
    let toastId: string | number = ''
    let binarySizeCheck;
    if (alreadyDownloaded) {
      toastId = toast.info(t('Ollama setup has already been downloaded. \n Now checking whether it is upto date or not'))
      binarySizeCheck = await window.api.checkingBinarySize()
      if (!binarySizeCheck) {
        toast.info(t('The current setup is not upto date, downloading the latest setup'), { id: toastId })
      }
    }

    if (alreadyDownloaded && binarySizeCheck) {
      toast.success(t('The current setup is upto date, starting the installation!'), { id: toastId })
      await installOllama()
    }
    // if not downloaded
    else {
      const toastId = toast.loading(t('Ollama has started downloading. This may take some time depending on your internet connection (Approx 200 MB)'))
      const download = await window.api.downloadingOllama()
      toast.dismiss(toastId)
      if (download === 'success') {
        toast.success(t('Ollama has been downloaded!'))
        setTimeout(async () => {
          await installOllama()
        }, 1000)
      }
      // incase the system is linux based, the download and installation takes place in a terminal
      if (download === 'linux-detected') toast.info(t('Please wait till the installation completes on the terminal'))
      if (download === 'download-failed')
        toast.error(t('There has been some error while downloading ollama!'))
    }
  }
  // if check is true, set the atom state
  else {
    setIsOllamaInstalled(true)
  }
}
