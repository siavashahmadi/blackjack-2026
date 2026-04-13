import { useCallback } from 'react'
import {
  removeAsset, takeLoan,
  placeSideBet, removeSideBetChip, clearSideBet,
  acceptDoubleOrNothing, declineDoubleOrNothing,
  TOGGLE_ASSET_MENU, DISMISS_LOAN_SHARK, DISMISS_COMP,
  TOGGLE_ACHIEVEMENTS, TOGGLE_DEBT_TRACKER, TOGGLE_HAND_HISTORY,
  DISMISS_ACHIEVEMENT, TOGGLE_MUTE, TOGGLE_NOTIFICATIONS,
  DISMISS_TABLE_TOAST, ACCEPT_TABLE_UPGRADE, DECLINE_TABLE_UPGRADE,
  TOGGLE_SETTINGS, TOGGLE_ACHIEVEMENTS_ENABLED, TOGGLE_DD_FACE_DOWN,
  TOGGLE_SIDE_BETS,
} from '../reducer/actions'

export function useUIActions(dispatch, stateRef) {
  const handleDismissTableToast = useCallback(() => {
    dispatch({ type: DISMISS_TABLE_TOAST })
  }, [dispatch])

  const handleAcceptUpgrade = useCallback(() => {
    dispatch({ type: ACCEPT_TABLE_UPGRADE })
  }, [dispatch])

  const handleDeclineUpgrade = useCallback(() => {
    dispatch({ type: DECLINE_TABLE_UPGRADE })
  }, [dispatch])

  const handleRemoveAsset = useCallback((assetId) => dispatch(removeAsset(assetId)), [dispatch])
  const handleToggleAssetMenu = useCallback(() => dispatch({ type: TOGGLE_ASSET_MENU }), [dispatch])
  const handleTakeLoan = useCallback(() => dispatch(takeLoan()), [dispatch])
  const handleDismissLoanShark = useCallback(() => dispatch({ type: DISMISS_LOAN_SHARK }), [dispatch])
  const handleDismissComp = useCallback(() => dispatch({ type: DISMISS_COMP }), [dispatch])
  const handleDonAccept = useCallback((won) => dispatch(acceptDoubleOrNothing(won)), [dispatch])
  const handleDonDecline = useCallback(() => dispatch(declineDoubleOrNothing()), [dispatch])
  const handleToggleAchievements = useCallback(() => dispatch({ type: TOGGLE_ACHIEVEMENTS }), [dispatch])
  const handleToggleDebtTracker = useCallback(() => dispatch({ type: TOGGLE_DEBT_TRACKER }), [dispatch])
  const handleToggleHandHistory = useCallback(() => dispatch({ type: TOGGLE_HAND_HISTORY }), [dispatch])
  const handleDismissAchievement = useCallback(() => dispatch({ type: DISMISS_ACHIEVEMENT }), [dispatch])
  const handleToggleMute = useCallback(() => dispatch({ type: TOGGLE_MUTE }), [dispatch])
  const handleToggleNotifications = useCallback(() => dispatch({ type: TOGGLE_NOTIFICATIONS }), [dispatch])
  const handleToggleSettings = useCallback(() => dispatch({ type: TOGGLE_SETTINGS }), [dispatch])
  const handleToggleAchievementsEnabled = useCallback(() => dispatch({ type: TOGGLE_ACHIEVEMENTS_ENABLED }), [dispatch])
  const handleToggleDdFaceDown = useCallback(() => dispatch({ type: TOGGLE_DD_FACE_DOWN }), [dispatch])
  const handlePlaceSideBet = useCallback(
    (betType) => dispatch(placeSideBet(betType, stateRef.current.selectedChipValue)),
    [dispatch, stateRef]
  )
  const handleRemoveSideBetChip = useCallback(
    (betType) => dispatch(removeSideBetChip(betType, stateRef.current.selectedChipValue)),
    [dispatch, stateRef]
  )
  const handleClearSideBet = useCallback(
    (betType) => dispatch(clearSideBet(betType)),
    [dispatch]
  )
  const handleToggleSideBets = useCallback(() => dispatch({ type: TOGGLE_SIDE_BETS }), [dispatch])

  return {
    handleDismissTableToast,
    handleAcceptUpgrade,
    handleDeclineUpgrade,
    handleRemoveAsset,
    handleToggleAssetMenu,
    handleTakeLoan,
    handleDismissLoanShark,
    handleDismissComp,
    handleDonAccept,
    handleDonDecline,
    handleToggleAchievements,
    handleToggleDebtTracker,
    handleToggleHandHistory,
    handleDismissAchievement,
    handleToggleMute,
    handleToggleNotifications,
    handleToggleSettings,
    handleToggleAchievementsEnabled,
    handleToggleDdFaceDown,
    handlePlaceSideBet,
    handleRemoveSideBetChip,
    handleClearSideBet,
    handleToggleSideBets,
  }
}
