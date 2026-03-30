import { createDeck, shuffle } from './cardUtils'

/**
 * Draw `count` cards from the deck. If the deck is too small,
 * creates a fresh shuffled deck first.
 * Returns { cards, deck, reshuffled }.
 */
export function drawFromDeck(deck, count) {
  if (deck.length < count) {
    const freshDeck = shuffle(createDeck())
    return {
      cards: freshDeck.slice(0, count),
      deck: freshDeck.slice(count),
      reshuffled: true,
    }
  }
  return {
    cards: deck.slice(0, count),
    deck: deck.slice(count),
    reshuffled: false,
  }
}
