# Solo Slots UI (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Solo Slots UI — animated slot machine with 3 reels, betting controls, result display, and the main SoloSlots game container — wired to the existing slots reducer from Phase 1/2.

**Architecture:** Five new components in `src/components/slots/` plus one new sound hook in `src/hooks/`. SlotReel handles individual reel animation via CSS translateY + keyframes. SlotMachine composes 3 reels. SlotsBettingControls and SlotsResultBanner handle the betting/result phases. SoloSlots is the top-level container (mirrors `SoloGame.jsx` patterns: useReducer + useChipInteraction + sound hook). Navigation changes in App.jsx and ModeSelect.jsx wire it all together.

**Tech Stack:** React 19, CSS Modules, CSS keyframe animations, existing useChipInteraction hook, existing ChipTray/Chip/FlyingChip/Header/BankrollDisplay components, Web Audio API via audioManager singleton.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/components/slots/SlotReel.jsx` | Single animated reel column — renders symbol strip, handles spin/land/stop animation states |
| `src/components/slots/SlotReel.module.css` | Reel animation keyframes, symbol sizing, payline overlay |
| `src/components/slots/SlotMachine.jsx` | Composes 3 SlotReel instances side-by-side in a gold frame |
| `src/components/slots/SlotMachine.module.css` | Frame styling, match label overlay animation |
| `src/components/slots/SlotsBettingControls.jsx` | ChipTray + UNDO/CLEAR/ALL IN + SPIN button |
| `src/components/slots/SlotsBettingControls.module.css` | Button styles matching blackjack patterns |
| `src/components/slots/SlotsResultBanner.jsx` | Win/loss display after spin, SPIN AGAIN / NEW GAME button |
| `src/components/slots/SlotsResultBanner.module.css` | Result text colors, payout display |
| `src/components/slots/SoloSlots.jsx` | Main game container — reducer + hooks + layout |
| `src/components/slots/SoloSlots.module.css` | Page layout matching SoloGame patterns |
| `src/hooks/useSlotsSound.js` | Sound triggers for reel stops, win/pair/jackpot results |

### Modified Files

| File | Change |
|------|--------|
| `src/App.jsx` | Add `solo-slots` and `multiplayer-slots` mode branches |
| `src/components/ModeSelect.jsx` | Two-step flow: game picker → mode picker with back button |
| `src/components/ModeSelect.module.css` | Back button style, disabled state |
| `src/utils/audioManager.js` | Add `slot_stop`, `slot_win`, `slot_jackpot`, `slot_pair` sound synthesizers |

---

## Task 1: SlotReel Component

The core animation component. Renders a vertical strip of all 7 symbols repeated 6 times. Shows a 3-row viewport (above, center, below). Animates through states: `idle → spinning → landing → stopped`.

**Files:**
- Create: `src/components/slots/SlotReel.jsx`
- Create: `src/components/slots/SlotReel.module.css`

- [ ] **Step 1: Create SlotReel.module.css**

This defines the reel viewport, symbol strip, animation keyframes, and payline overlay.

```css
.reel {
  width: 72px;
  height: calc(var(--symbol-height) * 3);
  overflow: hidden;
  position: relative;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
}

.strip {
  display: flex;
  flex-direction: column;
  will-change: transform;
}

.strip.spinning {
  animation: reelSpin 0.08s linear infinite;
}

.strip.landing {
  transition: transform 0.6s cubic-bezier(0.2, 1.3, 0.5, 1);
}

@keyframes reelSpin {
  from { transform: translateY(0); }
  to { transform: translateY(calc(-7 * var(--symbol-height))); }
}

.symbol {
  height: var(--symbol-height);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  flex-shrink: 0;
  user-select: none;
}

.payline {
  position: absolute;
  top: var(--symbol-height);
  left: 0;
  right: 0;
  height: var(--symbol-height);
  border-top: 2px solid var(--gold-dim);
  border-bottom: 2px solid var(--gold-dim);
  background: rgba(240, 200, 80, 0.06);
  pointer-events: none;
  z-index: 1;
}

:root {
  --symbol-height: 72px;
}

