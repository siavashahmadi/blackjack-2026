# House Money — Visual Overhaul & Casino System Spec

> This document covers the complete visual transformation of House Money from a "functional but stiff" blackjack app into a fluid, cinematic, dark-comedy casino experience. It also introduces the casino selection system with named establishments, each with their own personality.
>
> **Execute in phase order. Each phase is independently shippable and testable. Do not skip phases or combine them.**

---

## Phase 1: Animation Overhaul

The single biggest impact change. Every interaction should feel tactile and intentional. The goal: a player should FEEL the cards land, FEEL the chips stack, and FEEL the weight of each decision.

### 1.1 Card Dealing Animation

**Current state:** Cards appear with a basic `cardDeal` keyframe (opacity + translateY + scale). Feels like cards are spawning from nowhere.

**New animation — cards deal from a shoe:**

A card shoe visual sits in the top-right corner of the dealer area (a small, subtle SVG rectangle representing a stacked deck). When cards are dealt:

1. Card starts face-down at the shoe position (small, ~40% scale)
2. Card arcs toward its destination (player area or dealer area) along a curved path over ~400ms
3. Card rotates slightly during flight (-5deg to 0deg)
4. Card scales up from 40% to 100% as it travels
5. Card lands with a micro-bounce (scale 1.0 → 1.03 → 1.0 over 100ms)
6. On landing, a subtle shadow appears beneath the card (drop-shadow fades in)
7. For the dealer's hole card: card lands face-down, then on dealer turn reveal, it flips with a 3D `rotateY(180deg)` transform over 300ms

**Implementation:**

- The shoe is a simple SVG element in `DealerArea.jsx` — a dark rectangle with a slight 3D perspective, ~30x20px, positioned top-right. It's decorative only.
- Card dealing uses CSS `@keyframes` with a custom `animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94)` for the natural arc feel.
- Each card in the deal sequence has a staggered `animation-delay`: card 1 at 0ms, card 2 at 200ms, card 3 at 400ms, card 4 at 600ms. The full deal takes ~1 second.
- The arc path uses a combination of `translateX`, `translateY`, and `scale` in the keyframe. At 50% of the animation, the card is higher than both start and end positions (the apex of the arc).
- The hole card flip uses `transform: rotateY(180deg)` with `transform-style: preserve-3d` on the card container. The card face and card back are positioned with `backface-visibility: hidden` on each side.

**Card slide-in for HIT:**

When the player hits:
1. New card slides in from the shoe (same arc, but faster — 300ms)
2. Existing cards in the hand shift left slightly (100ms transition) to make room
3. The hand "fans out" dynamically — each card adjusts its position via CSS transition

**Card reveal on dealer turn:**

Each dealer card drawn slides from the shoe face-up. The hole card flips first (300ms flip), pause 200ms, then dealer draws begin.

**Files to modify:** `src/styles/animations.css` (new keyframes), `src/components/Card.jsx` (flip support), `src/components/Card.module.css` (3D transform styles), `src/components/Hand.jsx` (staggered animation props), `src/components/DealerArea.jsx` (card shoe SVG + flip trigger)

---

### 1.2 Chip Interaction Refinements

**Current state:** Chips fly from tray to circle with a basic arc. Functional but flat.

**Improvements:**

**Chip tap feedback:** On tap, the chip in the tray does a quick "press" animation — scale down to 0.9 over 50ms, then back to 1.0. This happens BEFORE the flying chip spawns, giving instant tactile feedback.

**Flying chip rotation:** The flying chip rotates ~180deg during its arc flight (like a chip being tossed). Add `transform: rotate(180deg)` to the end state of the `flyArc` keyframe.

**Stack landing:** When a chip lands in the betting circle stack, the existing chips in the stack do a tiny compression (translateY 1px down, then back) — like the weight of the new chip landing on them. This is a CSS transition on the stack container triggered by the chip count changing.

**Chip scatter on loss:** When the player loses, instead of chips just vanishing, they scatter outward from the betting circle in random directions over 500ms, fading out as they go. Each chip gets a random `translateX` and `translateY` with `opacity: 0` at the end. Use inline CSS variables (`--scatter-x`, `--scatter-y`) set randomly per chip via JS.

