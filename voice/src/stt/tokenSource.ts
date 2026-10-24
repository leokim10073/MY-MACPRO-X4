import { TOKEN_REFRESH_MARGIN_MS } from '../config'

/** A short-lived Cartesia access token, as returned by our own backend. */
export interface SttToken {
  token: string
  /** Milliseconds since the epoch. */
  expiresAt: number
}

/**
 * Keeps a valid STT token in memory so pressing the button never waits on the network.
 * The token is refreshed in the background shortly before it expires. It is never written
 * to storage or logged.
 */
export class TokenSource {
  private current: SttToken | null = null
  private inFlight: Promise<SttToken> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(
    private readonly fetchToken: () => Promise<SttToken>,
    private readonly now: () => number = Date.now,
  ) {}

  /** Starts fetching now so the first press is fast. Errors are left for `get` to report. */
  prefetch(): void {
    this.refresh().catch(() => {})
  }

  async get(): Promise<string> {
    if (this.disposed) throw new Error('Token source was disposed')
    if (this.current && this.current.expiresAt - this.now() > TOKEN_REFRESH_MARGIN_MS) return this.current.token
    return (await this.refresh()).token
  }

  /** Forgets the token and stops refreshing. Used on burn and when leaving the room. */
  dispose(): void {
    this.disposed = true
    this.current = null
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private refresh(): Promise<SttToken> {
    if (!this.inFlight) {
      this.inFlight = this.fetchToken()
        .then((t) => {
          if (this.disposed) throw new Error('Token source was disposed')
          this.current = t
          this.schedule(t)
          return t
        })
        .finally(() => {
          this.inFlight = null
        })
    }
    return this.inFlight
  }

  private schedule(t: SttToken): void {
    if (this.timer) clearTimeout(this.timer)
    const wait = Math.max(0, t.expiresAt - TOKEN_REFRESH_MARGIN_MS - this.now())
    this.timer = setTimeout(() => this.prefetch(), wait)
  }
}

/** Fetches a token from our backend endpoint, which mints it with the server-side API key. */
export function fetchTokenFrom(url: string, init: RequestInit = { method: 'POST' }): () => Promise<SttToken> {
  return async () => {
    const res = await fetch(url, init)
    if (!res.ok) throw new Error(`Token request failed (${res.status})`)
    const body = (await res.json()) as Partial<SttToken>
    if (typeof body.token !== 'string' || typeof body.expiresAt !== 'number') throw new Error('Bad token response')
    return { token: body.token, expiresAt: body.expiresAt }
  }
}
