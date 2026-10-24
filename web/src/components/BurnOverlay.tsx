import { useEffect, useRef } from 'react'

interface Props {
  /** Epoch ms when the burn starts drawing (closing.startedAt + BURN_START_MS). */
  startAt: number
  durationMs: number
  seed: number
  reducedMotion: boolean
}

interface Layer {
  c: HTMLCanvasElement
  x: CanvasRenderingContext2D
  img: ImageData
}

interface Particle {
  ash: boolean
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  rot: number
  vr: number
  phase: number
  pts: number[][]
}

const CELL = 3
const MAX_PARTICLES = 70
const CHARCOAL = '#111114' // --br-charcoal
const MAX_SIZE_RETRIES = 120

function rng(seed: number) {
  let a = (seed >>> 0) || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function lattice(rand: () => number, cols: number, rows: number, step: number) {
  const gw = Math.ceil(cols / step) + 2
  const gh = Math.ceil(rows / step) + 2
  const g = new Float32Array(gw * gh)
  for (let i = 0; i < g.length; i++) g[i] = rand()
  return (c: number, r: number) => {
    const x = c / step
    const y = r / step
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    let fx = x - x0
    let fy = y - y0
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    const a = g[y0 * gw + x0]
    const b = g[y0 * gw + x0 + 1]
    const c2 = g[(y0 + 1) * gw + x0]
    const d = g[(y0 + 1) * gw + x0 + 1]
    return a + (b - a) * fx + (c2 + (d - c2) * fx - (a + (b - a) * fx)) * fy
  }
}

// Burn-front position for 0-1 progress. Starts just above 0 so the ember's landing spot is already lit.
function front(progress: number) {
  return 0.035 + progress * 1.3
}

/**
 * Sizes the canvas and starts the animation. Returns a cleanup that cancels the frame.
 * It draws only shapes and colors from a seed and the clock; it never reads the page.
 */
function run(canvas: HTMLCanvasElement, startAt: number, dur: number, seed: number, reduced: boolean) {
  let raf = 0
  let gone = false
  let waits = 0

  const begin = () => {
    if (gone) return
    const rect = canvas.getBoundingClientRect()
    // The canvas must have a real size before drawing; the board may lay out a frame later.
    if (rect.width < 2 || rect.height < 2) {
      if (++waits < MAX_SIZE_RETRIES) raf = requestAnimationFrame(begin)
      return
    }
    const w = rect.width
    const h = rect.height
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // A 3 px grid, drawn into a small bitmap and scaled up with smoothing, so the edge reads as soft, not as squares.
    const cols = Math.ceil(w / CELL)
    const rows = Math.ceil(h / CELL)
    const rand = rng(seed)
    const coarse = lattice(rand, cols, rows, 18)
    const fine = lattice(rand, cols, rows, 5)
    const field = new Float32Array(cols * rows)
    const speck = new Float32Array(cols * rows)
    for (let r = 0; r < rows; r++) {
      const yn = rows > 1 ? r / (rows - 1) : 1
      for (let col = 0; col < cols; col++) {
        const xn = cols > 1 ? col / (cols - 1) : 0.5
        const fn = fine(col, r)
        const n = 0.65 * coarse(col, r) + 0.35 * fn
        field[r * cols + col] = (1 - yn) * 0.78 + Math.abs(xn - 0.5) * 0.22 + n * 0.24
        speck[r * cols + col] = fn
      }
    }

    const palette: string[] = []
    const paletteRGB: number[][] = []
    const gold = [255, 230, 175]
    const orange = [255, 118, 46]
    const red = [173, 53, 39]
    for (let i = 0; i <= 20; i++) {
      const t = i / 20
      const a = t < 0.35 ? gold : orange
      const b = t < 0.35 ? orange : red
      const k = t < 0.35 ? t / 0.35 : (t - 0.35) / 0.65
      const rgb = [0, 1, 2].map((j) => Math.round(a[j] + (b[j] - a[j]) * k))
      paletteRGB.push(rgb)
      palette.push('rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')')
    }

    const mk = (): Layer | null => {
      const c = document.createElement('canvas')
      c.width = cols
      c.height = rows
      const x = c.getContext('2d')
      return x ? { c, x, img: x.createImageData(cols, rows) } : null
    }
    const body = mk()
    const glow = mk()
    if (!body || !glow) return
    const canBlur = typeof ctx.filter === 'string'
    let parts: Particle[] = []
    let spawnRand: (() => number) | null = null
    let last = 0
    let finished = false

    const paint = (p: number) => {
      const n = cols * rows
      const bd = body.img.data
      const gd = glow.img.data
      const band: number[] = []
      for (let i = 0; i < n; i++) {
        const o = i * 4
        const d = p - field[i]
        gd[o + 3] = 0
        if (d <= 0) {
          bd[o + 3] = 0
          continue
        }
        let r: number
        let g: number
        let b: number
        if (d > 0.07) {
          if (speck[i] > 0.8 && d < 0.16) {
            r = 36
            g = 28
            b = 26
          } else {
            r = 17
            g = 17
            b = 20
          }
        } else if (d > 0.035) {
          // Char band, warming toward the glow so the two blend instead of meeting at a hard line.
          const k = (0.07 - d) / 0.035
          r = Math.round(36 + 60 * k * k)
          g = Math.round(28 + 10 * k * k)
          b = 26
        } else {
          const rgb = paletteRGB[Math.min(20, Math.round((d / 0.035) * 20))]
          r = rgb[0]
          g = rgb[1]
          b = rgb[2]
          gd[o] = 255
          gd[o + 1] = d < 0.012 ? 200 : 118
          gd[o + 2] = 46
          gd[o + 3] = 255
          if (band.length < 6000) band.push(i)
        }
        bd[o] = r
        bd[o + 1] = g
        bd[o + 2] = b
        // Fade in over the leading edge so the burn front is soft.
        bd[o + 3] = d < 0.01 ? Math.round(255 * (d / 0.01)) : 255
      }
      body.x.putImageData(body.img, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(body.c, 0, 0, w, h)
      if (band.length) {
        glow.x.putImageData(glow.img, 0, 0)
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.45
        if (canBlur) ctx.filter = 'blur(6px)'
        ctx.drawImage(glow.c, 0, 0, w, h)
        ctx.restore()
      }
      return band
    }

    const spawn = (band: number[], rnd: () => number, u: number) => {
      if (!band.length || parts.length >= MAX_PARTICLES) return
      const i = band[Math.floor(rnd() * band.length)]
      const x = (i % cols) * CELL + CELL / 2
      const y = Math.floor(i / cols) * CELL
      const ash = rnd() < Math.min(0.65, 0.15 + u * 0.6)
      const s = 2 + rnd() * 3.4
      parts.push({
        ash,
        x,
        y,
        vx: (rnd() - 0.5) * 0.5,
        vy: ash ? -(0.25 + rnd() * 0.5) : -(0.7 + rnd() * 1.1),
        life: 0,
        max: ash ? 70 + rnd() * 60 : 34 + rnd() * 40,
        size: ash ? s : 1.1 + rnd() * 1.6,
        rot: rnd() * 6.28,
        vr: (rnd() - 0.5) * 0.12,
        phase: rnd() * 6.28,
        pts: [
          [-s, -s * 0.5 * rnd()],
          [s * 0.7, -s * 0.6],
          [s, s * 0.4 * rnd()],
          [-s * 0.4, s * 0.7],
        ],
      })
    }

    const drawPart = (q: Particle) => {
      const f = q.life / q.max
      if (q.ash) {
        ctx.save()
        ctx.translate(q.x, q.y)
        ctx.rotate(q.rot)
        ctx.fillStyle = 'rgba(141,133,128,' + (0.75 * (1 - f)).toFixed(3) + ')'
        ctx.beginPath()
        ctx.moveTo(q.pts[0][0], q.pts[0][1])
        for (let k = 1; k < 4; k++) ctx.lineTo(q.pts[k][0], q.pts[k][1])
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      } else {
        ctx.fillStyle = palette[Math.min(20, Math.round(f * 20))]
        ctx.globalAlpha = Math.max(0, 1 - f)
        ctx.beginPath()
        ctx.arc(q.x, q.y, q.size * (1 - f * 0.5), 0, 6.283)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    const drawParts = (dt: number) => {
      const keep: Particle[] = []
      for (const q of parts) {
        q.life += dt
        if (q.life >= q.max) continue
        q.x += q.vx * dt + Math.sin(q.phase + q.life * 0.08) * 0.25 * dt
        q.y += q.vy * dt
        q.rot += q.vr * dt
        drawPart(q)
        keep.push(q)
      }
      parts = keep
    }

    const fillCharcoal = () => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = CHARCOAL
      ctx.fillRect(0, 0, w, h)
    }

    const frame = (now: number) => {
      const dt = Math.min(3, Math.max(0.2, (now - (last || now)) / 16.7))
      last = now
      if (!spawnRand) spawnRand = rng(seed + 7)
      if (now < startAt) {
        ctx.clearRect(0, 0, w, h)
        return
      }
      const u = (now - startAt) / dur
      if (reduced) {
        // Reduced motion: a plain fade to charcoal over the first 30%.
        ctx.clearRect(0, 0, w, h)
        ctx.globalAlpha = Math.min(1, u / 0.3)
        ctx.fillStyle = CHARCOAL
        ctx.fillRect(0, 0, w, h)
        ctx.globalAlpha = 1
        if (u >= 0.3) finished = true
        return
      }
      // Mostly linear with a gentle ease, so the front moves as soon as the ember lands.
      const c = Math.min(1, u)
      const e = 0.55 * c + 0.45 * c * c * (3 - 2 * c)
      const band = paint(front(e))
      if (u < 1) {
        spawn(band, spawnRand, u)
        spawn(band, spawnRand, u)
        drawParts(dt)
      } else {
        // The burn ends with the duration: drop any leftover sparks and settle on charcoal.
        parts = []
        fillCharcoal()
        finished = true
      }
    }

    const loop = () => {
      frame(Date.now())
      if (!finished && !gone) raf = requestAnimationFrame(loop)
    }
    last = Date.now()
    loop()
  }

  begin()
  return () => {
    gone = true
    cancelAnimationFrame(raf)
  }
}

// The painted burn that sweeps up the room board. It sits over the board and never takes input.
export default function BurnOverlay({ startAt, durationMs, seed, reducedMotion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    return run(canvas, startAt, durationMs, seed, reducedMotion)
  }, [startAt, durationMs, seed, reducedMotion])

  return <canvas ref={canvasRef} className="burn-overlay" aria-hidden="true" data-reduced={reducedMotion} />
}
