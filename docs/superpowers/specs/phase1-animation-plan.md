# Phase 1: Animation Overhaul — Framer Motion Implementation Plan

## Context

The blackjack app feels flat — cards spawn from nowhere, chips vanish on loss, phase transitions snap instantly, numbers update without animation. Phase 1 transforms every interaction to feel tactile and cinematic.

**Key decision:** We're adding `motion` (Framer Motion's successor package) as the app's first external runtime dependency. This gives us AnimatePresence for exit animations, spring physics, gesture handling, layout animations, and orchestrated sequences — dramatically simplifying the hardest parts of this overhaul.

**Package:** `motion` (npm), imported from `motion/react`. React 19 compatible. ~4.6kb initial + 15kb deferred with LazyMotion.

---

## Step 0: Install Motion & Create Global Wrapper

**Files:** `package.json`, create `src/motion/MotionProvider.jsx`, modify `src/App.jsx`

Install `motion` as a dependency. Create a provider component:

```jsx
// src/motion/MotionProvider.jsx
import { LazyMotion, MotionConfig } from 'motion/react'

const loadFeatures = () => import('motion/dom-animation').then(mod => mod.default || mod)

export default function MotionProvider({ children }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}
```

- `LazyMotion` + `domAnimation`: code-splits motion features (~15kb loads async, only ~4.6kb synchronous)
- `strict`: errors if anyone uses `motion.div` instead of `m.div` (prevents accidental full-bundle import)
- `MotionConfig reducedMotion="user"`: all FM animations auto-disable when OS reduced motion is on
- Use `m` (not `motion`) everywhere — works with LazyMotion

Wrap App.jsx's return in `<MotionProvider>`.

**Verify:** App renders identically. `npm run build` succeeds. Network tab shows lazy chunk load.

---

## Step 1: Button & Chip Press Depth (Spec 1.4)

**Files:** `src/components/ActionButtons.jsx`, `ActionButtons.module.css`, `src/components/Chip.jsx`, `Chip.module.css`

### ActionButtons
- Replace `<button>` with `<m.button>` (import `m` from `motion/react`)
- Add `whileTap={{ y: 2, scale: 0.97 }}` with `transition={{ duration: 0.06 }}`
- Add resting `box-shadow: 0 3px 6px rgba(0,0,0,0.3)` to `.button` in CSS
- Remove CSS `:active { transform: scale(0.97) }` — FM handles this now

### Chip
- Replace `<button>` with `<m.button>`
- Add `whileTap={{ scale: 0.9 }}` with `transition={{ type: 'spring', stiffness: 400, damping: 25 }}`
- Remove CSS `:active` block and CSS `transition: transform` (keep `transition: box-shadow` for selected glow)

**FM API:** `m.button`, `whileTap`, spring transitions

**Verify:** Tap action buttons — should depress 2px + shrink. Tap chips — should compress to 0.9 scale with spring bounce-back.

---

## Step 2: Bankroll Counting Animation (Spec 1.4)

**Files:** `src/components/BankrollDisplay.jsx`

- Add `useMotionValue(bankroll)` + `useSpring(motionValue, { stiffness: 100, damping: 30 })` for smooth number tween
- Subscribe to spring value changes via `.on('change', ...)` to update a `displayValue` state
- Render `formatMoney(displayValue)` instead of `formatMoney(bankroll)`
- Keep `getDebtClass()` using raw `bankroll` prop (debt CSS classes must respond immediately, not wait for tween)
- ~500ms effective duration via spring physics

**FM API:** `useMotionValue`, `useSpring`

**Verify:** Win/lose a hand. Bankroll number counts smoothly to new value instead of snapping. Debt shake/pulse still applies immediately at thresholds.

---

## Step 3: Hand Value Scale Bump (Spec 1.4)

**Files:** `src/components/PlayerArea.jsx`, `PlayerArea.module.css`, `src/components/DealerArea.jsx`, `DealerArea.module.css`

### PlayerArea
- Wrap value display in `<m.span key={value}>` — the `key` change forces remount, triggering initial animation
- `initial={{ scale: 1.3 }}` → `animate={{ scale: 1 }}` with spring
- Near-21 (18-20): set `initial` color to orange warning
- Bust (>21): set animate color to red + add subtle shake via keyframe array `x: [0, -3, 3, -2, 0]`
- Apply same pattern for multi-hand `.handValue` elements

### DealerArea
- Same `<m.span key={value}>` pattern on dealer's value display

**FM API:** `m.span`, spring animation, key-based remounting

