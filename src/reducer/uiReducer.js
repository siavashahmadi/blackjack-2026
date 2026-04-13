import {
  TOGGLE_ASSET_MENU, TOGGLE_ACHIEVEMENTS, TOGGLE_DEBT_TRACKER, TOGGLE_HAND_HISTORY,
  DISMISS_ACHIEVEMENT, DISMISS_LOAN_SHARK, SET_LOAN_SHARK_MESSAGE,
  UNLOCK_ACHIEVEMENT, LOAD_ACHIEVEMENTS,
  TOGGLE_MUTE, TOGGLE_NOTIFICATIONS, LOAD_HIGHEST_DEBT,
  SET_DEALER_MESSAGE, SET_COMP_MESSAGE, DISMISS_COMP,
  TOGGLE_SETTINGS, TOGGLE_ACHIEVEMENTS_ENABLED, TOGGLE_DD_FACE_DOWN,
} from './actions'

export function uiReducer(state, action) {
  switch (action.type) {
    case TOGGLE_ASSET_MENU: {
      return { ...state, showAssetMenu: !state.showAssetMenu }
    }

    case TOGGLE_ACHIEVEMENTS: {
      return { ...state, showAchievements: !state.showAchievements }
    }

    case TOGGLE_DEBT_TRACKER: {
      return { ...state, showDebtTracker: !state.showDebtTracker }
    }

    case TOGGLE_HAND_HISTORY: {
      return { ...state, showHandHistory: !state.showHandHistory }
    }

    case DISMISS_ACHIEVEMENT: {
      return { ...state, achievementQueue: state.achievementQueue.slice(1) }
    }

    case DISMISS_LOAN_SHARK: {
      return { ...state, loanSharkQueue: state.loanSharkQueue.slice(1) }
    }

    case SET_LOAN_SHARK_MESSAGE: {
      return {
        ...state,
        loanSharkQueue: [...state.loanSharkQueue, ...action.messages],
        seenLoanThresholds: action.seenThresholds,
      }
    }

    case SET_COMP_MESSAGE: {
      return {
        ...state,
        compQueue: [...state.compQueue, ...action.messages],
        seenCompThresholds: action.seenThresholds,
        bankroll: state.bankroll + (action.totalCompValue || 0),
      }
    }

    case DISMISS_COMP: {
      return { ...state, compQueue: state.compQueue.slice(1) }
    }

    case UNLOCK_ACHIEVEMENT: {
      if (state.unlockedAchievements.includes(action.id)) return state
      return {
        ...state,
        unlockedAchievements: [...state.unlockedAchievements, action.id],
        achievementQueue: [...state.achievementQueue, action.id],
      }
    }

    case LOAD_ACHIEVEMENTS: {
      return { ...state, unlockedAchievements: action.ids }
    }

    case TOGGLE_MUTE: {
      return { ...state, muted: !state.muted }
    }

    case TOGGLE_NOTIFICATIONS: {
      return { ...state, notificationsEnabled: !state.notificationsEnabled }
    }

    case TOGGLE_SETTINGS: {
      return { ...state, showSettings: !state.showSettings }
    }

    case TOGGLE_ACHIEVEMENTS_ENABLED: {
      return { ...state, achievementsEnabled: !state.achievementsEnabled }
    }

    case TOGGLE_DD_FACE_DOWN: {
      return { ...state, ddCardFaceDown: !state.ddCardFaceDown }
    }

    case LOAD_HIGHEST_DEBT: {
      return { ...state, lowestBankroll: Math.min(state.lowestBankroll, action.value) }
    }

    case SET_DEALER_MESSAGE: {
      return {
        ...state,
        dealerMessage: action.message,
        shownDealerLines: action.shownDealerLines,
      }
    }

    default:
      return null
  }
}