@media (max-height: 667px) {
  :root {
    --symbol-height: 60px;
  }
}
```

- [ ] **Step 2: Create SlotReel.jsx**

The component manages its own animation state. It receives `targetSymbol` (the symbol to land on), `spinning` (whether the parent wants the reel to spin), and `delay` (stagger delay in ms). When `spinning` goes from false→true, it starts the spin animation. After `800ms + delay`, it transitions to landing state. When the CSS transition ends, it fires `onStop`.

Key detail: The symbol strip is built by repeating all 7 symbols 6 times. The final translateY position targets the 4th repetition of the target symbol.

```jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { SLOT_SYMBOLS } from '../../constants/slotSymbols'
import styles from './SlotReel.module.css'

const SYMBOL_COUNT = SLOT_SYMBOLS.length
const REPETITIONS = 6

function buildStrip() {
  const strip = []
  for (let r = 0; r < REPETITIONS; r++) {
    for (const sym of SLOT_SYMBOLS) {
      strip.push(sym)
    }
  }
  return strip
}

const STRIP = buildStrip()

function SlotReel({ targetSymbol, spinning, delay = 0, onStop }) {
  // 'idle' | 'spinning' | 'landing' | 'stopped'
  const [animState, setAnimState] = useState('idle')
  const stripRef = useRef(null)
  const timerRef = useRef(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (spinning && animState === 'idle') {
      setAnimState('spinning')

      timerRef.current = setTimeout(() => {
        setAnimState('landing')
      }, 800 + delay)
    }

    if (!spinning && animState === 'stopped') {
      setAnimState('idle')
    }

    return () => clearTimeout(timerRef.current)
  }, [spinning, animState, delay])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleTransitionEnd = useCallback(() => {
    if (animState === 'landing') {
      setAnimState('stopped')
      onStop?.()
    }
  }, [animState, onStop])

  // Calculate final position: land on the 4th repetition of the target symbol
  const targetIndex = targetSymbol ? targetSymbol.index : 0
  const targetPos = 4 * SYMBOL_COUNT + targetIndex
  const finalY = -(targetPos - 1) // offset by 1 for center row

  const stripStyle = {}
  const stripClass = [styles.strip]

  if (animState === 'spinning') {
    stripClass.push(styles.spinning)
  } else if (animState === 'landing') {
    stripClass.push(styles.landing)
    stripStyle.transform = `translateY(calc(${finalY} * var(--symbol-height)))`
  } else if (animState === 'stopped') {
    stripStyle.transform = `translateY(calc(${finalY} * var(--symbol-height)))`
  }

  return (
    <div className={styles.reel}>
      <div
        ref={stripRef}
        className={stripClass.join(' ')}
        style={stripStyle}
        onTransitionEnd={handleTransitionEnd}
      >
        {STRIP.map((sym, i) => (
          <div key={i} className={styles.symbol}>
            {sym.emoji}
          </div>
        ))}
      </div>
      <div className={styles.payline} />
    </div>
  )
}

export default SlotReel
```

- [ ] **Step 3: Verify reel renders**

You can't run an isolated test for this visual component, but verify the file parses correctly and the module builds:

Run: `cd /Users/sia/Desktop/blackjack && npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds (no import errors)

- [ ] **Step 4: Commit**

```bash
git add src/components/slots/SlotReel.jsx src/components/slots/SlotReel.module.css
git commit -m "feat: add SlotReel animated reel column component"
```

---

## Task 2: SlotMachine Component

Composes 3 SlotReel instances side-by-side. Gold frame via box-shadow and border. Shows a match label overlay ("TRIPLE!" or "PAIR") after all reels stop.

**Files:**
- Create: `src/components/slots/SlotMachine.jsx`
- Create: `src/components/slots/SlotMachine.module.css`

- [ ] **Step 1: Create SlotMachine.module.css**

```css
.machine {
  display: flex;
  gap: 8px;
  padding: 16px;
  border-radius: 16px;
  border: 2px solid var(--gold-dim);
  background: rgba(0, 0, 0, 0.35);
  box-shadow:
    0 0 20px rgba(240, 200, 80, 0.1),
    inset 0 0 30px rgba(0, 0, 0, 0.3);
  position: relative;
}

.matchLabel {
  position: absolute;
  top: -16px;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 3px;
  padding: 4px 16px;
  border-radius: 8px;
  white-space: nowrap;
  animation: matchPop 0.4s ease-out;
  z-index: 2;
}

.triple {
  color: var(--felt-dark);
  background: linear-gradient(135deg, var(--gold), var(--gold-dim));
  box-shadow: 0 2px 12px var(--gold-glow);
}

.pair {
  color: #fff;
  background: linear-gradient(135deg, var(--purple), var(--purple-dark));
  box-shadow: 0 2px 12px rgba(155, 89, 182, 0.4);
}

@keyframes matchPop {
  0% {
    transform: translateX(-50%) scale(0.5);
    opacity: 0;
  }
  60% {
    transform: translateX(-50%) scale(1.15);
  }
  100% {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }
}
```