**Chip slide to player on win:** When the player wins, chips slide from the dealer area toward the bottom of the screen (toward the player) with a slight fan pattern, then fade. Winnings could briefly appear as a "+$5,000" floating text that rises and fades.

**Files:** `src/styles/animations.css`, `src/components/Chip.module.css`, `src/components/BettingCircle.jsx` + CSS, `src/components/FlyingChip.jsx` + CSS

---

### 1.3 Phase Transition Smoothing

**Current state:** Phase transitions (betting → playing → dealer turn → result) swap controls instantly with a basic fade.

**Improvements:**

**Betting → Playing:** The chip tray slides down and fades out (200ms), then action buttons slide up and fade in (200ms). Slight overlap so there's no empty frame.

**Playing → Dealer Turn:** Action buttons fade out quickly (150ms). A subtle "spotlight shift" effect — the dealer area gets slightly brighter (via a CSS filter or overlay opacity change) to draw attention to the dealer. The dealer's hole card flips.

**Dealer Turn → Result:** After the last dealer card lands, a brief pause (300ms), then the result modal fades in. The winning/losing hand gets a brief highlight glow (green for win, red for loss) before the modal appears.

**Result → Betting:** Result modal fades out, controls area transitions back to the chip tray sliding up. Cards on the table fade out and slide slightly toward the dealer (as if being collected). Betting circle resets.

**Implementation:** Most of this is CSS transitions and `animation-delay` coordination. The key is that the OUTGOING elements animate OUT before or simultaneously with INCOMING elements animating IN. Use the existing `phaseContent` wrapper in SoloGame and add CSS classes per phase for targeted animations.

**Files:** `src/components/SoloGame.module.css`, `src/components/MultiplayerGame.module.css`, `src/styles/animations.css`

---

### 1.4 Micro-Interactions

Small touches that make the app feel alive:

**Bankroll number counting:** When bankroll changes, the number should count up/down to the new value over ~500ms instead of snapping instantly. Use a `useEffect` with `requestAnimationFrame` that interpolates from old value to new value. This makes wins feel like money flowing in and losses feel like money draining out.

**Dealer speech bubble typing effect:** Instead of the message appearing instantly, have it "type" in character by character over ~300ms (fast typing, not slow). This draws the eye to the dealer's message and makes it feel like the dealer is actually speaking.

**Button press depth:** All action buttons (HIT, STAND, DOUBLE, SPLIT, DEAL) should have an `active` state that translates them down 2px and reduces the box-shadow — simulating a physical button press. Currently buttons just reduce opacity on active. The translateY creates a depth illusion.

**Hand value counter:** When the hand value changes (new card dealt), the number should briefly scale up (1.0 → 1.2 → 1.0 over 200ms) to draw attention to the new total. Red flash if it's getting close to 21 (18-20), and a dramatic red pulse if bust.

**Files:** `src/components/BankrollDisplay.jsx` (counting animation), `src/components/DealerSpeechBubble.jsx` (typing effect), various `.module.css` files (button depth), `src/components/PlayerArea.jsx` or `Hand.jsx` (value counter animation)

---

### Phase 1 Verification

- Deal a hand — cards should arc from the shoe with staggered timing
- Hit — new card arcs in, hand fans out
- Dealer turn — hole card flips with 3D rotation, then cards draw from shoe
- Win — chips animate toward player, "+$X" floats up
- Lose — chips scatter outward and fade
- Bankroll changes — number counts to new value
- Dealer message — text types in character by character
- Buttons — press down on tap, feel like physical buttons

---

## Phase 2: 3D Perspective & Table Feel

### 2.1 Table Perspective

**The single most transformative visual change.** Apply a subtle CSS perspective to the table area so it looks like you're sitting at a real blackjack table, looking down at an angle.

**Implementation:**

On the `.table` container (SoloGame) or `.tableArea` (MultiplayerGame):

```css
.table {
  perspective: 1000px;
  transform-style: preserve-3d;
}

.tableInner {
  transform: rotateX(5deg);
  transform-origin: center bottom;
}
```

