import { useEffect, useRef } from 'react'
import { TOGGLE_MUTE, loadHighestDebt } from '../reducer/actions'

const KEYS = {
  MUTED: 'blackjack_muted',
  HIGHEST_DEBT: 'blackjack_highest_debt',
}

export function useSessionPersistence(state, dispatch) {
  const loadedRef = useRef(false)

  // Load persisted values on mount
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    try {
      const savedMuted = localStorage.getItem(KEYS.MUTED)
      if (savedMuted === 'true' && !state.muted) {
        dispatch({ type: TOGGLE_MUTE })
      }

      const savedDebt = localStorage.getItem(KEYS.HIGHEST_DEBT)
      if (savedDebt) {
        const value = Number(savedDebt)
        if (Number.isFinite(value)) {
          dispatch(loadHighestDebt(value))
        }
      }
    } catch {
      // Corrupted localStorage, ignore
    }
  }, [dispatch])

  // Persist mute preference
  useEffect(() => {
    if (!loadedRef.current) return
    try {
      localStorage.setItem(KEYS.MUTED, String(state.muted))
    } catch {
      // localStorage full, ignore
    }
  }, [state.muted])

  // Persist highest debt (lowest bankroll)
  useEffect(() => {
    if (!loadedRef.current) return
    try {
      const stored = localStorage.getItem(KEYS.HIGHEST_DEBT)
      const current = state.lowestBankroll
      if (!stored || current < Number(stored)) {
        localStorage.setItem(KEYS.HIGHEST_DEBT, String(current))
      }
    } catch {
      // localStorage full, ignore
    }
  }, [state.lowestBankroll])
}