**Verify:** Hit cards — hand value bumps up on change. 18-20 flashes orange. Bust shows red + micro-shake.

---

## Step 4: Result Glow + Dealer Spotlight (Specs 1.3)

**Files:** `src/components/PlayerArea.jsx`, `PlayerArea.module.css`, `src/components/DealerArea.jsx`, `DealerArea.module.css`, `src/components/SoloGame.jsx`, `SoloGame.module.css`

### Result Glow (CSS — infinite loop stays as CSS)
- Add `.glowWin` and `.glowLose` CSS classes with pulsing box-shadow
- In PlayerArea: apply when `phase === 'result'` based on `hand.result`
- In DealerArea: apply inverse (dealer wins → green glow on dealer hand)

### Dealer Turn Spotlight (CSS transition)
- On `.table` wrapper in SoloGame, add `.dealerSpotlight` class when `phase === 'dealerTurn'`
- CSS: `.dealerSpotlight .playerRow { opacity: 0.6; transition: opacity 0.3s; }`
- CSS: `.dealerSpotlight .dealerRow { filter: brightness(1.1); transition: filter 0.3s; }`

**FM API:** None — CSS is better for infinite pulses and simple transitions

**Verify:** Win/lose — appropriate hand glows green/red. During dealer turn — player area dims, dealer area brightens.

---

## Step 5: Dealer Typing Effect (Spec 1.4)

**Files:** `src/components/DealerSpeechBubble.jsx`, `DealerSpeechBubble.module.css`

- Add `displayedText` state, revealed character-by-character via `setInterval` (~15ms/char, ~300ms total for 20-char message)
- Render `displayedText` instead of full `message`
- Replace CSS fade-in/fade-out with `AnimatePresence`:
  - `initial={{ opacity: 0, y: -4 }}` → `animate={{ opacity: 1, y: 0 }}` → `exit={{ opacity: 0, y: -4 }}`
  - Duration: 0.3s enter, 0.4s exit
- Remove CSS `@keyframes speechFadeIn`, `@keyframes speechFadeOut`, `.fadeOut` class
- Keep `key={message}` for remounting on new message
- Keep existing 4000ms display timer for visibility duration

**FM API:** `AnimatePresence`, `m.div`

**Verify:** Trigger dealer message — characters type in rapidly. Bubble fades in/out smoothly via FM.

---

## Step 6: Phase Transition Smoothing (Spec 1.3)

**Files:** `src/components/SoloGame.jsx`, `SoloGame.module.css`

Wrap the `.phaseContent` children in `<AnimatePresence mode="wait">`. Each phase gets a unique `key` and `m.div` wrapper:

| Phase | Key | Enter | Exit |
|-------|-----|-------|------|
| `betting` | `"betting"` | `opacity: 0, y: 20` → `1, 0` (200ms) | `opacity: 0, y: 20` (150ms) |
| `playing` | `"playing"` | `opacity: 0, y: -10` → `1, 0` (150ms) | `opacity: 0` (100ms) |
| `dealerTurn` | `"dealerTurn"` | `opacity: 0` → `1` (150ms) | `opacity: 0` (100ms) |
| `result` | `"result"` | `opacity: 0, scale: 0.95` → `1, 1` (200ms) | `opacity: 0` (150ms) |

- `mode="wait"`: exit completes before enter starts — no overlapping content
- Remove CSS `@keyframes controlsFadeIn` and `.phaseContent` animation

**FM API:** `AnimatePresence mode="wait"`, `m.div`, `initial`/`animate`/`exit`

**Verify:** Transition between all phases. Betting controls slide down before action buttons slide up. No instant content swaps. No empty frames between transitions.

---

## Step 7: Card Shoe Visual (Spec 1.1)

**Files:** Create `src/components/CardShoe.jsx`, modify `src/components/DealerArea.jsx`, `DealerArea.module.css`

- Create small decorative SVG component (~30×20px): dark rectangle with 3 stacked card-back layers offset slightly, subtle 3D perspective via `rotateX(10deg) rotateY(-5deg)`
- Position top-right of dealer area via CSS absolute positioning
- Purely decorative — no game logic

**FM API:** None (static SVG)

**Verify:** Visual inspection — small card shoe appears in dealer area's top-right corner.

---

## Step 8: Card Dealing Arc from Shoe (Spec 1.1) — HIGHEST RISK

**Files:** `src/components/Card.jsx`, `Card.module.css`, `src/components/Hand.jsx`, `Hand.module.css`

### Card.jsx — CSS → FM Migration