- [ ] **Step 2: Create SlotMachine.jsx**

```jsx
import { memo } from 'react'
import SlotReel from './SlotReel'
import styles from './SlotMachine.module.css'

const STAGGER = [0, 300, 600]

function SlotMachine({ reels, spinning, matchType, onReelStop }) {
  return (
    <div className={styles.machine}>
      {[0, 1, 2].map((i) => (
        <SlotReel
          key={i}
          targetSymbol={reels[i]}
          spinning={spinning}
          delay={STAGGER[i]}
          onStop={() => onReelStop(i)}
        />
      ))}
      {matchType && matchType !== 'none' && (
        <div className={`${styles.matchLabel} ${styles[matchType]}`}>
          {matchType === 'triple' ? 'TRIPLE!' : 'PAIR'}
        </div>
      )}
    </div>
  )
}

export default memo(SlotMachine)
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/sia/Desktop/blackjack && npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/slots/SlotMachine.jsx src/components/slots/SlotMachine.module.css
git commit -m "feat: add SlotMachine 3-reel assembly with match label"
```

---

## Task 3: SlotsBettingControls Component

Simplified betting controls for slots — no assets, no side bets, no loan shark. Just ChipTray + UNDO/CLEAR + ALL IN + SPIN button.

**Files:**
- Create: `src/components/slots/SlotsBettingControls.jsx`
- Create: `src/components/slots/SlotsBettingControls.module.css`

- [ ] **Step 1: Create SlotsBettingControls.module.css**

The SPIN button uses a gold gradient style similar to the DEAL button in `BettingControls.module.css`. The control row reuses the same small button pattern.

```css
.controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 16px;
}

.chipTrayWrapper {
  position: relative;
}

.controlRow {
  display: flex;
  gap: 8px;
  justify-content: center;
  align-items: center;
}

.smallButton {
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--text-dim);
  background: rgba(255, 255, 255, 0.06);
  padding: 6px 14px;
  border-radius: 6px;
  transition: opacity 0.15s ease;
  min-height: 44px;
  touch-action: manipulation;
}

.smallButton:disabled {
  opacity: 0.3;
  cursor: default;
}

.smallButton:active:not(:disabled) {
  transform: scale(0.95);
}

.allInButton {
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #fff;
  background: linear-gradient(135deg, var(--danger), var(--danger-dark));
  padding: 6px 14px;
  border-radius: 6px;
  margin-left: auto;
  min-height: 44px;
  touch-action: manipulation;
}

.allInButton:active {
  transform: scale(0.95);
}

.cooldown {
  opacity: 0.4;
  cursor: default;
}

.cooldown:active {
  transform: none;
}

.spinButton {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 20px;
  font-weight: 900;
  color: var(--felt-dark);
  background: linear-gradient(135deg, var(--gold), var(--gold-dim));
  padding: 0 24px;
  min-height: 52px;
  border-radius: 12px;
  letter-spacing: 3px;
  box-shadow: 0 2px 12px var(--gold-glow);
  transition: transform 0.1s ease, opacity 0.15s ease;
  touch-action: manipulation;
}

.spinButton:active {
  transform: scale(0.97);
}

.disabled {
  opacity: 0.4;
  cursor: default;
  box-shadow: none;
}

.disabled:active {
  transform: none;
}
```

- [ ] **Step 2: Create SlotsBettingControls.jsx**

Reuses `ChipTray` from blackjack. No debt mode, no assets, no loan shark.

