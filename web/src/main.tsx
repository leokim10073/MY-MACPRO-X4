import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme/tokens.css'
import './theme/primitives.css'
import './styles.css'
import App from './App.tsx'
import { ClientConfigError, createRoomClient, type ClientChoice } from './room/createRoomClient'

let choice: ClientChoice | null = null
try {
  choice = createRoomClient(window.location.search, import.meta.env)
} catch (e) {
  if (!(e instanceof ClientConfigError)) throw e
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {choice ? (
      <App
        client={choice.client}
        kind={choice.kind}
        makeClient={() => createRoomClient(window.location.search, import.meta.env).client}
      />
    ) : (
      <main>
        <h1>Backend not configured</h1>
        <p>VITE_CONVEX_URL is not set, so the real backend cannot be reached.</p>
        <a href="?client=mock">Use the offline demo</a>
      </main>
    )}
  </StrictMode>,
)