The `rotateX(5deg)` tilts the table surface away from the viewer at the top, creating a subtle 3D angle. The `transform-origin: center bottom` means the bottom of the table (near the player's cards) stays flat while the dealer area tilts back slightly. This mimics the natural viewing angle at a real blackjack table.

**Important:** Keep the tilt VERY subtle (5-8 degrees max). More than that and touch targets become misaligned, text becomes hard to read, and cards look distorted. This should feel like a gentle perspective, not a dramatic 3D scene.

**The dealer area should be slightly smaller** than the player area due to perspective foreshortening. This happens naturally with the rotateX — elements further from the viewer (top of the table) appear smaller. If the effect is too strong, counteract with a slight `scale` on the dealer area.

**Cards on the tilted surface** need `transform-style: preserve-3d` propagated so their own animations (deal, flip) work correctly in the 3D space.

**Testing critical:** Test on iPhone 15 Pro in Safari. Verify:
- All buttons are still tappable in their expected positions
- Cards are still readable
- The betting circle is still centered and functional
- The 3D effect doesn't cause any horizontal overflow

**Files:** `src/components/SoloGame.module.css`, `src/components/MultiplayerGame.module.css`, `src/components/Card.module.css` (preserve-3d propagation)

---

### 2.2 Table Edge & Rail

Add a visual table edge to reinforce the 3D feel:

- A curved border at the bottom of the table area (where the player sits) suggesting the padded rail of a blackjack table. This is a CSS `border-bottom` with a thick, slightly rounded, darker green (#0a1a0a) and a subtle inner shadow.
- A thin gold line along the top edge of the rail (the metal strip on real tables).
- The chip tray area (below the rail) should feel slightly recessed — a darker background with an inner shadow suggesting depth.

This is pure CSS decoration. No JS changes.

**Files:** `src/components/SoloGame.module.css`, `src/components/BettingControls.module.css`

---

### 2.3 Felt Texture Enhancement

The current felt uses an SVG noise filter. Enhance it:

- Add a subtle directional grain (real felt has a nap direction). This can be achieved with a second SVG filter layer using `feTurbulence` with different parameters (lower frequency, more stretched) overlaid at very low opacity.
- Add a very subtle vignette effect — the edges of the table are slightly darker than the center, mimicking overhead casino lighting. This is a `radial-gradient` overlay (already partially in place, but could be more dramatic).

**Files:** `src/styles/theme.css`

---

### Phase 2 Verification

- The table should feel like you're looking down at an angle — dealer area slightly tilted away
- Touch all buttons — verify they still work correctly with perspective active
- The table edge/rail should be visible at the bottom of the table area
- The felt should feel richer and more textured than before
- Test on iPhone — no layout breakage

---

## Phase 3: Theme System

### 3.1 Theme Architecture

Create a theme system that swaps the entire color palette and felt texture via CSS custom properties. Each theme is a set of CSS variable overrides applied as a class on the root game container.

**Create `src/constants/themes.js`:**

```javascript
export const THEMES = {
  classic: {
    id: 'classic',
    name: 'Classic Green',
    feltDark: '#0c200c',
    feltMid: '#143a14',
    feltLight: '#1a5a1a',
    feltHighlight: '#2a7a2a',
    gold: '#f0c850',
    goldDim: '#d4a832',
    railColor: '#0a1a0a',
  },
  night: {
    id: 'night',
    name: 'Midnight Grey',
    feltDark: '#1a1a1e',
    feltMid: '#2a2a30',
    feltLight: '#3a3a42',
    feltHighlight: '#4a4a54',
    gold: '#c0a850',
    goldDim: '#a08830',
    railColor: '#0f0f12',
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson Velvet',
    feltDark: '#200c0c',
    feltMid: '#3a1414',
    feltLight: '#5a1a1a',
    feltHighlight: '#7a2a2a',
    gold: '#f0c850',
    goldDim: '#d4a832',
    railColor: '#1a0808',
  },
  royal: {
    id: 'royal',
    name: 'Royal Blue',
    feltDark: '#0c0c20',
    feltMid: '#141430',
    feltLight: '#1a1a4a',
    feltHighlight: '#2a2a6a',
    gold: '#f0d070',
    goldDim: '#d4b050',
    railColor: '#08081a',
  },
}
```

**Create `src/styles/themes.css`:**

Each theme is a CSS class with variable overrides:

```css
.theme-night {
  --felt-dark: #1a1a1e;
  --felt-mid: #2a2a30;
  --felt-light: #3a3a42;
  --felt-highlight: #4a4a54;
  --gold: #c0a850;
  --gold-dim: #a08830;
  --gold-glow: rgba(192, 168, 80, 0.3);
}
/* ... etc for each theme */
```

Because all components already use `var(--felt-dark)` etc., applying a theme class to the game wrapper instantly reskins everything. No component changes needed for basic theming.

**The felt texture pseudo-elements (`body::before`, `body::after`) need to read the theme variables** — they already use `var(--felt-light)` etc., so they'll update automatically.

### 3.2 Theme Selection UI

Add a theme selector in the settings/menu. This could be:
- A row of colored circles in the Header hamburger menu, each representing a theme
- Tapping one applies the theme class and saves to localStorage
- The current theme persists across sessions via `useSessionPersistence`

Add `theme: 'classic'` to the game state. Add a `SET_THEME` action. The SoloGame wrapper applies `className={`${styles.soloGame} theme-${state.theme}`}`.

### 3.3 Casino-Specific Themes

Each casino (Phase 4) has a default theme. When you select a casino, its theme auto-applies. But the player can override with their preferred theme. This is handled in Phase 4.

**Files:** Create `src/constants/themes.js`, `src/styles/themes.css`. Modify `src/reducer/initialState.js`, `src/reducer/gameReducer.js` (SET_THEME action), `src/components/SoloGame.jsx`, `src/components/Header.jsx` (theme selector UI), `src/hooks/useSessionPersistence.js`

---

### Phase 3 Verification

- Switch between all 4 themes — verify every element updates (felt, gold, buttons, text, chips, cards)
- Verify theme persists after page reload
- Verify the felt texture and vignette update with theme colors
- Test on mobile — no visual glitches when switching themes

---

## Phase 4: Casino Selection System

### 4.1 Casino Definitions

Each casino is a named establishment with its own personality, bet limits, chip denominations, theme, dealer personality, and vig rate modifier. Players choose a casino before starting a solo game.

**Create `src/constants/casinos.js`:**

```javascript
export const CASINOS = [
  {
    id: 'the_lounge',
    name: "The Lounge",
    tagline: "Where bad decisions start small.",
    theme: 'classic',
    minBet: 25,
    maxBet: 5000,
    chipValues: [25, 100, 500, 1000, 5000],
    vigModifier: 1.0,        // standard vig rates
    dealerPersonality: 'sarcastic',  // default dealer
    unlockRequirement: null,  // always available
    loanAvailable: true,
  },
  {
    id: 'johnnys_sack',
    name: "Johnny's Sack",
    tagline: "The house always wins. Johnny makes sure of it.",
    theme: 'night',
    minBet: 100,
    maxBet: 25000,
    chipValues: [100, 500, 1000, 5000, 25000],
    vigModifier: 1.25,       // 25% higher vig (Johnny charges more)
    dealerPersonality: 'mob', // mob-themed dealer lines
    unlockRequirement: { type: 'hands_played', value: 25 },
    loanAvailable: true,     // Johnny DEFINITELY gives loans lol
  },
  {
    id: 'the_penthouse',
    name: "The Penthouse",
    tagline: "For those who've already lost everything once.",
    theme: 'crimson',
    minBet: 500,
    maxBet: 100000,
    chipValues: [500, 1000, 5000, 25000, 100000],
    vigModifier: 0.75,       // lower vig (luxury service)
    dealerPersonality: 'cold', // emotionless, professional
    unlockRequirement: { type: 'total_lost', value: 50000 },
    loanAvailable: true,
  },
  {
    id: 'the_vault',
    name: "The Vault",
    tagline: "You shouldn't be here. But here you are.",
    theme: 'royal',
    minBet: 5000,
    maxBet: 1000000,
    chipValues: [5000, 25000, 100000, 500000, 1000000],
    vigModifier: 1.5,        // brutal vig
    dealerPersonality: 'menacing',
    unlockRequirement: { type: 'assets_lost', value: 4 },
    loanAvailable: true,
  },
]
```

**The comedy of Johnny's Sack:** The bet minimum is $100 but you can STILL take a loan when you're below the minimum. Johnny doesn't care. His vig is 25% higher than standard because, as Tony Soprano would say, "that's the cost of doing business." The mob-themed dealer lines reference Johnny by name: "Johnny says you're good for it." / "Johnny's watching from the back. Don't make him come over here." / "You owe Johnny $50K. He's a patient man. For now."

### 4.2 Casino Selection Screen

Replace the current "Solo" button in ModeSelect with a flow:
1. Player taps "Solo" → Casino selection screen appears
2. Shows all casinos as cards/tiles. Locked casinos are dimmed with unlock requirements shown.
3. Each casino tile shows: name, tagline, min/max bet, theme color preview (a small felt-colored circle), and a lock icon if locked.
4. Player taps an unlocked casino → game starts with that casino's settings.
5. Add a "BACK" button to return to mode select.

**Create `src/components/CasinoSelect.jsx`** — a new screen between ModeSelect and SoloGame.

**The unlock check** reads from localStorage: total hands played (across all sessions), total money lost, assets lost. These are persisted by `useSessionPersistence`. If the player hasn't met a casino's unlock requirement, the tile shows the requirement ("Play 25 hands to unlock" / "Lose $50,000 total to unlock" / "Lose 4 assets to unlock").

### 4.3 Casino Configuration Applied to Game

When a casino is selected:
- `MIN_BET` and chip values come from the casino config instead of `gameConfig.js`
- The vig rate is multiplied by `vigModifier` (1.25 for Johnny's means all vig tiers are 25% higher)
- The theme auto-applies
- Dealer lines are filtered/selected based on `dealerPersonality`
- The Header shows the casino name instead of "BLACKJACK"

**State changes:**
- Add `selectedCasino: 'the_lounge'` to initialState
- Add `SET_CASINO` action that updates the casino and resets the game
- All places that read `MIN_BET` from `gameConfig.js` should instead read from the current casino config
- The `getVigRate` function takes an optional modifier parameter

### 4.4 Dealer Personalities

Each casino has a different dealer personality that affects which lines are selected:

**`sarcastic` (The Lounge):** Current default lines. No changes needed.

**`mob` (Johnny's Sack):** New lines added to each category with mob/mafia flavor:
- playerLose: "Johnny sends his regards."
- playerBust: "That's what happens when you get greedy. Johnny hates greedy."
- assetBet: "Johnny appreciates the collateral. Real sign of good faith."
- debtActivated: "Welcome to Johnny's lending program. The terms are non-negotiable."
- playerWin: "...Johnny's not gonna like this."

**`cold` (The Penthouse):** Minimal, professional, almost bored:
- playerLose: "Noted."
- playerBust: "Unfortunate."
- playerWin: "Your account has been credited."
- debtActivated: "Credit extended. Terms apply."

**`menacing` (The Vault):** Dark, threatening, whispered:
- playerLose: "They always lose. Every single one."
- playerBust: "Another one."
- playerWin: "Enjoy it. It won't last."
- debtActivated: "You have no idea what you just signed."

**Implementation:** Expand `dealerLines.js` to have lines keyed by personality. The line selection function takes the personality as a parameter and draws from the appropriate pool. Lines can fall back to the `sarcastic` pool if a personality doesn't have lines for a specific category.

**Files:** Create `src/constants/casinos.js`, `src/components/CasinoSelect.jsx` + CSS. Modify `src/constants/dealerLines.js` (personality-keyed lines), `src/utils/dealerMessages.js` (personality param), `src/reducer/initialState.js`, `src/reducer/gameReducer.js`, `src/components/SoloGame.jsx`, `src/components/Header.jsx`, `src/components/App.jsx` (casino select routing), `src/hooks/useSessionPersistence.js` (persist unlock progress)

---

### Phase 4 Verification

- Launch app — see casino selection screen after tapping Solo
- The Lounge is unlocked by default. Others show lock icons with requirements.
- Select The Lounge — game starts with green felt, $25 min, sarcastic dealer
- Play 25 hands — verify Johnny's Sack unlocks
- Select Johnny's Sack — verify night theme, $100 min, mob dealer lines, 25% higher vig
- Verify you can take a loan at Johnny's even with $0 bankroll and no assets
- Verify casino name shows in the header
- Verify unlock progress persists across page reloads

---

## Phase 5: Character Silhouettes

### 5.1 Dealer Silhouette

**NOT a detailed illustration.** This is a minimalist noir-style SVG silhouette — a solid black shape of a dealer's upper body (shoulders, head, suggestion of a bow tie) positioned behind the dealer area. Think of it like a shadow puppet.

**The silhouette reacts to game events:**
- **Idle/dealing:** Silhouette is still, arms at table level
- **Player busts:** Slight head tilt (rotate 3deg), suggesting amusement
- **Player blackjack:** Arms raise slightly (translateY -5px on the arm paths)
- **Big bet:** Leans forward slightly (scale + translateY)
- **Player takes a loan:** Rubs hands together (a simple animation loop on the hand shapes)

These are TINY movements — 3-5px translations, 2-3 degree rotations. The silhouette should feel alive but not distracting. Think "breathing" not "dancing."

**Implementation:**

Create `src/components/DealerSilhouette.jsx`:
- Renders an inline SVG with `<path>` elements forming the silhouette
- Accepts a `reaction` prop: 'idle' | 'amused' | 'impressed' | 'leaning' | 'rubbing'
- Each reaction maps to a CSS class that applies subtle transforms to specific SVG path groups
- Transitions between reactions over 300ms

The SVG should be simple — maybe 5-6 path elements (head, body, left arm, right arm, bow tie, hat brim). All solid black or very dark grey (#0a0a0a). The silhouette is positioned behind the dealer area with `z-index: 0` and is partially obscured by the cards and speech bubble.

**Size:** About 80-100px tall, centered above the dealer area. On mobile, scale down to 60px.

**Files:** Create `src/components/DealerSilhouette.jsx` + CSS. Modify `src/components/DealerArea.jsx` (render silhouette behind cards).

---

### 5.2 Mob Guy Silhouette (Johnny's Sack Casino Only + Deep Debt)

A second silhouette figure — larger, more menacing — that appears in specific contexts:

**When it appears:**
1. At Johnny's Sack casino: always visible, standing slightly behind and to the right of the dealer. Represents Johnny's "associate" watching over the table.
2. At any casino when in deep debt (below -$100K): fades in gradually at the edge of the screen. Represents the loan enforcement presence.

**The silhouette:**
- Bigger than the dealer — broader shoulders, standing (not sitting)
- Arms crossed or hands in pockets
- Wearing a hat (fedora silhouette)
- At Johnny's Sack: positioned to the right of the dealer, slightly overlapping the table edge
- In deep debt mode: positioned at the far right edge of the screen, partially cut off, like someone standing just inside your peripheral vision. VERY subtle — 15-20% opacity initially, grows to 30-40% as debt deepens.

**Reactions (subtle):**
- When the player bets an asset: the figure shifts weight (translateX 3px)
- When the player takes a loan: the figure nods (translateY 2px down, then back)
- When debt exceeds -$500K: the figure takes a step closer (translateX toward center by 10px over 2 seconds)

**Implementation:**

Create `src/components/MobSilhouette.jsx`:
- Inline SVG silhouette — standing figure, hat, broad shoulders, ~6-8 path elements
- Accepts `visible`, `intensity` (0-1 for opacity scaling), `reaction` props
- Positioned fixed or absolute at the right edge of the game container
- Only rendered when at Johnny's Sack casino OR when `bankroll < -100000`

**Files:** Create `src/components/MobSilhouette.jsx` + CSS. Modify `src/components/SoloGame.jsx` (conditionally render based on casino + debt level).

---

### 5.3 Pit Boss Shadow (Optional Enhancement)

If the silhouettes work well, add a third presence: a pit boss shadow that's just a looming shadow gradient at the top of the screen. No figure — just darkness creeping in from above as debt deepens. This reinforces the UI degradation system (Tier 4 from the audit) without needing detailed SVG work.

**Implementation:** A `::before` pseudo-element on the game container with a top-down gradient from black to transparent. Opacity scales with debt: 0% at positive bankroll, 5% at -$50K, 10% at -$250K, 15% at -$1M. Controlled by the degradation tier system.

**Files:** `src/styles/degradation.css` (add pit boss shadow as a degradation tier effect)

---

### Phase 5 Verification

- At The Lounge: dealer silhouette visible behind cards. Reacts to game events (bust = head tilt, BJ = arms up).
- At Johnny's Sack: mob silhouette visible to the right. Nods when loan is taken.
- At any casino, drop below -$100K: mob silhouette fades in at the right edge.
- Drop below -$500K: mob silhouette steps closer.
- Verify silhouettes don't interfere with card readability or button tappability.
- Verify silhouettes scale appropriately on mobile (smaller, still visible).

---

## Implementation Notes for Claude Code

### Ordering is critical

Phase 1 (animations) → Phase 2 (3D perspective) → Phase 3 (themes) → Phase 4 (casinos) → Phase 5 (silhouettes)

Each phase builds on the previous. Animations must work before adding 3D perspective (perspective changes how animations render). Themes must work before casinos (casinos use themes). Silhouettes come last because they're the most experimental and depend on the 3D table space being established.

### Preserve existing functionality

Every change in this spec is ADDITIVE. Do not remove or restructure existing game logic, state management, or component architecture. The reducer, hooks, debt gate, vig system, split system, and multiplayer protocol are all correct and should not be touched except to add new state fields (theme, casino) or new action types (SET_THEME, SET_CASINO).

### Mobile-first testing

Test EVERY change on iPhone 15 Pro viewport (393x852) in Chrome DevTools. The 3D perspective and silhouettes are especially risky on mobile. If anything overflows, clips, or makes buttons untappable, fix it before moving on.

### Performance

The animation overhaul adds a lot of CSS animations. Use `will-change: transform` sparingly (only on actively animating elements, remove after animation completes). Avoid animating `width`, `height`, `margin`, or `padding` — stick to `transform` and `opacity` for GPU-accelerated rendering. Test for jank on low-end devices.

### SVG silhouettes

The dealer and mob silhouettes should be hand-crafted inline SVGs — NOT generated images, NOT external files, NOT emoji. They're simple path-based shapes (like shadow puppets). Claude Code: you're drawing these with `<svg><path d="..."/></svg>` — keep them under 15-20 path elements each. They should look like sharp, clean shadows, not detailed illustrations.

### No external dependencies

All of this is achievable with React, CSS, and inline SVG. Do NOT add any animation libraries (Framer Motion, GSAP, etc.), SVG libraries, or theming libraries. The entire app has zero runtime dependencies beyond React — keep it that way.

---

## Files Summary

### Phase 1 (Animations)
- `src/styles/animations.css` — New/updated keyframes
- `src/components/Card.jsx` + `Card.module.css` — Flip support, deal-from-shoe
- `src/components/Hand.jsx` + `Hand.module.css` — Dynamic fan adjustment
- `src/components/DealerArea.jsx` + CSS — Card shoe SVG
- `src/components/BettingCircle.jsx` + CSS — Scatter/slide chip animations
- `src/components/FlyingChip.jsx` + CSS — Rotation during flight
- `src/components/Chip.module.css` — Press feedback
- `src/components/BankrollDisplay.jsx` — Counting animation
- `src/components/DealerSpeechBubble.jsx` — Typing effect

### Phase 2 (3D & Table)
- `src/components/SoloGame.module.css` — Perspective, rail
- `src/components/MultiplayerGame.module.css` — Same
- `src/components/BettingControls.module.css` — Recessed tray
- `src/styles/theme.css` — Enhanced felt texture

### Phase 3 (Themes)
- `src/constants/themes.js` — Theme definitions (NEW)
- `src/styles/themes.css` — Theme CSS variable overrides (NEW)
- `src/reducer/initialState.js` — Add theme field
- `src/reducer/gameReducer.js` — SET_THEME action
- `src/components/Header.jsx` — Theme selector
- `src/hooks/useSessionPersistence.js` — Persist theme

### Phase 4 (Casinos)
- `src/constants/casinos.js` — Casino definitions (NEW)
- `src/components/CasinoSelect.jsx` + CSS — Selection screen (NEW)
- `src/constants/dealerLines.js` — Personality-keyed lines
- `src/utils/dealerMessages.js` — Personality param
- `src/reducer/initialState.js` — Casino field
- `src/reducer/gameReducer.js` — SET_CASINO action
- `src/components/SoloGame.jsx` — Casino config integration
- `src/components/App.jsx` — Casino select routing
- `src/hooks/useSessionPersistence.js` — Unlock progress

### Phase 5 (Silhouettes)
- `src/components/DealerSilhouette.jsx` + CSS (NEW)
- `src/components/MobSilhouette.jsx` + CSS (NEW)
- `src/components/DealerArea.jsx` — Render dealer silhouette
- `src/components/SoloGame.jsx` — Render mob silhouette conditionally
- `src/styles/degradation.css` — Pit boss shadow