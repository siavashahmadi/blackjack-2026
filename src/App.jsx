import { useMemo } from 'react'
import Card from './components/Card'
import Hand from './components/Hand'
import { createDeck, shuffle } from './utils/cardUtils'

function App() {
  const testCards = useMemo(() => {
    const deck = shuffle(createDeck())
    return {
      // One card per suit for color verification
      singles: [
        { rank: 'A', suit: 'hearts', id: 'test-ah' },
        { rank: 'K', suit: 'spades', id: 'test-ks' },
        { rank: 'Q', suit: 'diamonds', id: 'test-qd' },
        { rank: 'J', suit: 'clubs', id: 'test-jc' },
      ],
      twoCard: deck.slice(0, 2),
      fourCard: deck.slice(2, 6),
      sixCard: deck.slice(6, 12),
      dealerHand: deck.slice(12, 14),
    }
  }, [])

  return (
    <div style={{ padding: '1rem', maxWidth: '430px', margin: '0 auto' }}>
      <h1 style={{ color: 'var(--gold)', textAlign: 'center', fontSize: '1.8rem', marginBottom: '1.5rem', textShadow: '0 2px 12px var(--gold-glow)' }}>
        Card &amp; Hand Test
      </h1>

      {/* Individual cards — suit colors */}
      <Section label="Individual Cards (suit colors)">
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {testCards.singles.map((card) => (
            <Card key={card.id} card={card} animate={false} />
          ))}
          <Card card={testCards.singles[0]} faceDown animate={false} />
        </div>
      </Section>

      {/* 2-card hand — gap, no overlap */}
      <Section label="2-Card Hand (10px gap)">
        <Hand cards={testCards.twoCard} animate={false} />
      </Section>

      {/* 4-card hand — overlapping */}
      <Section label="4-Card Hand (-15px overlap)">
        <Hand cards={testCards.fourCard} animate={false} />
      </Section>

      {/* 6-card hand — tight overlap */}
      <Section label="6-Card Hand (-35px overlap)">
        <Hand cards={testCards.sixCard} animate={false} />
      </Section>

      {/* Dealer hand with hole card hidden */}
      <Section label="Dealer Hand (hole card hidden)">
        <Hand cards={testCards.dealerHand} hideFirst animate={false} />
      </Section>

      {/* Animated deal */}
      <Section label="Animated Deal">
        <Hand cards={testCards.fourCard} />
      </Section>
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '0.5rem', textAlign: 'center' }}>
        {label}
      </p>
      {children}
    </div>
  )
}

export default App