```jsx
import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { sumChipStack } from '../../utils/chipUtils'
import ChipTray from '../ChipTray'
import styles from './SlotsBettingControls.module.css'

function SlotsBettingControls({
  bankroll,
  selectedChipValue,
  chipStack,
  trayRef,
  onChipTap,
  onUndo,
  onClear,
  onAllIn,
  onSpin,
}) {
  const [allInCooldown, setAllInCooldown] = useState(false)
  const cooldownRef = useRef(null)

  useEffect(() => {
    return () => clearTimeout(cooldownRef.current)
  }, [])

  const handleAllIn = useCallback(() => {
    if (allInCooldown) return
    onAllIn()
    setAllInCooldown(true)
    clearTimeout(cooldownRef.current)
    cooldownRef.current = setTimeout(() => setAllInCooldown(false), 3000)
  }, [allInCooldown, onAllIn])

  const chipTotal = sumChipStack(chipStack)
  const canSpin = chipTotal > 0
  const isBlocked = bankroll <= 0

  return (
    <div className={styles.controls}>
      <div className={styles.chipTrayWrapper} ref={trayRef}>
        <ChipTray
          bankroll={bankroll}
          selectedChipValue={selectedChipValue}
          onChipTap={onChipTap}
          disabled={isBlocked}
          tableLevel={0}
        />
      </div>
      <div className={styles.controlRow}>
        <button
          className={styles.smallButton}
          onClick={onUndo}
          disabled={chipStack.length === 0}
        >
          UNDO
        </button>
        <button
          className={styles.smallButton}
          onClick={onClear}
          disabled={chipStack.length === 0}
        >
          CLEAR
        </button>
        <button
          className={`${styles.allInButton} ${allInCooldown || isBlocked ? styles.cooldown : ''}`}
          onClick={handleAllIn}
          disabled={allInCooldown || isBlocked}
        >
          ALL IN
        </button>
      </div>
      <button
        className={`${styles.spinButton} ${!canSpin ? styles.disabled : ''}`}
        onClick={onSpin}
        disabled={!canSpin}
      >
        SPIN
      </button>
    </div>
  )
}

export default memo(SlotsBettingControls)
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/sia/Desktop/blackjack && npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/slots/SlotsBettingControls.jsx src/components/slots/SlotsBettingControls.module.css
git commit -m "feat: add SlotsBettingControls with chip tray and spin button"
```

---

## Task 4: SlotsResultBanner Component

Shows after spin resolves: match type label, net payout (+$X or -$X), score detail. "SPIN AGAIN" button (or "NEW GAME" if bankroll <= 0).

**Files:**
- Create: `src/components/slots/SlotsResultBanner.jsx`
- Create: `src/components/slots/SlotsResultBanner.module.css`

- [ ] **Step 1: Create SlotsResultBanner.module.css**

```css
.banner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
}

.matchText {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 2px;
}

.tripleText {
  color: var(--gold);
  text-shadow: 0 0 12px var(--gold-glow);
}

.pairText {
  color: var(--purple);
}

.noneText {
  color: var(--text-dim);
}

.payout {
  font-family: 'Outfit', sans-serif;
  font-size: 24px;
  font-weight: 700;
}

.payoutWin {
  color: var(--success);
}

.payoutLoss {
  color: var(--danger);
}

.payoutEven {
  color: var(--text-dim);
}

.scoreDetail {
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  color: var(--text-dim);
  letter-spacing: 0.5px;
}

.nextButton {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 16px;
  font-weight: 900;
  color: var(--felt-dark);
  background: linear-gradient(135deg, var(--gold), var(--gold-dim));
  padding: 12px 32px;
  border-radius: 10px;
  letter-spacing: 2px;
  box-shadow: 0 2px 12px var(--gold-glow);
  margin-top: 4px;
  touch-action: manipulation;
  transition: transform 0.1s ease;
}

.nextButton:active {
  transform: scale(0.97);
}
```

- [ ] **Step 2: Create SlotsResultBanner.jsx**

```jsx
import { memo } from 'react'
import { formatMoney } from '../../utils/formatters'
import { sumChipStack } from '../../utils/chipUtils'
import styles from './SlotsResultBanner.module.css'

const MATCH_CONFIG = {
  triple: { text: 'TRIPLE!', className: 'tripleText' },
  pair: { text: 'PAIR', className: 'pairText' },
  none: { text: 'NO MATCH', className: 'noneText' },
}

function SlotsResultBanner({ matchType, score, payout, chipStack, bankroll, onNextRound, onReset }) {
  const bet = sumChipStack(chipStack)
  const net = payout - bet
  const config = MATCH_CONFIG[matchType] || MATCH_CONFIG.none

  const payoutClass = net > 0
    ? styles.payoutWin
    : net < 0
      ? styles.payoutLoss
      : styles.payoutEven

  const isBroke = bankroll <= 0

  return (
    <div className={styles.banner}>
      <span className={`${styles.matchText} ${styles[config.className]}`}>
        {config.text}
      </span>
      <span className={`${styles.payout} ${payoutClass}`}>
        {net >= 0 ? '+' : ''}{formatMoney(Math.abs(net))}
      </span>
      <span className={styles.scoreDetail}>
        Score: {score} | Bet: {formatMoney(bet)} | Return: {formatMoney(payout)}
      </span>
      {isBroke ? (
        <button className={styles.nextButton} onClick={onReset}>
          NEW GAME
        </button>
      ) : (
        <button className={styles.nextButton} onClick={onNextRound}>
          SPIN AGAIN
        </button>
      )}
    </div>
  )
}

export default memo(SlotsResultBanner)
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/sia/Desktop/blackjack && npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/slots/SlotsResultBanner.jsx src/components/slots/SlotsResultBanner.module.css
git commit -m "feat: add SlotsResultBanner with match type and payout display"
```

