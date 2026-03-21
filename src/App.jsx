function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '1rem' }}>
      <h1 style={{ fontSize: '2.5rem', color: 'var(--gold)', textAlign: 'center', textShadow: '0 2px 12px var(--gold-glow)' }}>
        Blackjack
      </h1>
      <p style={{ color: 'var(--text-dim)', marginTop: '0.5rem', fontFamily: "'JetBrains Mono', monospace" }}>
        $10,000
      </p>
    </div>
  )
}

export default App
