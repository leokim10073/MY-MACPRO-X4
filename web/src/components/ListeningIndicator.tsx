interface Props {
  /** True while this phone's mic is sending audio to speech-to-text. */
  micLive?: boolean
}

export default function ListeningIndicator({ micLive = false }: Props) {
  return (
    <div className={micLive ? 'listening listening-live' : 'listening'} role="status">
      <span className="listening-dot" aria-hidden="true" />
      <span>{micLive ? 'Listening · mic on' : 'Listening'}</span>
    </div>
  )
}