Remove `DEAL_TYPE_CLASS` mapping and CSS animation classes. Replace with FM declarative animations:

```jsx
// Animation configs by deal type
const DEAL_ANIMATIONS = {
  deal: {
    initial: { x: 150, y: -100, rotate: -5, scale: 0.4, opacity: 0 },
    animate: {
      x: [150, 40, -4, 0],         // arc path
      y: [-100, -140, 3, 0],       // rises above start at 25% (apex)
      rotate: [-5, -3, -1, 0],
      scale: [0.4, 0.8, 1.03, 1],  // micro-bounce at end
      opacity: [0, 1, 1, 1],
    },
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94],
      times: [0, 0.4, 0.85, 1],
    },
  },
  hit: {
    initial: { x: 100, y: -60, rotate: 8, scale: 0.5, opacity: 0 },
    animate: {
      x: [100, 20, -2, 0],
      y: [-60, -80, 2, 0],         // slight arc
      rotate: [8, 3, -1, 0],
      scale: [0.5, 0.9, 1.03, 1],
      opacity: [0, 1, 1, 1],
    },
    transition: {
      duration: 0.3,
      ease: [0.25, 0.46, 0.45, 0.94],
      times: [0, 0.35, 0.85, 1],
    },
  },
  dealerDraw: {
    initial: { x: 60, scale: 0.9, opacity: 0 },
    animate: { x: 0, scale: 1, opacity: 1 },
    transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  flip: {
    animate: { rotateY: [0, 90, 0], scale: [1, 1.05, 1] },
    transition: { duration: 0.3, ease: 'easeInOut' },
  },
}
```

- Card's outer div becomes `<m.div>` with animation config selected by `dealType`
- When `animate` prop is false (existing cards), set `initial={false}` to skip FM animation
- Stagger delay: `delay: index * 0.2` in transition (200ms per card per spec, up from 150ms)
- Add `boxShadow` keyframe: shadow fades in on landing

**Card.module.css:** Remove `.dealing`, `.hitting`, `.dealerDraw`, `.flipping` classes and all 4 `@keyframes` blocks. Keep all structural/visual CSS (`.card`, `.face`, `.back`, sizes, etc.).

### Hand.jsx — Layout Animation for Card Fanning

- Card wrapper becomes `<m.div layout>` — FM automatically animates position changes when margins adjust
- `transition={{ layout: { duration: 0.2, ease: 'easeOut' } }}` for smooth repositioning
- Remove CSS `transition: margin-left 0.2s ease` from `.handCard` (FM `layout` replaces it)
- `knownCardsRef` system stays exactly as-is — it determines which cards get `animate={true}` vs `false`
- `newCardStagger` map stays — provides the stagger index per new card

### Hole Card Flip

- DealerArea.jsx: reduce `flipHoleCard` timeout from 600ms to 300ms to match FM flip duration
- Card's `flip` variant handles the 3D rotateY animation
- Existing `perspective: 600px` on `.handCard` stays (FM needs it for 3D transforms)

### Card Exit Animation (Result → Betting)

- Wrap card map in Hand.jsx with `<AnimatePresence>`
- Add `exit={{ opacity: 0, y: -30, scale: 0.8 }}` on card wrappers
- When NEW_ROUND clears hands, AnimatePresence triggers exit on all cards
- Cards fade + slide toward dealer before disappearing

**FM API:** `m.div`, keyframe arrays, `layout`, `AnimatePresence`, `exit`, `initial={false}`, `times`

**Verify:**
- Deal — cards arc from top-right with parabolic path, staggered 200ms, micro-bounce on landing
- Hit — new card arcs in (300ms), existing cards smoothly shift left via layout animation
- Dealer turn — hole card flips 3D (300ms), then dealer cards slide from shoe
- Next Hand — cards fade upward before disappearing

---

## Step 9: Chip Scatter/Slide Animations (Spec 1.2)

**Files:** `src/components/BettingCircle.jsx`, `BettingCircle.module.css`

### Chip Scatter on Loss — `useAnimate`

```jsx
const [scope, animate] = useAnimate()

useEffect(() => {
  if (!animatingOut) return
  if (!isWin) {
    // Scatter: each chip flies to random position
    animate('.stackedChip', (i) => ({
      x: (Math.random() - 0.5) * 160,
      y: (Math.random() - 0.5) * 120 - 30,
      rotate: (Math.random() - 0.5) * 90,
      scale: 0.3,
      opacity: 0,
    }), { duration: 0.5, delay: stagger(0.03, { from: 'last' }) })
  }
}, [animatingOut, isWin])
```

