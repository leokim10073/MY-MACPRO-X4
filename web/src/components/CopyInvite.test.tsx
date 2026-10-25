import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CopyInvite from './CopyInvite'
import InviteQr from './InviteQr'

const url = 'https://spill-the-tea-call.vercel.app/?client=convex&room=abc123'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CopyInvite', () => {
  it('shows a button instead of the long link, and copies the link', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(<CopyInvite url={url} />)
    expect(document.body.textContent).not.toContain(url)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }))
    })
    expect(writeText).toHaveBeenCalledWith(url)
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeTruthy()
  })

  it('also shows the link as a QR code, which Done, Escape or the backdrop closes', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => {}) } })
    render(<CopyInvite url={url} />)
    const invite = screen.getByRole('button', { name: 'Copy invite link' })
    await act(async () => fireEvent.click(invite))
    const dialog = screen.getByRole('dialog', { name: 'Scan to join' })
    expect(within(dialog).getByRole('img', { name: 'QR code for the invite link' })).toBeTruthy()
    expect(dialog.querySelector('.invite-qr path')?.getAttribute('d')).toMatch(/^M\d/)
    expect(document.body.textContent).not.toContain(url)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement?.classList.contains('room-invite-copy')).toBe(true)

    await act(async () => fireEvent.click(invite))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    await act(async () => fireEvent.click(invite))
    fireEvent.click(document.querySelector('.invite-scrim')!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('different links give different codes', () => {
    const a = render(<InviteQr url={url} />).container.querySelector('path')!.getAttribute('d')
    cleanup()
    const b = render(<InviteQr url={url.replace('abc123', 'xyz789')} />).container.querySelector('path')!.getAttribute('d')
    expect(a).not.toBe(b)
  })

  it('shows the link to copy by hand when the browser refuses the clipboard', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) } })
    render(<CopyInvite url={url} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }))
    })
    expect((screen.getByLabelText('Invite link') as HTMLInputElement).value).toBe(url)
  })
})