---

## Task 5: Slot Sounds in audioManager + useSlotsSound Hook

Add 4 synthesized sounds to `audioManager.js` and create `useSlotsSound.js` hook.

**Files:**
- Modify: `src/utils/audioManager.js` (add sound functions to the `sounds` object)
- Create: `src/hooks/useSlotsSound.js`

- [ ] **Step 1: Identify where to add sounds in audioManager.js**

Read `src/utils/audioManager.js` to find the `sounds` object where sound functions are registered.

Run: `grep -n 'sounds\.' /Users/sia/Desktop/blackjack/src/utils/audioManager.js | head -30`

Find the pattern for how sounds are defined (they're functions on a `sounds` object).

- [ ] **Step 2: Add slot sounds to audioManager.js**

Add these 4 new sound functions inside the `sounds` object (alongside existing sounds like `chip_place`, `card_deal`, etc.):

```javascript
// Slot machine sounds
slot_stop() {
  // Mechanical thud: lowpass noise + bandpass click
  playNoise(0.08, 'lowpass', 200, 1, 0.4)
  playNoise(0.03, 'bandpass', 800, 5, 0.2)
},

slot_win() {
  // Ascending chime: C5→E5→G5
  const notes = [523.25, 659.25, 783.99]
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    const now = ctx.currentTime + i * 0.12
    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.3)
  })
},

slot_jackpot() {
  // Extended arpeggio: C5→E5→G5→C6→E6→G6
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98]
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    const now = ctx.currentTime + i * 0.1
    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.4)
  })
},

slot_pair() {
  // Two quick tones
  const notes = [587.33, 783.99]
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    const now = ctx.currentTime + i * 0.1
    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.2)
  })
},
```

The exact placement will depend on what you find in the file — add them after the last existing sound function, inside the same object.

- [ ] **Step 3: Create useSlotsSound.js**

Watches `state.phase`, `state.reelStops`, and `state.matchType` transitions. Plays sounds on reel stops and on result phase entry. Follows the same pattern as `useSound.js` (uses `usePrevious`, `useAudioInit`, `audioManager`).

```jsx
import { useEffect, useRef } from 'react'
import audioManager from '../utils/audioManager'
import { useAudioInit } from './useAudioInit'
import { usePrevious } from './usePrevious'

export function useSlotsSound(state) {
  const prevState = usePrevious(state)

  useAudioInit()

  // Sync mute state
  useEffect(() => {
    audioManager.setMuted(state.muted)
  }, [state.muted])

  // Reel stop sounds — compare previous vs current reelStops
  useEffect(() => {
    if (state.phase !== 'spinning') return
    for (let i = 0; i < 3; i++) {
      if (!prevState.reelStops[i] && state.reelStops[i]) {
        audioManager.play('slot_stop')
      }
    }
  }, [state.phase, state.reelStops, prevState.reelStops])

  // Result sounds — play on phase transition to 'result'
  useEffect(() => {
    if (prevState.phase !== 'result' && state.phase === 'result') {
      if (state.matchType === 'triple') {
        audioManager.play('slot_jackpot')
      } else if (state.matchType === 'pair') {
        audioManager.play('slot_pair')
      } else if (state.payout > 0) {
        audioManager.play('slot_win')
      }
    }
  }, [state.phase, state.matchType, state.payout, prevState.phase])
}
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/sia/Desktop/blackjack && npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/utils/audioManager.js src/hooks/useSlotsSound.js
git commit -m "feat: add slot machine sounds and useSlotsSound hook"
```

---

## Task 6: SoloSlots Main Container

The top-level game component that wires everything together — equivalent of `SoloGame.jsx` for slots. Uses `useReducer` with `slotsReducer`, `useChipInteraction` via adapter, `useSlotsSound`, and composes all slot sub-components.

**Files:**
- Create: `src/components/slots/SoloSlots.jsx`
- Create: `src/components/slots/SoloSlots.module.css`

- [ ] **Step 1: Create SoloSlots.module.css**

Follows the same layout pattern as `SoloGame.module.css`: flex column, table area in the middle, controls at the bottom.

```css
.soloSlots {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding-top: env(safe-area-inset-top, 0px);
}

.table {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 0 16px;
  min-height: 0;
}

.betDisplay {
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 700;
  color: var(--gold);
  text-align: center;
  min-height: 24px;
}

.controlsArea {
  flex: 0 0 auto;
  height: var(--controls-area-height);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  position: relative;
  z-index: 2;
  overflow-y: auto;
  overflow-x: hidden;
}

.phaseContent {
  animation: controlsFadeIn 0.15s ease-out;
}

@keyframes controlsFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **Step 2: Create SoloSlots.jsx**

```jsx
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

  // Auto-resolve when all 3 reels have stopped
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
          <div className={styles.betDisplay}>
            {formatMoney(currentBetTotal)}
          </div>
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
            <div className={styles.betDisplay}>
              {formatMoney(currentBetTotal)}
            </div>
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
```

**Note:** The `circleRef` is assigned to the controls area rather than a betting circle (slots doesn't have a betting circle). Flying chips will animate toward/from this area. This is a simplification — if the animation targets look off, adjust `circleRef` to a more specific element.

- [ ] **Step 3: Verify build**

Run: `cd /Users/sia/Desktop/blackjack && npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/slots/SoloSlots.jsx src/components/slots/SoloSlots.module.css
git commit -m "feat: add SoloSlots main game container"
```

---

## Task 7: Navigation — ModeSelect Two-Step Flow

Update ModeSelect to a two-step flow: Step 1 picks the game (Blackjack or Slots), Step 2 picks the mode (Solo or Multiplayer). Add a back button to return to Step 1.

**Files:**
- Modify: `src/components/ModeSelect.jsx`
- Modify: `src/components/ModeSelect.module.css`

- [ ] **Step 1: Update ModeSelect.module.css — add back button and disabled styles**

Add these styles to the end of the existing file:

```css
.backButton {
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-dim);
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px 16px;
  letter-spacing: 1px;
  transition: color 0.2s ease;
  touch-action: manipulation;
}

