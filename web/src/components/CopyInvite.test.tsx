import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CopyInvite from './CopyInvite'

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

  it('shows the link to copy by hand when the browser refuses the clipboard', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) } })
    render(<CopyInvite url={url} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }))
    })
    expect((screen.getByLabelText('Invite link') as HTMLInputElement).value).toBe(url)
  })
})
