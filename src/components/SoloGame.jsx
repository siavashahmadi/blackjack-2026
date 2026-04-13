import { useReducer, useRef, useMemo, useEffect } from 'react'
import { gameReducer } from '../reducer/gameReducer'
import { createInitialState } from '../reducer/initialState'
import { createDeck, shuffle, cardValue } from '../utils/cardUtils'
import { sumChipStack } from '../utils/chipUtils'
import { TABLE_LEVELS } from '../constants/tableLevels'
import { getDealerForLevel } from '../constants/dealers'
import {
  addChip, selectChip, betAsset,
  UNDO_CHIP,
} from '../reducer/actions'
import { useDealerTurn } from '../hooks/useDealerTurn'
import { useDealerMessage } from '../hooks/useDealerMessage'
import { useLoanShark } from '../hooks/useLoanShark'
import { useCasinoComps } from '../hooks/useCasinoComps'
import { useAchievements } from '../hooks/useAchievements'
import { useSound } from '../hooks/useSound'
import { useSessionPersistence } from '../hooks/useSessionPersistence'
import { useChipInteraction } from '../hooks/useChipInteraction'
import { useAssetConfirmation } from '../hooks/useAssetConfirmation'
import { useDoubleOrNothing } from '../hooks/useDoubleOrNothing'
import { useBettingActions } from '../hooks/useBettingActions'
import { useGameActions } from '../hooks/useGameActions'
import { useUIActions } from '../hooks/useUIActions'
import Header from './Header'
import BankrollDisplay from './BankrollDisplay'
import DealerArea from './DealerArea'
import PlayerArea from './PlayerArea'
import BettingCircle from './BettingCircle'
import BettingControls from './BettingControls'
import ActionButtons from './ActionButtons'
import ResultBanner from './ResultBanner'
import LoanSharkPopup from './LoanSharkPopup'
import CompToast from './CompToast'
import AchievementToast from './AchievementToast'
import AchievementPanel from './AchievementPanel'
import StatsPanel from './StatsPanel'
import HandHistory from './HandHistory'
import TableLevelToast from './TableLevelToast'
import TableUpgradeModal from './TableUpgradeModal'
import DoubleOrNothingModal from './DoubleOrNothingModal'
import SideBetPanel from './SideBetPanel'
import SideBetResults from './SideBetResults'
import SettingsPanel from './SettingsPanel'
import FlyingChip from './FlyingChip'
import styles from './SoloGame.module.css'

const soloChipActions = {
  shouldBlock: (s, chipValue) => {
    if (s.phase !== 'betting') return true
    if (s.bankroll < TABLE_LEVELS[s.tableLevel].minBet && !s.inDebtMode) return true
    if (!s.inDebtMode && chipValue && sumChipStack(s.chipStack) + chipValue > s.bankroll) return true
    return false
  },
  shouldBlockUndo: () => false,
  selectChip: (dispatch, value) => dispatch(selectChip(value)),
  addChip: (dispatch, value) => dispatch(addChip(value)),
  undo: (dispatch) => dispatch({ type: UNDO_CHIP }),
}