.backButton:active {
  color: var(--text-primary);
}

.disabled {
  opacity: 0.35;
  pointer-events: none;
}
```

- [ ] **Step 2: Update ModeSelect.jsx — two-step game/mode picker**

Replace the current ModeSelect with a two-step flow. Step 1 shows game buttons (Blackjack, Slots). Step 2 shows mode buttons (Solo, Multiplayer/Battle) with a back button.

The callback props change: instead of `onSelectSolo` and `onSelectMultiplayer`, the parent will pass `onSelectMode(mode)` where mode is one of `'solo-blackjack'`, `'multiplayer-blackjack'`, `'solo-slots'`, `'multiplayer-slots'`.

```jsx
import { memo, useState, useCallback } from 'react'
import styles from './ModeSelect.module.css'

function ModeSelect({ onSelectMode }) {
  const [selectedGame, setSelectedGame] = useState(null)

  const handleBack = useCallback(() => setSelectedGame(null), [])

  // Step 1: Game picker
  if (!selectedGame) {
    return (
      <div className={styles.container}>
        <div className={styles.brand}>
          <h1 className={styles.logo}>HOUSE MONEY</h1>
          <span className={styles.subtitle}>CHOOSE YOUR GAME</span>
        </div>
        <div className={styles.options}>
          <button className={styles.modeButton} onClick={() => setSelectedGame('blackjack')}>
            <span className={styles.modeIcon}>{'\u{1F0CF}'}</span>
            <span className={styles.modeTitle}>BLACKJACK</span>
            <span className={styles.modeDesc}>Beat the dealer to 21</span>
          </button>
          <button className={styles.modeButton} onClick={() => setSelectedGame('slots')}>
            <span className={styles.modeIcon}>{'\u{1F3B0}'}</span>
            <span className={styles.modeTitle}>SLOTS</span>
            <span className={styles.modeDesc}>Spin to win</span>
          </button>
        </div>
      </div>
    )
  }

  // Step 2: Mode picker
  const gameName = selectedGame === 'blackjack' ? 'BLACKJACK' : 'SLOTS'
  const multiLabel = selectedGame === 'slots' ? 'BATTLE' : 'MULTIPLAYER'
  const multiDesc = selectedGame === 'slots' ? 'Compete with friends' : 'Play with friends'
  const multiDisabled = selectedGame === 'slots'

  return (
    <div className={styles.container}>
      <div className={styles.brand}>
        <h1 className={styles.logo}>{gameName}</h1>
        <span className={styles.subtitle}>CHOOSE YOUR TABLE</span>
      </div>
      <div className={styles.options}>
        <button
          className={styles.modeButton}
          onClick={() => onSelectMode(`solo-${selectedGame}`)}
        >
          <span className={styles.modeIcon}>{'\u{1F0CF}'}</span>
          <span className={styles.modeTitle}>SOLO</span>
          <span className={styles.modeDesc}>Classic single-player</span>
        </button>
        <button
          className={`${styles.modeButton} ${multiDisabled ? styles.disabled : ''}`}
          onClick={() => !multiDisabled && onSelectMode(`multiplayer-${selectedGame}`)}
          disabled={multiDisabled}
        >
          <span className={styles.modeIcon}>{'\u{1F465}'}</span>
          <span className={styles.modeTitle}>{multiLabel}</span>
          <span className={styles.modeDesc}>{multiDesc}</span>
        </button>
      </div>
      <button className={styles.backButton} onClick={handleBack}>
        BACK
      </button>
    </div>
  )
}

