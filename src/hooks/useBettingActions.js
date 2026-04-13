import { useCallback } from 'react'
import { drawFromDeck } from '../utils/deckUtils'
import audioManager from '../utils/audioManager'
import { deal, CLEAR_CHIPS, ALL_IN } from '../reducer/actions'

export function useBettingActions(dispatch, stateRef) {
  const handleClear = useCallback(() => dispatch({ type: CLEAR_CHIPS }), [dispatch])

  const handleAllIn = useCallback(() => {
    audioManager.play('all_in')
    dispatch({ type: ALL_IN })
  }, [dispatch])

  const handleDeal = useCallback(() => {
    const { cards, deck, reshuffled } = drawFromDeck(stateRef.current.deck, 4)
    dispatch(deal(cards, reshuffled ? deck : undefined))
  }, [dispatch, stateRef])

  return { handleClear, handleAllIn, handleDeal }
}