function SoloGame({ onBack }) {
  const [state, dispatch] = useReducer(gameReducer, null, () => ({
    ...createInitialState(),
    deck: shuffle(createDeck()),
  }))
  const stateRef = useRef(state)
  stateRef.current = state // eslint-disable-line react-hooks/refs

  // Debug: expose game state and dispatch for console testing (dev only)
  useEffect(() => {
    if (import.meta.env.DEV) window.$game = { state, dispatch }
  })

  const circleRef = useRef(null)
  const trayRef = useRef(null)
  const { flyingChips, handleChipTap, handleUndo, removeFlyingChip } = useChipInteraction(
    dispatch, soloChipActions, stateRef, circleRef, trayRef
  )

  // Dealer turn automation
  useDealerTurn(state, dispatch)
  useDealerMessage(state, dispatch)
  useLoanShark(state, dispatch)
  useCasinoComps(state, dispatch)
  useAchievements(state, dispatch)
  useSound(state)
  useSessionPersistence(state, dispatch)
  useDoubleOrNothing(state, dispatch)

  // Set felt color via data-table attribute on <html>
  useEffect(() => {
    const tableId = TABLE_LEVELS[state.tableLevel].id
    document.documentElement.dataset.table = tableId
    return () => delete document.documentElement.dataset.table
  }, [state.tableLevel])

  const { handleClear, handleAllIn, handleDeal } = useBettingActions(dispatch, stateRef)
  const {
    pendingLoanAction,
    handleHit, handleStand, handleDoubleDown, handleSplit,
    handleConfirmLoan, handleCancelLoan,
    handleNewRound, handleReset, handleBack,
  } = useGameActions(dispatch, stateRef, onBack)
  const {
    handleDismissTableToast, handleAcceptUpgrade, handleDeclineUpgrade,
    handleRemoveAsset, handleToggleAssetMenu, handleTakeLoan,
    handleDismissLoanShark, handleDismissComp,
    handleDonAccept, handleDonDecline,
    handleToggleAchievements, handleToggleDebtTracker, handleToggleHandHistory,
    handleDismissAchievement, handleToggleMute, handleToggleNotifications,
    handleToggleSettings, handleToggleAchievementsEnabled, handleToggleDdFaceDown,
    handlePlaceSideBet, handleRemoveSideBetChip, handleClearSideBet, handleToggleSideBets,
  } = useUIActions(dispatch, stateRef)

  const { pendingAssetConfirm, handleBetAsset, handleConfirmAsset, handleCancelAsset } =
    useAssetConfirmation(dispatch, betAsset)

  // --- Derived state ---
  const currentBetTotal = useMemo(() =>
    sumChipStack(state.chipStack),
    [state.chipStack]
  )

  const currentActiveHand = state.playerHands[state.activeHandIndex]

  const canDoubleDown = useMemo(() => {
    if (state.phase !== 'playing' || !currentActiveHand) return false
    if (currentActiveHand.isSplitAces) return false
    return currentActiveHand.cards.length === 2 && !currentActiveHand.isDoubledDown
  }, [state.phase, currentActiveHand])

  const canSplit = useMemo(() => {
    if (state.phase !== 'playing' || !currentActiveHand) return false
    if (currentActiveHand.cards.length !== 2) return false
    if (currentActiveHand.isSplitAces) return false
    if (state.playerHands.length >= 4) return false
    return cardValue(currentActiveHand.cards[0]) === cardValue(currentActiveHand.cards[1])
  }, [state.phase, currentActiveHand, state.playerHands.length])

  const hideHoleCard = state.phase === 'playing'

  return (
    <div className={styles.soloGame}>
      <Header
        bankroll={state.bankroll}
        tableLevel={state.tableLevel}
        onReset={handleReset}
        unlockedCount={state.unlockedAchievements.length}
        onToggleAchievements={handleToggleAchievements}
        onToggleDebtTracker={handleToggleDebtTracker}
        onToggleHandHistory={handleToggleHandHistory}
        muted={state.muted}
        onToggleMute={handleToggleMute}
        onToggleSettings={handleToggleSettings}
        onBack={handleBack}
      />
      <BankrollDisplay
        bankroll={state.bankroll}
        currentBetTotal={currentBetTotal}
        handsPlayed={state.handsPlayed}
        vigAmount={state.vigAmount}
        vigRate={state.vigRate}
      />

      <div className={styles.table}>
        <span className={styles.feltWatermark} key={TABLE_LEVELS[state.tableLevel].id}>
          {TABLE_LEVELS[state.tableLevel].subtitle}
        </span>
        <div className={styles.dealerRow}>
          <DealerArea
            hand={state.dealerHand}
            phase={state.phase}
            hideHoleCard={hideHoleCard}
            dealerMessage={state.dealerMessage}
            deckLength={state.deck.length}
            dealer={getDealerForLevel(state.tableLevel)}
          />
        </div>
        <BettingCircle
          ref={circleRef}
          chipStack={state.chipStack}
          bettedAssets={state.bettedAssets}
          result={state.result}
          onUndo={handleUndo}
          onRemoveAsset={handleRemoveAsset}
          playerHands={state.playerHands}
        />
        <div className={styles.playerRow}>
          <PlayerArea
            playerHands={state.playerHands}
            activeHandIndex={state.activeHandIndex}
            phase={state.phase}
            bettedAssets={state.bettedAssets}
            ddCardFaceDown={state.ddCardFaceDown}
          />
        </div>
        {state.sideBetResults.length > 0 && (
          <div className={styles.sideBetResultsOverlay}>
            <SideBetResults results={state.sideBetResults} />
          </div>
        )}
        {state.phase === 'result' && state.result && (
          <ResultBanner
            result={state.result}
            playerHands={state.playerHands}
            displayOnly
          />
        )}
      </div>

      <div className={styles.controlsArea}>
        <div className={styles.phaseContent}>
          {state.phase === 'betting' && (
            <>
              <BettingControls
                bankroll={state.bankroll}
                selectedChipValue={state.selectedChipValue}
                chipStack={state.chipStack}
                ownedAssets={state.ownedAssets}
                bettedAssets={state.bettedAssets}
                showAssetMenu={state.showAssetMenu}
                inDebtMode={state.inDebtMode}
                tableLevel={state.tableLevel}
                trayRef={trayRef}
                onChipTap={handleChipTap}
                onUndo={handleUndo}
                onClear={handleClear}
                onAllIn={handleAllIn}
                onDeal={handleDeal}
                onBetAsset={handleBetAsset}
                onToggleAssetMenu={handleToggleAssetMenu}
                onTakeLoan={handleTakeLoan}
                onToggleSideBets={handleToggleSideBets}
                showSideBets={state.showSideBets}
                activeSideBetCount={state.activeSideBets.length}
              />
              {state.showSideBets && (
                <SideBetPanel
                  activeSideBets={state.activeSideBets}
                  onPlace={handlePlaceSideBet}
                  onRemoveChip={handleRemoveSideBetChip}
                  onClear={handleClearSideBet}
                  selectedChipValue={state.selectedChipValue}
                  bankroll={state.bankroll}
                  inDebtMode={state.inDebtMode}
                />
              )}
            </>
          )}
          {state.phase === 'playing' && (
            <ActionButtons
              onHit={handleHit}
              onStand={handleStand}
              onDoubleDown={handleDoubleDown}
              canDoubleDown={canDoubleDown}
              onSplit={handleSplit}
              canSplit={canSplit}
            />
          )}
          {state.phase === 'dealerTurn' && (
            <div className={styles.waitingMessage}>Dealer&apos;s turn...</div>
          )}
          {state.phase === 'result' && state.chipStack.length === 0 && !state.doubleOrNothing && (
            <ResultBanner
              result={state.result}
              bankroll={state.bankroll}
              playerHands={state.playerHands}
              onNextHand={handleNewRound}
            />
          )}
        </div>
      </div>

      {/* Flying chip animations */}
      {flyingChips.map(chip => (
        <FlyingChip
          key={chip.id}
          value={chip.value}
          from={chip.from}
          to={chip.to}
          reverse={chip.reverse}
          onDone={() => removeFlyingChip(chip.id)}
        />
      ))}

      {/* Asset confirmation modal */}
      {pendingAssetConfirm && (
        <div className={styles.confirmOverlay} onClick={handleCancelAsset}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <span className={styles.confirmEmoji}>{pendingAssetConfirm.emoji}</span>
            <span className={styles.confirmName}>{pendingAssetConfirm.name}</span>
            <span className={styles.confirmValue}>
              ${pendingAssetConfirm.value.toLocaleString()}
            </span>
            <div className={styles.confirmButtons}>
              <button className={styles.confirmBet} onClick={handleConfirmAsset}>
                BET IT
              </button>
              <button className={styles.confirmCancel} onClick={handleCancelAsset}>
                NEVERMIND
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loan confirmation modal for split/double when broke */}
      {pendingLoanAction && (
        <div className={styles.confirmOverlay} onClick={handleCancelLoan}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <span className={styles.confirmEmoji}>&#x1F911;</span>
            <span className={styles.confirmName}>Taking Out a Loan</span>
            <span className={styles.loanSubtext}>
              The house charges interest on every borrowed dollar.
            </span>
            <div className={styles.confirmButtons}>
              <button className={styles.confirmBet} onClick={handleConfirmLoan}>
                DO IT
              </button>
              <button className={styles.confirmCancel} onClick={handleCancelLoan}>
                NEVERMIND
              </button>
            </div>
          </div>
        </div>
      )}

      {state.notificationsEnabled && (
        <LoanSharkPopup
          message={state.loanSharkQueue[0] || null}
          onDismiss={handleDismissLoanShark}
        />
      )}

      {state.notificationsEnabled && state.compQueue.length > 0 && (
        <CompToast
          comp={state.compQueue[0]}
          onDismiss={handleDismissComp}
        />
      )}

      {state.notificationsEnabled && state.tableLevelChanged && (
        <TableLevelToast
          levelChange={state.tableLevelChanged}
          onDismiss={handleDismissTableToast}
        />
      )}

      {state.pendingTableUpgrade && (
        <TableUpgradeModal
          pendingUpgrade={state.pendingTableUpgrade}
          onAccept={handleAcceptUpgrade}
          onDecline={handleDeclineUpgrade}
        />
      )}

      {state.doubleOrNothing && (
        <DoubleOrNothingModal
          doubleOrNothing={state.doubleOrNothing}
          onAccept={handleDonAccept}
          onDecline={handleDonDecline}
        />
      )}

      {state.notificationsEnabled && state.achievementsEnabled && state.achievementQueue.length > 0 && (
        <AchievementToast
          key={state.achievementQueue[0]}
          achievementId={state.achievementQueue[0]}
          onDismiss={handleDismissAchievement}
        />
      )}

      {state.showAchievements && (
        <AchievementPanel
          unlockedAchievements={state.unlockedAchievements}
          onClose={handleToggleAchievements}
        />
      )}

      {state.showDebtTracker && (
        <StatsPanel state={state} onClose={handleToggleDebtTracker} />
      )}

      {state.showHandHistory && (
        <HandHistory handHistory={state.handHistory} onClose={handleToggleHandHistory} />
      )}

      {state.showSettings && (
        <SettingsPanel
          muted={state.muted}
          notificationsEnabled={state.notificationsEnabled}
          achievementsEnabled={state.achievementsEnabled}
          ddCardFaceDown={state.ddCardFaceDown}
          onToggleMute={handleToggleMute}
          onToggleNotifications={handleToggleNotifications}
          onToggleAchievementsEnabled={handleToggleAchievementsEnabled}
          onToggleDdFaceDown={handleToggleDdFaceDown}
          onClose={handleToggleSettings}
        />
      )}
    </div>
  )
}

export default SoloGame
