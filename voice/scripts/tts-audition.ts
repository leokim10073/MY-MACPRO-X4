// Generates the Kevin recap and the opener with each narrator candidate so the team can pick one.
// Files land in voice/out/ (ignored by git). Listen with earbuds, then set NARRATOR_VOICE_ID.
//
//   npm run tts:audition
import { mkdir, writeFile } from 'node:fs/promises'
import fixture from '../../shared/fixtures/kevin.expected.json'
import { NARRATOR_CANDIDATES, RECAP_OPENER_TEXT } from '../src/config'
import { mp3Seconds, synthesizeRecap, synthesizeSpeech } from '../src/server/cartesia'

const apiKey = process.env.CARTESIA_API_KEY
if (!apiKey) throw new Error('Set CARTESIA_API_KEY in voice/.env')

async function run() {
  const outDir = new URL('../out/', import.meta.url)
  await mkdir(outDir, { recursive: true })
  console.log(`Recap: "${fixture.recap.text}"\n`)

  for (const [name, voiceId] of Object.entries(NARRATOR_CANDIDATES)) {
    const started = performance.now()
    const recap = await synthesizeRecap(apiKey!, fixture.recap.text, { voiceId })
    const ms = Math.round(performance.now() - started)
    const opener = await synthesizeSpeech(apiKey!, RECAP_OPENER_TEXT, { voiceId })
    await writeFile(new URL(`recap-${name}.mp3`, outDir), recap.mp3)
    await writeFile(new URL(`opener-${name}.mp3`, outDir), opener)
    const seconds = mp3Seconds(recap.mp3.byteLength).toFixed(1)
    const warn = recap.overLimit || Number(seconds) > 22 ? '  ⚠ over the 20 s / 50-word target' : ''
    console.log(`${name.padEnd(7)} ${seconds} s, ${recap.words} words, generated in ${ms} ms${warn}`)
  }
  console.log(`\nFiles in ${outDir.pathname}`)
}

run().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