### Chip Slide on Win — `useAnimate` + floating text

```jsx
if (isWin) {
  animate('.stackedChip', (i) => ({
    y: 80,
    x: (i - visibleChips.length / 2) * 15,
    rotate: (i - visibleChips.length / 2) * -8,
    scale: 0.5,
    opacity: 0,
  }), { duration: 0.5, delay: stagger(0.04) })
}
```

Add `<m.span>` for "+$X" floating text:
```jsx
{animatingOut && isWin && (
  <m.span
    className={styles.winAmount}
    initial={{ opacity: 0, y: 0, scale: 0.8 }}
    animate={{ opacity: [0, 1, 1, 0], y: -40, scale: [0.8, 1.1, 1.1, 1] }}
    transition={{ duration: 1 }}
  >
    +{formatMoney(total)}
  </m.span>
)}
```

### Stack Landing Compression

When `newChipIndex` changes (new chip added), animate existing chips down 1px then back:
```jsx
useEffect(() => {
  if (newChipIndex >= 0) {
    animate('.stackedChip:not(:last-child)', { y: [0, 1, 0] }, { duration: 0.15 })
  }
}, [newChipIndex])
```

**Remove CSS:** `.sweepOut`, `.spreadOut`, `@keyframes chipSweep`, `@keyframes chipSpread`

**FM API:** `useAnimate`, `stagger`, `m.span`

**Verify:** Lose — chips scatter randomly and fade. Win — chips fan downward + "+$X" text rises. Add chip to stack — existing chips briefly compress.

---

## What Stays as CSS (NOT migrated)

| Animation | Reason |
|-----------|--------|
| Debt pulse/shake (BankrollDisplay) | Infinite CSS loop — FM not suited |
| Felt texture/vignette (theme.css) | Static CSS, no animation |
| FlyingChip arc (`flyArc` keyframe) | Fire-and-forget CSS works well, CSS custom properties for coordinates |
| Chip bounce (`chipBounce`) | Simple CSS keyframe |
| Chip landing (`chipLand`) | Well-implemented CSS with custom properties |
| Reshuffle animation (DealerArea) | Self-contained CSS, not worth migrating |
| Toast slide-in/out | Low priority, can migrate later |
| Credit pulse | Infinite CSS loop |
| Card body/pip rendering | No animation, pure CSS |

---

## Execution Order & Parallelism

```
BATCH 1 — Foundation + Low Risk (parallel, no file conflicts):
  Step 0: MotionProvider          (App.jsx, new file)
  
BATCH 2 — Micro-interactions (parallel after Step 0):
  Step 1: Button/Chip press       (ActionButtons, Chip)
  Step 2: Bankroll counting       (BankrollDisplay)
  Step 3: Hand value bump         (PlayerArea, DealerArea)
  Step 4: Result glow + spotlight (PlayerArea.css, DealerArea.css, SoloGame.css)
  Step 5: Dealer typing           (DealerSpeechBubble)

BATCH 3 — Phase transitions (after Batch 2, touches SoloGame):
  Step 6: AnimatePresence phases  (SoloGame)

BATCH 4 — Card system (after Batch 3, highest risk):
  Step 7: Card shoe visual        (DealerArea, new CardShoe)
  Step 8: Card arc + layout + exit (Card, Hand, DealerArea)

BATCH 5 — Chip animations (after Batch 2):
  Step 9: Scatter/slide/compress  (BettingCircle)
```

## Commit Strategy

1. **`feat: add motion library and MotionProvider wrapper`** — Step 0
2. **`feat: add button depth and chip press via whileTap`** — Step 1
3. **`feat: add bankroll counting animation`** — Step 2
4. **`feat: add hand value bump, result glow, dealer spotlight`** — Steps 3 + 4
5. **`feat: add dealer typing effect with AnimatePresence`** — Step 5
6. **`feat: smooth phase transitions with AnimatePresence`** — Step 6
7. **`feat: add card shoe and arc dealing animations`** — Steps 7 + 8
8. **`feat: add chip scatter, slide, and stack compression`** — Step 9

## Verification Checklist (Phase 1 Complete)

