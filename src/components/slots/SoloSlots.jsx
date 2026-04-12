import { useReducer, useRef, useCallback, useMemo, useEffect } from 'react'
import { slotsReducer } from '../../reducer/slotsReducer'
import { createSlotsInitialState } from '../../reducer/slotsInitialState'
import { generateSpin } from '../../utils/slotUtils'
import { sumChipStack } from '../../utils/chipUtils'
import { formatMoney } from '../../utils/formatters'
import audioManager from '../../utils/audioManager'
import {
  slotsSelectChip, slotsAddChip, slotsReelStop, slotsResolve, slotsReset,
  SLOTS_UNDO_CHIP, SLOTS_CLEAR_CHIPS, SLOTS_ALL_IN, SLOTS_NEW_ROUND,
  SLOTS_TOGGLE_MUTE, slotsSpin,
} from '../../reducer/slotsActions'
import { useChipInteraction } from '../../hooks/useChipInteraction'
import { useSlotsSound } from '../../hooks/useSlotsSound'
import Header from '../Header'
import BankrollDisplay from '../BankrollDisplay'
import FlyingChip from '../FlyingChip'
import SlotMachine from './SlotMachine'
import SlotsBettingControls from './SlotsBettingControls'
import SlotsResultBanner from './SlotsResultBanner'
import styles from './SoloSlots.module.css'

const slotsChipActions = {
  shouldBlock: (s, chipValue) => {
    if (s.phase !== 'betting') return true
    if (s.bankroll <= 0) return true
    if (chipValue && sumChipStack(s.chipStack) + chipValue > s.bankroll) return true
    return false
  },
  shouldBlockUndo: () => false,
  selectChip: (dispatch, value) => dispatch(slotsSelectChip(value)),
  addChip: (dispatch, value) => dispatch(slotsAddChip(value)),
  undo: (dispatch) => dispatch({ type: SLOTS_UNDO_CHIP }),
}

function SoloSlots({ onBack }) {
  const [state, dispatch] = useReducer(slotsReducer, null, createSlotsInitialState)
  const stateRef = useRef(state)
  stateRef.current = state // eslint-disable-line react-hooks/refs

  const circleRef = useRef(null)
  const trayRef = useRef(null)
  const { flyingChips, handleChipTap, handleUndo, removeFlyingChip } = useChipInteraction(
    dispatch, slotsChipActions, stateRef, circleRef, trayRef
  )

  useSlotsSound(state)

  // Auto-resolve when all reels have stopped
  useEffect(() => {
    if (state.phase === 'spinning' && state.reelStops.every(Boolean)) {
      dispatch(slotsResolve())
    }
  }, [state.phase, state.reelStops])

  const handleSpin = useCallback(() => {
    const reels = generateSpin(Math.random(), Math.random(), Math.random())
    dispatch(slotsSpin(reels))
  }, [])

  const handleClear = useCallback(() => dispatch({ type: SLOTS_CLEAR_CHIPS }), [])

  const handleAllIn = useCallback(() => {
    audioManager.play('all_in')
    dispatch({ type: SLOTS_ALL_IN })
  }, [])

  const handleNewRound = useCallback(() => dispatch({ type: SLOTS_NEW_ROUND }), [])

  const handleReset = useCallback(() => dispatch(slotsReset()), [])

  const handleToggleMute = useCallback(() => dispatch({ type: SLOTS_TOGGLE_MUTE }), [])

  const handleBack = useCallback(() => {
    if (stateRef.current.spinsPlayed > 0) {
      if (!window.confirm('Return to menu? Current progress will be lost.')) return
    }
    onBack()
  }, [onBack])

  const handleResetConfirm = useCallback(() => {
    if (stateRef.current.spinsPlayed > 0) {
      if (!window.confirm('Start a new game? Current progress will be lost.')) return
    }
    dispatch(slotsReset())
  }, [])

  const handleReelStop = useCallback((index) => {
    dispatch(slotsReelStop(index))
  }, [])

  // Derived state
  const currentBetTotal = useMemo(() => sumChipStack(state.chipStack), [state.chipStack])
  const isSpinning = state.phase === 'spinning'
  const showMatchLabel = state.phase === 'result' ? state.matchType : null

  return (
    <div className={styles.soloSlots}>
      <Header
        bankroll={state.bankroll}
        onReset={handleResetConfirm}
        muted={state.muted}
        onToggleMute={handleToggleMute}
        onBack={handleBack}
      />
      <BankrollDisplay
        bankroll={state.bankroll}
        currentBetTotal={currentBetTotal}
        handsPlayed={state.spinsPlayed}
      />

      <div className={styles.table}>
        <SlotMachine
          reels={state.reels}
          spinning={isSpinning}
          matchType={showMatchLabel}
          onReelStop={handleReelStop}
        />
        {currentBetTotal > 0 && state.phase === 'betting' && (
          <div className={styles.betDisplay}>{formatMoney(currentBetTotal)}</div>
        )}
      </div>

      <div className={styles.controlsArea} ref={circleRef}>
        <div className={styles.phaseContent}>
          {state.phase === 'betting' && (
            <SlotsBettingControls
              bankroll={state.bankroll}
              selectedChipValue={state.selectedChipValue}
              chipStack={state.chipStack}
              trayRef={trayRef}
              onChipTap={handleChipTap}
              onUndo={handleUndo}
              onClear={handleClear}
              onAllIn={handleAllIn}
              onSpin={handleSpin}
            />
          )}
          {state.phase === 'spinning' && (
            <div className={styles.betDisplay}>{formatMoney(currentBetTotal)}</div>
          )}
          {state.phase === 'result' && (
            <SlotsResultBanner
              matchType={state.matchType}
              score={state.score}
              payout={state.payout}
              chipStack={state.chipStack}
              bankroll={state.bankroll}
              onNextRound={handleNewRound}
              onReset={handleReset}
            />
          )}
        </div>
      </div>

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
    </div>
  )
}

export default SoloSlots