export default memo(ModeSelect)
```

**Note:** Multiplayer slots is marked as `disabled` for now (Phase 5 scope). Remove the `multiDisabled` logic when PvP slots is implemented. The solo icon for step 2 could be adjusted per game — this is a minor visual polish item.

- [ ] **Step 3: Verify build**

Run: `cd /Users/sia/Desktop/blackjack && npx vite build --mode development 2>&1 | tail -5`
Expected: May fail because App.jsx still passes old props. That's expected — we fix it in the next task.

- [ ] **Step 4: Commit**

```bash
git add src/components/ModeSelect.jsx src/components/ModeSelect.module.css
git commit -m "feat: two-step game/mode picker in ModeSelect"
```

---

## Task 8: App.jsx — Wire Up Modes

Update App.jsx to use the new mode strings and render SoloSlots for `solo-slots`.

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Update App.jsx**

The `mode` state expands from `null | 'solo' | 'multiplayer'` to `null | 'solo-blackjack' | 'multiplayer-blackjack' | 'solo-slots' | 'multiplayer-slots'`. ModeSelect now calls `onSelectMode(modeString)` instead of two separate callbacks.

Replace the entire `App.jsx` content:

```jsx
import { useState, useReducer, useCallback } from 'react'
import ModeSelect from './components/ModeSelect'
import SoloGame from './components/SoloGame'
import Lobby from './components/Lobby'
import MultiplayerGame from './components/MultiplayerGame'
import SoloSlots from './components/slots/SoloSlots'
import { multiplayerReducer } from './reducer/multiplayerReducer'
import { multiplayerInitialState } from './reducer/multiplayerInitialState'
import { useWebSocket } from './hooks/useWebSocket'
import styles from './App.module.css'

function MultiplayerApp({ onBack }) {
  const [state, dispatch] = useReducer(multiplayerReducer, multiplayerInitialState)
  const { send, disconnect } = useWebSocket(dispatch)

  const handleLeave = useCallback(() => {
    disconnect()
    onBack()
  }, [disconnect, onBack])

  const isInGame = state.phase === 'betting' || state.phase === 'playing' ||
                   state.phase === 'dealerTurn' || state.phase === 'result'

  if (isInGame) {
    return (
      <MultiplayerGame
        state={state}
        send={send}
        dispatch={dispatch}
        onLeave={handleLeave}
      />
    )
  }

  return (
    <Lobby
      state={state}
      send={send}
      dispatch={dispatch}
      onBack={handleLeave}
    />
  )
}

