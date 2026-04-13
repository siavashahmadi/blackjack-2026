import {
  ADD_CHIP, UNDO_CHIP, CLEAR_CHIPS, SELECT_CHIP, ALL_IN,
  PLACE_SIDE_BET, CLEAR_SIDE_BET, REMOVE_SIDE_BET_CHIP, TOGGLE_SIDE_BETS,
} from './actions'
import { TABLE_LEVELS } from '../constants/tableLevels'
import { sumChipStack, decomposeIntoChips } from '../utils/chipUtils'
import { SIDE_BET_MAP } from '../constants/sideBets'
import { findSideBet, updateSideBet, removeSideBetFromList } from './reducerHelpers'

export function bettingReducer(state, action) {
  switch (action.type) {
    case ADD_CHIP: {
      if (state.phase !== 'betting') return state
      // Block chips when bankroll < minBet and not in debt mode (must bet asset or take loan first)
      const addChipMinBet = TABLE_LEVELS[state.tableLevel].minBet
      if (state.bankroll < addChipMinBet && !state.inDebtMode) return state
      // Cap total bet at bankroll when not in debt mode
      const newTotal = sumChipStack(state.chipStack) + action.value
      if (newTotal > state.bankroll && !state.inDebtMode) return state
      return { ...state, chipStack: [...state.chipStack, action.value] }
    }

    case UNDO_CHIP: {
      if (state.phase !== 'betting' || state.chipStack.length === 0) return state
      const newStack = state.chipStack.slice(0, -1)
      return { ...state, chipStack: newStack, isAllIn: newStack.length === 0 ? false : state.isAllIn }
    }

    case CLEAR_CHIPS: {
      if (state.phase !== 'betting') return state
      return { ...state, chipStack: [], isAllIn: false }
    }

    case SELECT_CHIP: {
      return { ...state, selectedChipValue: action.value }
    }

    case ALL_IN: {
      if (state.phase !== 'betting') return state
      // Block when bankroll < minBet and not in debt mode
      const allInMinBet = TABLE_LEVELS[state.tableLevel].minBet
      if (state.bankroll < allInMinBet && !state.inDebtMode) return state
      let allInAmount
      if (state.inDebtMode) {
        // "HAIL MARY" — bet the full debt amount, luring the player into thinking they can win it all back
        allInAmount = Math.abs(state.bankroll)
      } else {
        allInAmount = state.bankroll
      }
      const chipStack = decomposeIntoChips(allInAmount)
      return { ...state, chipStack, isAllIn: true }
    }

    case PLACE_SIDE_BET: {
      if (state.phase !== 'betting') return state
      const chipValue = action.chipValue
      if (!chipValue || chipValue <= 0) return state
      const sbDef = SIDE_BET_MAP[action.betType]
      if (!sbDef) return state
      if (!state.inDebtMode && state.bankroll < chipValue) return state

      const existing = findSideBet(state.activeSideBets, action.betType)
      let newSideBets
      if (existing) {
        newSideBets = updateSideBet(state.activeSideBets, action.betType, sb => ({ ...sb, amount: sb.amount + chipValue }))
      } else {
        newSideBets = [...state.activeSideBets, { type: action.betType, amount: chipValue }]
      }
      return { ...state, activeSideBets: newSideBets, bankroll: state.bankroll - chipValue }
    }

    case CLEAR_SIDE_BET: {
      if (state.phase !== 'betting') return state
      const bet = findSideBet(state.activeSideBets, action.betType)
      if (!bet) return state
      return {
        ...state,
        activeSideBets: removeSideBetFromList(state.activeSideBets, action.betType),
        bankroll: state.bankroll + bet.amount,
      }
    }

    case REMOVE_SIDE_BET_CHIP: {
      if (state.phase !== 'betting') return state
      const chipVal = action.chipValue
      if (!chipVal || chipVal <= 0) return state
      const existing = findSideBet(state.activeSideBets, action.betType)
      if (!existing) return state
      const newAmount = existing.amount - chipVal
      if (newAmount <= 0) {
        return {
          ...state,
          activeSideBets: removeSideBetFromList(state.activeSideBets, action.betType),
          bankroll: state.bankroll + existing.amount,
        }
      }
      return {
        ...state,
        activeSideBets: updateSideBet(state.activeSideBets, action.betType, sb => ({ ...sb, amount: newAmount })),
        bankroll: state.bankroll + chipVal,
      }
    }

    case TOGGLE_SIDE_BETS:
      return { ...state, showSideBets: !state.showSideBets }

    default:
      return null
  }
}
