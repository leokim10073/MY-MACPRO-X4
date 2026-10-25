import { useMemo } from 'react'
import QRCode from 'qrcode'

/** Blank modules around the code; scanners need a quiet zone of 4. */
const QUIET = 4

// The invite link as a QR code, drawn as one SVG path so it stays sharp at any size.
// Made on the phone: the link never goes to a QR service.
export default function InviteQr({ url }: { url: string }) {
  const { size, path } = useMemo(() => {
    const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' })
    let d = ''
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) {
        if (modules.get(y, x)) d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`
      }
    }
    return { size: modules.size + QUIET * 2, path: d }
  }, [url])

  return (
    <svg className="invite-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR code for the invite link" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}
