import { useEffect, useRef } from 'react'
import { LOAN_SHARK_THRESHOLDS } from '../constants/loanSharkMessages'
import { setLoanSharkMessage } from '../reducer/actions'

export function useLoanShark(state, dispatch) {
  const prevBankrollRef = useRef(state.bankroll)

  useEffect(() => {
    const prevBankroll = prevBankrollRef.current
    prevBankrollRef.current = state.bankroll

    // Only check when bankroll decreased
    if (state.bankroll >= prevBankroll) return
    // Only check when in debt
    if (state.bankroll >= 0) return

    // Find newly crossed thresholds
    const newMessages = []
    const newSeenThresholds = [...state.seenLoanThresholds]

    for (const { threshold, message } of LOAN_SHARK_THRESHOLDS) {
      if (
        state.bankroll <= threshold &&
        !state.seenLoanThresholds.includes(threshold)
      ) {
        newMessages.push(message)
        newSeenThresholds.push(threshold)
      }
    }

    if (newMessages.length > 0) {
      dispatch(setLoanSharkMessage(newMessages, newSeenThresholds))
    }
  }, [state.bankroll])
}
