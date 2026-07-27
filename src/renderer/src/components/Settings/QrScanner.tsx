import jsQR from 'jsqr'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@renderer/ui/Button'
import { t } from '@renderer/utils/utils'

/**
 * Live camera QR scanner (mobile). Streams the rear camera into a hidden canvas and decodes each
 * frame with jsQR; on the first successful decode it hands the payload to `onDecode`. Uses the
 * WKWebView camera (NSCameraUsageDescription is declared in Info.plist) — no native plugin.
 */
export const QrScanner = ({
  onDecode,
  onCancel
}: {
  onDecode: (text: string) => void
  onCancel: () => void
}): React.ReactElement => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const tick = (): void => {
      if (stopped) return
      const video = videoRef.current
      if (video && video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
        if (found?.data) {
          stopped = true
          onDecode(found.data)
          return
        }
      }
      raf = requestAnimationFrame(tick)
    }

    async function start(): Promise<void> {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        })
        if (stopped) {
          stream.getTracks().forEach((tr) => tr.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        raf = requestAnimationFrame(tick)
      } catch (e) {
        setError(String(e))
      }
    }
    start()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col items-start gap-2">
      {error ? (
        <p className="text-xs text-red-400">
          {t('Could not open the camera')}: {error}
        </p>
      ) : (
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full max-w-xs rounded-lg bg-black"
        />
      )}
      <Button variant="secondary" className="text-xs" onClick={onCancel}>
        {t('Cancel')}
      </Button>
    </div>
  )
}