- [ ] Deal — cards arc from shoe with staggered timing (200ms apart), micro-bounce + shadow on landing
- [ ] Hit — new card arcs in (300ms), existing cards shift left via layout animation
- [ ] Dealer turn — hole card flips 3D (300ms), dealer cards slide from shoe
- [ ] Next Hand — cards fade + slide upward before disappearing
- [ ] Win — chips fan downward, "+$X" text floats up and fades
- [ ] Lose — chips scatter outward in random directions and fade
- [ ] Bankroll changes — number counts smoothly to new value (~500ms spring)
- [ ] Dealer message — text types in character by character (~300ms)
- [ ] Buttons — depress on tap with depth (translateY 2px + shadow)
- [ ] Chips — compress to 0.9 scale on press with spring bounce
- [ ] Hand value — scales up on change, orange flash 18-20, red + shake on bust
- [ ] Result phase — winning hand glows green, losing hand glows red
- [ ] Dealer turn — player area dims, dealer area brightens
- [ ] Phase transitions — smooth slide/fade between all phases via AnimatePresence
- [ ] Reduced motion — all FM animations disabled with OS preference (MotionConfig)
- [ ] Mobile — test on 393×852 viewport, no overflow or broken touch targets
- [ ] `npm run build` — succeeds, motion chunk loads lazily
- [ ] `npm run lint` — no warnings

## Key Files

| File | Action |
|------|--------|
| `src/motion/MotionProvider.jsx` | CREATE |
| `src/components/CardShoe.jsx` | CREATE |
| `src/App.jsx` | MODIFY (wrap in MotionProvider) |
| `src/components/ActionButtons.jsx` | MODIFY (m.button + whileTap) |
| `src/components/ActionButtons.module.css` | MODIFY (remove :active, add box-shadow) |
| `src/components/Chip.jsx` | MODIFY (m.button + whileTap) |
| `src/components/Chip.module.css` | MODIFY (remove :active, keep box-shadow transition) |
| `src/components/BankrollDisplay.jsx` | MODIFY (useMotionValue + useSpring) |
| `src/components/PlayerArea.jsx` | MODIFY (m.span value bump, glow classes) |
| `src/components/PlayerArea.module.css` | MODIFY (glow classes) |
| `src/components/DealerArea.jsx` | MODIFY (shoe, value bump, spotlight, flip timing) |
| `src/components/DealerArea.module.css` | MODIFY (shoe styles, glow, spotlight) |
| `src/components/DealerSpeechBubble.jsx` | MODIFY (typing + AnimatePresence) |
| `src/components/DealerSpeechBubble.module.css` | MODIFY (remove CSS fade keyframes) |
| `src/components/SoloGame.jsx` | MODIFY (AnimatePresence phases, spotlight class) |
| `src/components/SoloGame.module.css` | MODIFY (remove controlsFadeIn, add spotlight) |
| `src/components/Card.jsx` | MODIFY (m.div + FM animation configs) |
| `src/components/Card.module.css` | MODIFY (remove 4 keyframes + animation classes) |
| `src/components/Hand.jsx` | MODIFY (m.div layout, AnimatePresence for exit) |
| `src/components/Hand.module.css` | MODIFY (remove margin transition) |
| `src/components/BettingCircle.jsx` | MODIFY (useAnimate scatter/slide/compress) |
| `src/components/BettingCircle.module.css` | MODIFY (remove sweep/spread keyframes, add winAmount) |

## Risk Assessment

| Step | Risk | Mitigation |
|------|------|------------|
| 0: MotionProvider | Very Low | Additive wrapper, zero behavior change |
| 1: Button/Chip press | Low | Trivially reversible, isolated components |
| 2: Bankroll tween | Low | Isolated to one component, spring values are predictable |
| 3: Value bump | Low | Key-based remount is safe, isolated |
| 4: Glow/spotlight | Very Low | Pure CSS additions |
| 5: Typing effect | Low | Isolated component, timer logic unchanged |
| 6: Phase transitions | Medium | AnimatePresence mode="wait" may affect timing — test all phase combos |
| 7: Card shoe | Very Low | Decorative only |
| 8: Card arc + exit | **High** | Touches Card/Hand rendering pipeline. knownCardsRef is delicate. Must verify: new cards animate, old cards don't, flip still works, stagger timing correct, layout doesn't cause jank on mobile |
| 9: Chip scatter | Medium | useAnimate scope management, verify cleanup on unmount |

## Constraints

- Import `m` from `motion/react` (not `motion`) — works with LazyMotion
- Never call `motion.create()` inside render — always at module level
- Only animate `transform` + `opacity` for GPU compositing (FM handles this automatically)
- Reducer stays pure — all animation is FM/hook-driven
- All changes are ADDITIVE — no existing game logic modified
- No AI attribution in commits (per CLAUDE.md)
