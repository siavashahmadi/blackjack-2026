import { createHandObject } from './initialState'
import { handValue } from '../utils/cardUtils'
import { getVigRate } from '../constants/vigRates'
import { RESULTS } from '../constants/results'

export const MAX_BANKROLL_HISTORY = 500

export function computeVig(additionalBet, bankroll, committedBets = 0) {
  const effectiveBankroll = Math.max(0, bankroll - committedBets)
  const borrowedAmount = Math.max(0, additionalBet - effectiveBankroll)
  const vigRate = borrowedAmount > 0 ? getVigRate(bankroll) : 0
  return { vigAmount: Math.floor(borrowedAmount * vigRate), vigRate }
}

// --- playerHands helpers ---

export function activeHand(state) {
  return state.playerHands[state.activeHandIndex]
}

export function updateActiveHand(state, updates) {
  return state.playerHands.map((h, i) =>
    i === state.activeHandIndex ? { ...h, ...updates } : h
  )
}

export function advanceToNextHand(currentIndex, playerHands) {
  let nextIndex = currentIndex + 1
  while (nextIndex < playerHands.length && playerHands[nextIndex].status !== 'playing') {
    nextIndex++
  }
  if (nextIndex >= playerHands.length) {
    const allBust = playerHands.every(h => h.status === RESULTS.BUST)
    return {
      activeHandIndex: currentIndex,
      phase: allBust ? 'result' : 'dealerTurn',
      result: allBust ? RESULTS.BUST : null,
    }
  }
  return {
    activeHandIndex: nextIndex,
    phase: 'playing',
    result: null,
  }
}

export function determineAggregateResult(outcomes) {
  if (outcomes.length === 1) return outcomes[0]
  if (outcomes.includes(RESULTS.BLACKJACK)) return RESULTS.BLACKJACK
  const hasWin = outcomes.some(o => o === RESULTS.WIN || o === RESULTS.DEALER_BUST)
  const hasLoss = outcomes.some(o => o === RESULTS.LOSE || o === RESULTS.BUST)
  const hasPush = outcomes.some(o => o === RESULTS.PUSH)
  if (hasWin && hasLoss) return RESULTS.MIXED
  if (hasWin && hasPush) return RESULTS.MIXED
  if (hasWin) return outcomes.includes(RESULTS.DEALER_BUST) ? RESULTS.DEALER_BUST : RESULTS.WIN
  if (outcomes.every(o => o === RESULTS.PUSH)) return RESULTS.PUSH
  if (hasLoss && hasPush) return RESULTS.MIXED
  if (hasLoss) return outcomes.every(o => o === RESULTS.BUST) ? RESULTS.BUST : RESULTS.LOSE
  return RESULTS.MIXED
}

export function createSplitHandPair(splitHand, splitCards, isAces) {
  const hand1 = createHandObject([splitHand.cards[0], splitCards[0]], splitHand.bet)
  const hand2 = createHandObject([splitHand.cards[1], splitCards[1]], splitHand.bet)

  if (isAces) {
    hand1.isSplitAces = true
    hand2.isSplitAces = true
    hand1.status = 'standing'
    hand2.status = 'standing'
  } else {
    if (handValue(hand1.cards) === 21) hand1.status = 'standing'
    if (handValue(hand2.cards) === 21) hand2.status = 'standing'
  }
  return [hand1, hand2]
}

export function advanceAfterSplit(hands, activeIndex) {
  if (hands[activeIndex].status === 'playing') {
    return { phase: 'playing', result: null, activeHandIndex: activeIndex }
  }
  let idx = activeIndex
  while (idx < hands.length && hands[idx].status !== 'playing') idx++
  if (idx >= hands.length) {
    const allBust = hands.every(h => h.status === RESULTS.BUST)
    return { phase: allBust ? 'result' : 'dealerTurn', result: allBust ? RESULTS.BUST : null, activeHandIndex: activeIndex }
  }
  return { phase: 'playing', result: null, activeHandIndex: idx }
}

export function findSideBet(activeSideBets, betType) {
  return activeSideBets.find(sb => sb.type === betType)
}

export function updateSideBet(activeSideBets, betType, updater) {
  return activeSideBets.map(sb => sb.type === betType ? updater(sb) : sb)
}

export function removeSideBetFromList(activeSideBets, betType) {
  return activeSideBets.filter(sb => sb.type !== betType)
}
