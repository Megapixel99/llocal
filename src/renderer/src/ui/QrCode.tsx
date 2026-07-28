import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'

/**
 * Render a string as a scannable QR code (canvas). Used to show a companion-server pairing payload
 * on the host so a phone can scan it instead of typing the URL + token. Always on a white quiet-zone
 * so it scans in dark mode too.
 */
export const QrCode = ({ value, size = 208 }: { value: string; size?: number }): React.ReactElement => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !value) return
    QRCode.toCanvas(canvas, value, { width: size, margin: 2 }, (err) => {
      setError(err ? String(err) : '')
    })
  }, [value, size])

  if (error) return <span className="text-xs text-red-400">{error}</span>
  return <canvas ref={canvasRef} width={size} height={size} className="rounded-lg bg-white p-2" />
}