function App() {
  const [mode, setMode] = useState(null)

  return (
    <div className={styles.app}>
      {mode === null && (
        <ModeSelect onSelectMode={setMode} />
      )}
      {mode === 'solo-blackjack' && (
        <SoloGame onBack={() => setMode(null)} />
      )}
      {mode === 'multiplayer-blackjack' && (
        <MultiplayerApp onBack={() => setMode(null)} />
      )}
      {mode === 'solo-slots' && (
        <SoloSlots onBack={() => setMode(null)} />
      )}
    </div>
  )
}

export default App
```

- [ ] **Step 2: Verify full build succeeds**

Run: `cd /Users/sia/Desktop/blackjack && npx vite build --mode development 2>&1 | tail -10`
Expected: Build succeeds with no errors

- [ ] **Step 3: Verify lint passes**

Run: `cd /Users/sia/Desktop/blackjack && npm run lint 2>&1 | tail -20`
Expected: Clean (or only pre-existing warnings)

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire solo-slots mode into App.jsx router"
```

---

## Task 9: Verify Existing Tests Still Pass

Make sure Phase 1/2 tests (slotUtils, slotsReducer) and all existing blackjack tests still pass.

**Files:**
- None (verification only)

- [ ] **Step 1: Run slot utility tests**

Run: `cd /Users/sia/Desktop/blackjack && npx vitest run src/utils/__tests__/slotUtils.test.js 2>&1 | tail -15`
Expected: All tests pass

- [ ] **Step 2: Run slot reducer tests**

Run: `cd /Users/sia/Desktop/blackjack && npx vitest run src/reducer/__tests__/slotsReducer.test.js 2>&1 | tail -15`
Expected: All tests pass

- [ ] **Step 3: Run full test suite**

Run: `cd /Users/sia/Desktop/blackjack && npx vitest run 2>&1 | tail -20`
Expected: All tests pass — no regressions in blackjack tests

- [ ] **Step 4: Run full build**

Run: `cd /Users/sia/Desktop/blackjack && npm run build 2>&1 | tail -10`
Expected: Production build succeeds

- [ ] **Step 5: Run lint**

Run: `cd /Users/sia/Desktop/blackjack && npm run lint 2>&1 | tail -20`
Expected: Clean or pre-existing warnings only

---

## Task 10: Manual Smoke Test

Start the dev server and verify the full flow works in the browser.

**Files:**
- None (verification only)

- [ ] **Step 1: Start dev server**

Run: `cd /Users/sia/Desktop/blackjack && npm run dev`

- [ ] **Step 2: Verify navigation**

1. Open `http://localhost:5173`
2. ModeSelect shows "HOUSE MONEY" with BLACKJACK and SLOTS buttons
3. Click BLACKJACK → shows SOLO / MULTIPLAYER picker with BACK button
4. Click BACK → returns to game picker
5. Click SLOTS → shows SOLO / BATTLE picker (BATTLE disabled)
6. Click SOLO → SoloSlots loads

- [ ] **Step 3: Verify solo slots flow**

1. Chip tray shows with default denominations
2. Tap a chip → chip value appears in bet display
3. Tap SPIN → reels start spinning, stop left-to-right with stagger
4. After all 3 reels stop → result banner shows match type + payout
5. Tap SPIN AGAIN → returns to betting phase
6. Verify ALL IN, UNDO, CLEAR buttons work
7. Verify mute toggle works (via Header menu)

- [ ] **Step 4: Verify blackjack still works**

1. Return to menu → BLACKJACK → SOLO
2. Full blackjack game still works (deal, hit, stand, etc.)
3. Return to menu → BLACKJACK → MULTIPLAYER
4. Lobby still loads correctly

---

## Dependency Order

```
Task 1 (SlotReel) → Task 2 (SlotMachine) → Task 6 (SoloSlots)
Task 3 (SlotsBettingControls) ──────────────→ Task 6 (SoloSlots)
Task 4 (SlotsResultBanner) ────────────────→ Task 6 (SoloSlots)
Task 5 (Sounds) ───────────────────────────→ Task 6 (SoloSlots)
Task 7 (ModeSelect) → Task 8 (App.jsx)
Task 6 + Task 8 → Task 9 (Tests) → Task 10 (Smoke Test)
```

Tasks 1-5 can be built in parallel (they're all leaf components). Tasks 7-8 can be built in parallel with Tasks 1-5. Task 6 depends on Tasks 1-5. Task 9 depends on Tasks 6 and 8.
