import {
  RESOLVE_HAND, OFFER_DOUBLE_OR_NOTHING, ACCEPT_DOUBLE_OR_NOTHING,
  DECLINE_DOUBLE_OR_NOTHING, NEW_ROUND, RESET_GAME,
  ACCEPT_TABLE_UPGRADE, DECLINE_TABLE_UPGRADE, DISMISS_TABLE_TOAST,
} from './actions'
import { createInitialState } from './initialState'
import { BLACKJACK_PAYOUT, RESHUFFLE_THRESHOLD } from '../constants/gameConfig'
import { getTableLevel, getTableChips, TABLE_LEVELS } from '../constants/tableLevels'
import { handValue, isWinResult, isLossResult } from '../utils/cardUtils'
import { RESULTS } from '../constants/results'
import { LEVEL_TO_DEALER } from '../constants/dealers'
import { SIDE_BET_MAP, SIDE_BET_TYPES } from '../constants/sideBets'
import { determineAggregateResult, MAX_BANKROLL_HISTORY } from './reducerHelpers'

export function resolveReducer(state, action) {
  switch (action.type) {
    case RESOLVE_HAND: {
      // Guard against double-dispatch (no bet exists to settle)
      if (state.phase === 'result' && state.chipStack.length === 0 && state.bettedAssets.length === 0) return state

      const { outcomes } = action
      const assetValue = state.bettedAssets.reduce((sum, a) => sum + a.value, 0)

      // Process each hand
      let totalDelta = 0
      const resolvedHands = state.playerHands.map((hand, i) => {
        const outcome = outcomes[i] || RESULTS.PUSH
        // Assets only apply to first hand's payout
        const handBet = hand.bet + (i === 0 ? assetValue : 0)

        let delta = 0
        switch (outcome) {
          case RESULTS.BLACKJACK:
            delta = Math.floor(BLACKJACK_PAYOUT * handBet)
            break
          case RESULTS.WIN:
          case RESULTS.DEALER_BUST:
            delta = handBet
            break
          case RESULTS.PUSH:
            delta = 0
            break
          case RESULTS.LOSE:
          case RESULTS.BUST:
            delta = -handBet
            break
        }
        totalDelta += delta
        return { ...hand, result: outcome, status: 'done', payout: delta }
      })

      // Handle assets: tied to hand[0], return if hand[0] wins/pushes
      const hand0Result = outcomes[0]
      const hand0Win = hand0Result === RESULTS.WIN || hand0Result === RESULTS.DEALER_BUST ||
        hand0Result === RESULTS.BLACKJACK || hand0Result === RESULTS.PUSH
      const newOwnedAssets = { ...state.ownedAssets }
      if (hand0Win) {
        for (const asset of state.bettedAssets) {
          newOwnedAssets[asset.id] = true
        }
      }

      const aggregateResult = determineAggregateResult(outcomes)
      const isWin = isWinResult(aggregateResult)
      const isLoss = isLossResult(aggregateResult)
      const isMixed = aggregateResult === RESULTS.MIXED

      // Resolve deferred side bets
      let deferredSideBetDelta = 0
      const deferredResults = []
      const dealerBusted = outcomes.some(o => o === RESULTS.DEALER_BUST)

      for (const sb of state.activeSideBets) {
        const def = SIDE_BET_MAP[sb.type]
        if (def && def.resolveAt === 'resolve') {
          let won = false
          if (sb.type === SIDE_BET_TYPES.DEALER_BUST) won = dealerBusted
          else if (sb.type === SIDE_BET_TYPES.JINX_BET) won = isLoss
          const delta = won ? sb.amount * (def.payout + 1) : 0
          const displayPayout = won ? sb.amount * def.payout : -sb.amount
          deferredSideBetDelta += delta
          deferredResults.push({ type: sb.type, amount: sb.amount, won, payout: displayPayout })
        }
      }

      const newBankroll = state.bankroll + totalDelta + deferredSideBetDelta

      // --- Stats tracking ---
      const totalBet = resolvedHands.reduce((sum, h) => sum + h.bet, 0) + assetValue
      const newWinStreak = isWin ? state.winStreak + 1 : (isLoss || isMixed ? 0 : state.winStreak)
      const newLoseStreak = isLoss ? state.loseStreak + 1 : (isWin || isMixed ? 0 : state.loseStreak)

      // Double down tracking
      let newDoublesWon = state.doublesWon
      let newDoublesLost = state.doublesLost
      for (const hand of resolvedHands) {
        if (hand.isDoubledDown) {
          if (isWinResult(hand.result)) newDoublesWon++
          if (isLossResult(hand.result)) newDoublesLost++
        }
      }

      // Split tracking
      let newSplitsWon = state.splitsWon
      let newSplitsLost = state.splitsLost
      if (state.playerHands.length > 1) {
        for (const hand of resolvedHands) {
          if (isWinResult(hand.result)) newSplitsWon++
          if (isLossResult(hand.result)) newSplitsLost++
        }
      }

      // Hand history entry
      const historyEntry = {
        handNumber: state.handsPlayed + 1,
        playerHands: resolvedHands.map(h => ({
          cards: h.cards,
          value: handValue(h.cards),
          result: h.result,
          bet: h.bet,
          payout: h.payout,
          isDoubledDown: h.isDoubledDown,
        })),
        dealerCards: state.dealerHand,
        dealerValue: handValue(state.dealerHand),
        result: aggregateResult,
        totalBet,
        totalDelta,
        bankrollAfter: newBankroll,
      }
      const newHandHistory = [historyEntry, ...state.handHistory].slice(0, 30)

      // Table level progression
      const computedLevel = getTableLevel(newBankroll)
      let newTableLevel = state.tableLevel
      let tableLevelChanged = null
      let pendingTableUpgrade = state.pendingTableUpgrade
      let declinedTableUpgrade = state.declinedTableUpgrade
      let selectedChipValue = state.selectedChipValue

      if (computedLevel !== state.tableLevel) {
        if (computedLevel < state.tableLevel) {
          // Downgrade: apply immediately
          newTableLevel = computedLevel
          tableLevelChanged = { from: state.tableLevel, to: computedLevel }
          pendingTableUpgrade = null
          declinedTableUpgrade = null
          const downgradeChips = getTableChips(computedLevel, newBankroll)
          const downgradeValues = downgradeChips.map(c => c.value)
          selectedChipValue = downgradeValues.includes(selectedChipValue)
            ? selectedChipValue : downgradeValues[0]
        } else if (declinedTableUpgrade !== computedLevel) {
          // Upgrade: show modal instead of auto-switching
          pendingTableUpgrade = { from: state.tableLevel, to: computedLevel }
        }
      } else {
        // Still at current level — clear declined if bankroll dropped below that threshold
        if (declinedTableUpgrade !== null && computedLevel < declinedTableUpgrade) {
          declinedTableUpgrade = null
        }
      }

      // Track highest table level reached and current dealer
      const newHighestTableLevel = Math.max(state.highestTableLevel, newTableLevel)

      // Exit debt mode if bankroll recovered to >= minBet
      const resolveMinBet = TABLE_LEVELS[newTableLevel].minBet
      const newInDebtMode = state.inDebtMode && newBankroll < resolveMinBet

      return {
        ...state,
        bankroll: newBankroll,
        inDebtMode: newInDebtMode,
        playerHands: resolvedHands,
        ownedAssets: newOwnedAssets,
        bettedAssets: [],
        chipStack: [],
        activeSideBets: [],
        sideBetResults: [...state.sideBetResults, ...deferredResults],
        phase: 'result',
        result: aggregateResult,
        tableLevel: newTableLevel,
        tableLevelChanged,
        pendingTableUpgrade,
        declinedTableUpgrade,
        selectedChipValue,
        currentDealer: LEVEL_TO_DEALER[newTableLevel],
        highestTableLevel: newHighestTableLevel,
        handsPlayed: state.handsPlayed + 1,
        handsWon: isWin ? state.handsWon + 1 : state.handsWon,
        blackjackCount: aggregateResult === RESULTS.BLACKJACK ? state.blackjackCount + 1 : state.blackjackCount,
        winStreak: newWinStreak,
        loseStreak: newLoseStreak,
        bestWinStreak: Math.max(state.bestWinStreak, newWinStreak),
        bestLoseStreak: Math.max(state.bestLoseStreak, newLoseStreak),
        biggestWin: totalDelta > 0 ? Math.max(state.biggestWin, totalDelta) : state.biggestWin,
        biggestLoss: totalDelta < 0 ? Math.max(state.biggestLoss, Math.abs(totalDelta)) : state.biggestLoss,
        totalWagered: state.totalWagered + totalBet,
        doublesWon: newDoublesWon,
        doublesLost: newDoublesLost,
        splitsWon: newSplitsWon,
        splitsLost: newSplitsLost,
        totalWon: totalDelta > 0 ? state.totalWon + totalDelta : state.totalWon,
        totalLost: totalDelta < 0 ? state.totalLost + Math.abs(totalDelta) : state.totalLost,
        peakBankroll: Math.max(state.peakBankroll, newBankroll),
        lowestBankroll: Math.min(state.lowestBankroll, newBankroll),
        bankrollHistory: state.bankrollHistory.length >= MAX_BANKROLL_HISTORY
          ? [...state.bankrollHistory.slice(-(MAX_BANKROLL_HISTORY - 1)), newBankroll]
          : [...state.bankrollHistory, newBankroll],
        handHistory: newHandHistory,
      }
    }

    case OFFER_DOUBLE_OR_NOTHING: {
      if (state.phase !== 'result') return state
      return {
        ...state,
        doubleOrNothing: {
          originalLoss: action.lossAmount,
          currentStakes: action.lossAmount,
          flipCount: 0,
          lastResult: null,
        },
      }
    }

    case ACCEPT_DOUBLE_OR_NOTHING: {
      if (!state.doubleOrNothing) return state
      const don = state.doubleOrNothing
      if (action.won) {
        // Win: erase the loss (add currentStakes back to bankroll)
        return {
          ...state,
          bankroll: state.bankroll + don.currentStakes,
          doubleOrNothing: null,
          donFlipsWon: state.donFlipsWon + 1,
          donBiggestStakes: Math.max(state.donBiggestStakes, don.currentStakes),
          donLastChainLength: don.flipCount,
        }
      } else {
        // Lose: lose an additional currentStakes, double the stakes for next flip
        const newStakes = don.currentStakes * 2
        return {
          ...state,
          bankroll: state.bankroll - don.currentStakes,
          doubleOrNothing: {
            ...don,
            currentStakes: newStakes,
            flipCount: don.flipCount + 1,
            lastResult: 'lose',
          },
          donFlipsLost: state.donFlipsLost + 1,
          donBiggestStakes: Math.max(state.donBiggestStakes, newStakes),
          lowestBankroll: Math.min(state.lowestBankroll, state.bankroll - don.currentStakes),
        }
      }
    }

    case DECLINE_DOUBLE_OR_NOTHING: {
      return {
        ...state,
        doubleOrNothing: null,
      }
    }

    case NEW_ROUND: {
      if (state.phase !== 'result' || state.chipStack.length > 0) return state

      const deck = state.deck.length < RESHUFFLE_THRESHOLD
        ? action.freshDeck
        : state.deck

      return {
        ...state,
        deck,
        playerHands: [],
        activeHandIndex: 0,
        dealerHand: [],
        chipStack: [],
        bettedAssets: [],
        activeSideBets: [],
        sideBetResults: [],
        showSideBets: false,
        phase: 'betting',
        result: null,
        isAllIn: false,
        dealerMessage: '',
        showAssetMenu: false,
        vigAmount: 0,
        vigRate: 0,
        tableLevelChanged: null,
        doubleOrNothing: null,
      }
    }

    case DISMISS_TABLE_TOAST: {
      return { ...state, tableLevelChanged: null }
    }

    case ACCEPT_TABLE_UPGRADE: {
      if (!state.pendingTableUpgrade) return state
      const { from, to } = state.pendingTableUpgrade
      const upgradeChips = getTableChips(to, state.bankroll)
      const upgradeValues = upgradeChips.map(c => c.value)
      const chipValue = upgradeValues.includes(state.selectedChipValue)
        ? state.selectedChipValue : upgradeValues[0]
      return {
        ...state,
        tableLevel: to,
        tableLevelChanged: { from, to },
        pendingTableUpgrade: null,
        declinedTableUpgrade: null,
        selectedChipValue: chipValue,
      }
    }

    case DECLINE_TABLE_UPGRADE: {
      if (!state.pendingTableUpgrade) return state
      return {
        ...state,
        pendingTableUpgrade: null,
        declinedTableUpgrade: state.pendingTableUpgrade.to,
      }
    }

    case RESET_GAME: {
      return { ...createInitialState(), deck: action.freshDeck, muted: state.muted, notificationsEnabled: state.notificationsEnabled, achievementsEnabled: state.achievementsEnabled, ddCardFaceDown: state.ddCardFaceDown }
    }

    default:
      return null
  }
}
