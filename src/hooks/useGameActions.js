import { useCallback, useState } from 'react'
import { createDeck, shuffle } from '../utils/cardUtils'
import { drawFromDeck } from '../utils/deckUtils'
import {
  hit, doubleDown, split, takeLoan, newRound, resetGame,
  STAND,
} from '../reducer/actions'

export function useGameActions(dispatch, stateRef, onBack) {
  const [pendingLoanAction, setPendingLoanAction] = useState(null)

  const handleHit = useCallback(() => {
    const { cards, reshuffled, deck } = drawFromDeck(stateRef.current.deck, 1)
    dispatch(reshuffled ? hit(null, [cards[0], ...deck]) : hit(cards[0]))
  }, [dispatch, stateRef])

  const handleStand = useCallback(() => dispatch({ type: STAND }), [dispatch])

  const handleDoubleDown = useCallback(() => {
    const s = stateRef.current
    const hand = s.playerHands[s.activeHandIndex]
    if (hand && s.bankroll - hand.bet < 0 && !s.inDebtMode) {
      setPendingLoanAction({ type: 'double' })
      return
    }
    const { cards, reshuffled, deck } = drawFromDeck(s.deck, 1)
    dispatch(reshuffled ? doubleDown(null, [cards[0], ...deck]) : doubleDown(cards[0]))
  }, [dispatch, stateRef])

  const handleSplit = useCallback(() => {
    const s = stateRef.current
    const hand = s.playerHands[s.activeHandIndex]
    if (hand && s.bankroll - hand.bet < 0 && !s.inDebtMode) {
      setPendingLoanAction({ type: 'split' })
      return
    }
    const { cards, reshuffled, deck } = drawFromDeck(s.deck, 2)
    dispatch(reshuffled ? split(null, [cards[0], cards[1], ...deck]) : split(cards))
  }, [dispatch, stateRef])

  const handleConfirmLoan = useCallback(() => {
    const deck = stateRef.current.deck
    dispatch(takeLoan())
    if (pendingLoanAction?.type === 'double') {
      const { cards, reshuffled, deck: remaining } = drawFromDeck(deck, 1)
      dispatch(reshuffled ? doubleDown(null, [cards[0], ...remaining]) : doubleDown(cards[0]))
    } else if (pendingLoanAction?.type === 'split') {
      const { cards, reshuffled, deck: remaining } = drawFromDeck(deck, 2)
      dispatch(reshuffled ? split(null, [cards[0], cards[1], ...remaining]) : split(cards))
    }
    setPendingLoanAction(null)
  }, [dispatch, stateRef, pendingLoanAction])

  const handleCancelLoan = useCallback(() => setPendingLoanAction(null), [])

  const handleNewRound = useCallback(() => dispatch(newRound(shuffle(createDeck()))), [dispatch])

  const handleReset = useCallback(() => {
    if (stateRef.current.handsPlayed > 0) {
      if (!window.confirm('Start a new game? Current progress will be lost.')) return
    }
    dispatch(resetGame(shuffle(createDeck())))
  }, [dispatch, stateRef])

  const handleBack = useCallback(() => {
    if (stateRef.current.handsPlayed > 0) {
      if (!window.confirm('Return to menu? Current progress will be lost.')) return
    }
    onBack()
  }, [stateRef, onBack])

  return {
    pendingLoanAction,
    handleHit,
    handleStand,
    handleDoubleDown,
    handleSplit,
    handleConfirmLoan,
    handleCancelLoan,
    handleNewRound,
    handleReset,
    handleBack,
  }
}
