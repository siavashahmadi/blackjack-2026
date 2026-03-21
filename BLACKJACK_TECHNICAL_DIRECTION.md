# BLACKJACK — Technical Direction Document

> This document is the single source of truth for the Blackjack web application. It describes the full product vision, every feature, the technical architecture, design specs, and a phased task breakdown. Feed this to Claude Code alongside CLAUDE.md to build the app incrementally.

---

## 1. Product Vision

A mobile-first (iPhone-optimized) blackjack web app with a dark casino green felt aesthetic and a core "degenerate gambling" comedy mechanic: **the player can never truly go broke.** When the bankroll hits zero, the casino extends unlimited credit, allowing the player to spiral into hilarious fictional debt — betting their watch, their car, their house, a kidney, and eventually their immortal soul. The dealer trash-talks the player throughout, loan sharks send threatening messages as debt grows, and an achievement system rewards increasingly absurd behavior.

**Phase 1** is a polished single-player experience. **Phase 2** adds real-time multiplayer so friends can play at the same virtual table from separate phones.

The app will be self-hosted on a home Ubuntu server (sia-server, <your-server-ip>) behind Nginx Proxy Manager with SSL via Cloudflare origin cert.

---

## 2. Tech Stack

### Phase 1 — Single Player (Frontend Only)
- **Framework:** React 18+ with Vite
- **Styling:** CSS variables in `theme.css` for theming + CSS Modules (`.module.css` files) for component-scoped styles. NOT CSS-in-JS inline style objects (those become unmaintainable at this scale), NOT Tailwind, NOT component libraries. Global styles (felt texture, animations, resets) go in regular `.css` files imported in `main.jsx`.
- **Fonts:** Google Fonts — Playfair Display (display/headings), DM Sans (body), JetBrains Mono (numbers/money)
- **State management:** `useReducer` for ALL game state (bankroll, hands, deck, phase, achievements — everything in Section 5.2). `useState` is allowed ONLY for local component UI concerns (animation triggers, input focus, transient visual states that don't affect game logic). If it touches the game, it goes through the reducer.
- **Build output:** Static files served by Nginx
- **No backend needed for Phase 1**

### Phase 2 — Multiplayer
- **Backend:** Python FastAPI with WebSocket support
- **Real-time comms:** WebSockets (native FastAPI WebSocket support, NOT Socket.IO)
- **Game rooms:** In-memory game state (no database needed for MVP — games are ephemeral)
- **Room codes:** 4-character alphanumeric codes for sharing (e.g., "XKCD")
- **Deployment:** Docker container on sia-server, reverse proxied through Nginx Proxy Manager
- **Optional future:** Supabase for persistent leaderboards, player stats, lifetime debt tracking

### Hosting & Infrastructure
- **Server:** Ubuntu Server 24.04 LTS (sia-server, <your-server-ip>)
- **Reverse proxy:** Nginx Proxy Manager (already running in Docker)
- **SSL:** Cloudflare origin certificate (already configured)
- **Domain:** Subdomain off siaahmadi.com (e.g., `blackjack.siaahmadi.com`) or siaa.dev when configured
- **Container:** Docker + Docker Compose for both frontend static serve and backend

---

## 3. Game Rules & Mechanics

### 3.1 Standard Blackjack Rules
- 6-deck shoe, reshuffled when fewer than ~20 cards remain (check BEFORE dealing a new hand, not mid-hand — if the deck runs low mid-hand, finish the hand first, then reshuffle before the next)
- Dealer hits on soft 17 (a soft 17 is a hand containing an Ace counted as 11 that totals 17, e.g., A+6). The dealer stands on hard 17+. This means the `handValue` function needs a companion `isSoft` check, and the dealer hit logic is: `dealerValue < 17 || (dealerValue === 17 && isSoft(dealerHand))`
- Blackjack pays 3:2 (1.5x bet). Example: $100 bet → blackjack pays $150 profit, total returned $250
- Player can: Hit, Stand, Double Down
- Double Down: doubles the bet, player receives exactly one more card, then MUST stand (auto-transitions to dealer turn)
- Double Down is only available on the first two cards (playerHand.length === 2)
- Ace counts as 11 unless that would bust the hand, then it counts as 1
- Blackjack (natural 21 on first two cards) beats a regular 21
- If both player and dealer get blackjack, it's a push
- Push returns the bet (no win, no loss)

**Edge cases to handle explicitly:**
- Player has 21 (but not blackjack, e.g., 7+7+7): game does NOT auto-stand. Player can still choose to stand. (Some variants auto-stand at 21, but we don't — let the player feel smart for standing.)
- Dealer reveals hole card: when the dealer's turn begins, the hidden card is revealed with a flip animation BEFORE the dealer starts drawing
- Multiple aces: A+A = soft 12 (one ace counts as 1, one as 11). A+A+9 = 21. A+A+A = soft 13.

### 3.2 Rules NOT Implemented (intentionally excluded for simplicity)
- No splitting pairs
- No insurance
- No surrender
- No side bets
- These can be added later but are out of scope for Phase 1 and Phase 2 MVP

### 3.3 The Debt Mechanic (Core Comedy Feature)
This is the signature feature. The rules:

1. **Starting bankroll:** $10,000
2. **Minimum bet:** $25
3. **When bankroll hits $0:** The player is NOT stopped. The game continues. The bankroll goes negative.
4. **Negative bankroll means debt.** The player owes the casino money and can keep betting.
5. **There is no floor.** The player can go to -$1,000,000 and beyond.
6. **The deeper in debt, the more the UI reacts:**
   - Bankroll text turns red when negative
   - Bankroll amount element shakes/pulses when in debt (NOT the whole screen — just the number itself)
   - The "DEAL" / "Next Hand" button text changes contextually
   - Loan shark messages appear at debt milestones
   - The app subtitle changes dynamically
7. **The player can always bet.** Even with $0 or -$500,000, they can place a bet. The casino is a predatory lender with infinite patience.

### 3.4 Asset Betting System
When the player is in enough debt, they unlock the ability to bet physical possessions. Each asset has a **debt threshold** — it only becomes available when the player's bankroll drops below that threshold. This creates a progression of desperation.

**Asset list (in order of escalation):**

| Asset | Emoji | Value | Unlocks At |
|-------|-------|-------|------------|
| Your Watch | ⌚ | $500 | $0 (broke) |
| Your Jewelry | 💍 | $2,000 | -$500 |
| Your Tesla Model 3 | 🚗 | $35,000 | -$2,000 |
| A Kidney | 🫘 | $50,000 | -$10,000 |
| Your House | 🏠 | $250,000 | -$30,000 |
| Your Immortal Soul | 👻 | $666,666 | -$200,000 |

**Rules for asset betting:**
- Assets can be bet DURING a hand (after cards are dealt) or added to a bet before dealing — both should work
- If the player wins, the asset is returned AND they win the cash value
- If the player loses, the asset is gone permanently (for that session)
- If it's a push, the asset is returned
- Multiple assets can be bet on a single hand
- Once an asset is lost, it cannot be bet again (it's gone)
- On game reset, all assets are restored

**UI for asset betting:**
- An "Asset Betting" section appears contextually when assets are available
- It should be collapsible/expandable since it's not always relevant
- Each asset shows its emoji, name, and cash value
- Tapping an asset adds it to the current bet immediately
- There should be a confirmation step or at minimum a satisfying animation when betting a high-value asset (house, soul)

### 3.5 Dealer Trash Talk System
The dealer is a sarcastic, condescending AI character who comments on the player's decisions. This is NOT an AI API call — it's pre-written lines selected randomly based on game events.

**Trigger categories and approximate line counts (aim for 8-12 per category):**

| Trigger | When | Tone |
|---------|------|------|
| `playerLose` | Player loses a normal hand | Mocking, condescending |
| `playerBust` | Player busts (goes over 21) | "I told you so" energy |
| `playerBroke` | Player hits $0 for the first time | Dark humor, casino predator |
| `playerDebt` | Player is in debt and starts a new hand | Threatening but funny |
| `assetBet` | Player bets a physical asset | Disbelief, excitement, popcorn-eating |
| `playerWin` | Player wins a hand | Grudging, salty |
| `playerBlackjack` | Player gets a natural 21 | Impressed but backhanded |
| `bigBet` | Player bets more than $5,000 (and has positive bankroll) | Hype man energy |
| `doubleDownLoss` | Player loses after doubling down | Extra salt in the wound |
| `winStreak` | Player wins 3+ in a row | Nervous dealer, "this won't last" |
| `loseStreak` | Player loses 3+ in a row | Fake sympathy, enjoying it |
| `assetLost` | Player loses a hand where an asset was bet | Dramatic, "oh no... anyway" |
| `greeting` | Game start / new session | Welcoming but ominous |
| `deepDebt` | Player is more than $100k in debt | Existential dread humor |

**Implementation notes:**
- Store lines in a separate constants file (e.g., `src/constants/dealerLines.js`)
- Lines should be easily extensible — just add strings to arrays
- No line should repeat until all lines in that category have been shown (track shown indices)
- Some lines can reference the player's specific situation (template literals): "You just bet your Tesla. A *2025* Tesla. Bro."
- The speech bubble should have a subtle typing/fade-in animation when new text appears

### 3.6 Loan Shark Message System
Threatening/funny popup notifications that appear at specific debt milestones. These escalate in severity and absurdity.

**Milestone messages:**

| Debt Threshold | Message |
|----------------|---------|
| -$1,000 | 📱 Text from unknown number: "We know where you live." |
| -$5,000 | 📱 Text from Tony: "Nice kneecaps. Would be a shame if..." |
| -$10,000 | 🚪 Someone knocked on your door. Nobody was there. Just a dead fish on the welcome mat. |
| -$25,000 | 🚗 A black SUV has been parked outside your house for 3 days. |
| -$50,000 | 📞 Voicemail from Mom: "Honey, some men in suits came asking about you..." |
| -$100,000 | 📰 Local news: "Missing persons report filed by concerned friends." |
| -$250,000 | 🏦 Your bank account has been frozen. Your credit cards are confetti. |
| -$500,000 | 🔥 Your credit score just caught fire. |
| -$1,000,000 | 👑 Congrats! You've been crowned King of Bad Decisions. |
| -$5,000,000 | 🌍 You now owe more than the GDP of some small nations. The IMF is concerned. |
| -$10,000,000 | 🛸 At this point, only aliens can save you. |

**Implementation notes:**
- Each message shows ONCE per session (track seen thresholds)
- Appears as a popup/toast that auto-dismisses after 4-5 seconds OR can be tapped to dismiss
- Should have a menacing visual treatment (dark red background, subtle glow)
- Can queue multiple if the player blows through several thresholds in one hand

### 3.7 Achievement System
Unlockable achievements that reward specific behaviors. Displayed as toast notifications when earned and viewable in a full achievements panel.

**Achievement list:**

| ID | Name | Description | Emoji | Trigger |
|----|------|-------------|-------|---------|
| `first_hand` | First Timer | Play your first hand | 🃏 | Complete 1 hand |
| `first_loss` | Welcome to Vegas | Lose your first hand | 🎰 | Lose 1 hand |
| `first_win` | Beginner's Luck | Win your first hand | ✨ | Win 1 hand |
| `broke` | Flat Broke | Hit $0 | 💸 | Bankroll reaches 0 |
| `deep_debt` | In Too Deep | Owe more than $50,000 | 🕳️ | Bankroll < -$50,000 |
| `million_debt` | National Debt | Owe more than $1,000,000 | 🇺🇸 | Bankroll < -$1,000,000 |
| `bet_watch` | Time's Up | Bet your watch | ⌚ | Bet watch asset |
| `bet_car` | Walking Home | Bet your Tesla | 🚗 | Bet car asset |
| `bet_kidney` | Organ Donor | Bet a kidney | 🫘 | Bet kidney asset |
| `bet_house` | Homeless by Choice | Bet your house | 🏠 | Bet house asset |
| `bet_soul` | Deal With the Devil | Bet your soul | 😈 | Bet soul asset |
| `lose_everything` | Rock Bottom | Lose all assets | 📦 | All 6 assets lost |
| `comeback` | Comeback Kid | Win a hand after being in debt | 🔥 | Win while bankroll < 0 |
| `win_streak_5` | Hot Hand | Win 5 hands in a row | ✋ | Win streak = 5 |
| `win_streak_10` | On Fire | Win 10 hands in a row | 🔥 | Win streak = 10 |
| `lose_streak_5` | Down Bad | Lose 5 hands in a row | 📉 | Lose streak = 5 |
| `lose_streak_10` | Free Fall | Lose 10 hands in a row | 💀 | Lose streak = 10 |
| `double_down_loss` | Double the Pain | Lose a double down | 😭 | Lose after doubling |
| `double_down_win` | Big Brain Move | Win a double down | 🧠 | Win after doubling |
| `blackjack` | Natural! | Get a blackjack | 🃏 | Natural 21 |
| `hands_50` | Regular | Play 50 hands | 🪑 | Hands played = 50 |
| `hands_100` | Addict | Play 100 hands | 🎰 | Hands played = 100 |
| `all_in_win` | YOLO | Go all-in and win | 🎲 | Player used the ALL_IN action (not just manually stacked to bankroll amount) and won |
| `all_in_loss` | Wipeout | Go all-in and lose | 💥 | Player used the ALL_IN action and lost |

**Implementation notes:**
- Achievements are checked after every hand resolution
- Toast appears at top of screen, auto-dismisses after 3 seconds
- Achievement panel is a full-screen overlay toggled from the header
- Locked achievements shown grayed out with "???" or dimmed
- Store in a separate file (e.g., `src/constants/achievements.js`)
- Track unlocked achievements in game state
- Persist to localStorage so achievements survive page refresh (but NOT game resets — reset clears them)

### 3.8 Dynamic UI Reactions
The app's UI should react to the player's financial situation:

**App subtitle (below logo):**
- Bankroll > $10,000: "HIGH ROLLER"
- Bankroll $1,000-$10,000: "HIGH STAKES"
- Bankroll $0-$1,000: "LAST STAND"
- Bankroll $0 to -$10,000: "DEBT ACCUMULATOR"
- Bankroll -$10,000 to -$100,000: "FINANCIAL RUIN SIMULATOR"
- Bankroll < -$100,000: "ROCK BOTTOM SPEEDRUN"
- Bankroll < -$1,000,000: "ECONOMIC DISASTER"

**"Next Hand" button text:**
- Bankroll > $0: "NEXT HAND"
- Bankroll $0 to -$10,000: "BET AGAIN (WHY NOT)"
- Bankroll -$10,000 to -$100,000: "KEEP DIGGING 🕳️"
- Bankroll < -$100,000: "ONE MORE. JUST ONE MORE."
- Bankroll < -$1,000,000: "THIS IS FINE 🔥"

**Bankroll display animations (IMPORTANT — only the bankroll element shakes, NOT the entire screen):**
- Bankroll > 0: Normal gold color, no animation
- Bankroll = 0: Red color, single pulse
- Bankroll < 0: Red color, gentle pulse glow
- Bankroll < -$10,000: Red color, stronger pulse glow
- Bankroll < -$50,000: Red color, pulse glow + subtle shake on the bankroll number only
- Bankroll < -$100,000: Red color, aggressive pulse glow + shake on bankroll number only

**Bet/Deal button shake:**
- When bankroll < -$10,000: The "DEAL" button should have a very subtle shake or wobble animation to suggest instability/bad decision-making. This is a gentle nudge, not distracting.

---

## 4. Design Specification

### 4.1 Overall Aesthetic
**Casino green felt** — the app should feel like you're looking down at a green felt blackjack table in a dimly-lit high-end casino. Dark, rich, moody. Gold accents for text and highlights. Red for danger/debt states.

### 4.2 Color Palette
```
--felt-dark:        #0c200c       /* Darkest background */
--felt-mid:         #143a14       /* Mid-tone felt */
--felt-light:       #1a5a1a       /* Lighter felt for surfaces */
--felt-highlight:   #2a7a2a       /* Highlighted felt areas */
--felt-texture:     #1e4e1e       /* Texture overlay color */
--gold:             #f0c850       /* Primary accent — text, borders, chips */
--gold-dim:         #d4a832       /* Dimmer gold for secondary elements */
--gold-glow:        rgba(240, 200, 80, 0.3)  /* Gold glow effects */
--card-white:       #f5f0e8       /* Card face background — warm white */
--card-red:         #cc3333       /* Hearts and diamonds */
--card-black:       #1a1a2e       /* Spades and clubs */
--danger:           #e74c3c       /* Debt, warnings, losses */
--danger-glow:      rgba(231, 76, 60, 0.4)
--success:          #27ae60       /* Wins, hit button */
--text-primary:     #e8e0d0       /* Main text — warm off-white */
--text-dim:         rgba(232, 224, 208, 0.5)  /* Secondary/label text */
--surface:          rgba(0, 0, 0, 0.25)       /* Card/panel backgrounds */
```

### 4.3 The Felt Texture
The background should NOT be a flat gradient. It should simulate green felt:
- Use a layered approach: dark green base + subtle noise/grain texture overlay + radial gradient for the "table spotlight" effect (lighter in center, darker at edges)
- CSS approach: Use a pseudo-element or layered `background` with a noise SVG filter or a repeating subtle pattern
- The felt should feel tactile — like you could reach out and touch the baize
- Reference: Look at real casino table felt — it has a subtle fibrous texture with slight color variation

### 4.4 Typography
- **Logo/Headers:** Playfair Display (900 weight) — elegant, high-contrast serif
- **Body text/UI:** DM Sans (400, 500, 700) — clean, readable
- **Numbers/Money:** JetBrains Mono (500, 700) — monospace for financial figures
- All monetary values use JetBrains Mono so digits align properly and feel "financial"

### 4.5 Card Design
Cards are a critical visual element and need to be **larger and more readable** than the initial prototype.

**Card dimensions:**
- Width: 70px minimum, ideally 75px
- Height: proportional (roughly 1.45:1 ratio), so ~105-110px
- On very small screens (< 375px width), scale down proportionally but never below 60px wide

**Card face:**
- Warm white background (#f5f0e8) with subtle gradient for depth
- Rounded corners (10px radius)
- Drop shadow for "lifted off the table" effect
- Rank font size: **18-20px** (must be easily readable at arm's length)
- Suit font size: Small in corners (12px), large center suit (34-36px)
- Red suits (♥♦) use `--card-red`, black suits (♠♣) use `--card-black`

**Card back:**
- Dark blue/navy gradient with a subtle pattern
- Should feel like a premium card back — not just a flat color

**Card dealing animation:**
- Cards slide in from off-screen (top) with a slight rotation
- Staggered timing: each card animates 150ms after the previous
- Use CSS `@keyframes` with `animation-delay`, not JS timeouts for the visual animation
- Easing: `cubic-bezier(0.23, 1, 0.32, 1)` (smooth deceleration)

### 4.6 Layout (Mobile-First)
The app is designed for iPhone screens (375px - 430px width). Everything must fit without horizontal scrolling.

**Vertical layout (top to bottom):**
1. **Header bar** — Logo left, achievements count + reset button right. Thin gold border bottom.
2. **Bankroll display** — Centered. Large bankroll number. Debt warning below if applicable.
3. **Dealer area** — "DEALER" label, speech bubble with trash talk, dealer's cards fanned out, dealer hand value.
4. **Betting circle** — Centered on the felt between dealer and player. Shows stacked chips during betting and while hand is in play. Shows current bet total. During result phase, chips animate away (win) or disappear (loss).
5. **Result banner** — Only visible during result phase. Full-width colored banner with result text. Overlays or sits between the betting circle and player area.
6. **Player area** — Player's cards fanned out, player hand value, "YOUR HAND" label.
7. **Chip tray + controls** — During betting: chip tray (row of tappable chips) + DEAL button + ALL IN shortcut + undo/clear. During play: Hit / Stand / Double Down buttons (chip tray hidden). During result: "NEXT HAND" button.

**The chip tray + controls area should always be anchored to the bottom** of the viewport (but not fixed — it should scroll with content if the content is tall enough). Use `padding-bottom: env(safe-area-inset-bottom)` for iPhone home indicator spacing.

**Card fanning:**
- Cards should overlap when there are 3+ cards to prevent horizontal overflow
- Dynamic overlap based on card count (critical for mobile — 75px cards on a 375px screen):
  - 2 cards: 10px gap (no overlap, side by side)
  - 3 cards: 0px gap (touching)
  - 4 cards: -15px margin (slight overlap)
  - 5 cards: -25px margin (moderate overlap)
  - 6+ cards: -35px margin (tight overlap, but rank/suit corner still visible)
- Calculate dynamically: `marginLeft = Math.min(10, (containerWidth - 75) / (cardCount - 1) - 75)` clamped to reasonable range
- Each subsequent card should have a slightly higher z-index so it overlaps the previous one naturally
- The hand container should center the card fan horizontally

### 4.7 Button Design
- **Primary action (DEAL, NEXT HAND):** Gold gradient background, dark text, large (full-width or near), 14-16px padding, bold serif font, subtle gold glow shadow
- **Hit:** Green gradient, white text
- **Stand:** Red gradient, white text
- **Double Down:** Purple gradient, white text
- **All In:** Red gradient, white text, smaller than DEAL
- All buttons: 12px border radius, no outlines, active states that scale down slightly (transform: scale(0.97))
- Buttons should feel tappable — minimum 44px touch target height (Apple HIG)

### 4.8 Chip Betting System (Tap-to-Stack)
This is the primary betting interface. It mimics real casino betting: you tap chips from your chip tray, they animate into the betting circle on the table, and your bet accumulates. This replaces any text input or radio-button chip selection.

**How it works:**
1. A **betting circle** is visible on the felt in the center of the table during the betting phase. It's a circular area (outlined, like a real table's bet spot) where chips stack up.
2. Below the table area, a **chip tray** displays the available chip denominations in a horizontal row.
3. **Tapping a chip** in the tray animates a copy of that chip flying up into the betting circle. The bet total increases by that chip's value. A satisfying little bounce/land animation plays when the chip arrives.
4. **Chips stack visually** in the betting circle — slightly offset so you can see multiple chips piled up (like a real chip stack, with each chip ~3-4px offset upward from the one below).
5. **Tapping the betting circle** (or a clear/undo button) removes the last chip added and animates it back to the tray. The bet total decreases accordingly.
6. Once the player is happy with their bet, they tap the **DEAL** button to start the hand.
7. During the hand, the chip stack stays visible in the betting circle as a reminder of what's at stake.
8. On win, chips animate from the circle splitting — the original bet stays, and winnings "appear" next to it, then all chips fly to the player's side. On loss, chips animate away (fade out or fly to the dealer side).

**Chip denominations and colors:**

| Value | Label | Color Scheme |
|-------|-------|-------------|
| $25 | 25 | Green with white edge stripes |
| $100 | 100 | Black with white edge stripes |
| $500 | 500 | Purple with white edge stripes |
| $1,000 | 1K | Orange/gold with white edge stripes |
| $5,000 | 5K | Red with white edge stripes |
| $25,000 | 25K | Light blue/cyan with white edge stripes (unlocks when bankroll < -$5,000 — for degenerate betting) |

**Chip visual design:**
- Each chip is ~52-56px diameter in the tray, slightly smaller (~36-40px) when stacked in the betting circle
- Circular with a dashed/dotted border pattern around the edge (like real casino chips)
- Value text centered, using JetBrains Mono bold
- The chip tray has a slight recessed/shadowed look, like a real table's chip rail
- Active chip (last tapped) has a subtle glow to indicate it's the "selected" denomination for rapid tapping

**Betting circle design:**
- Circular, ~120px diameter, positioned between the dealer and player card areas
- Thin gold dashed border when empty (invitation to bet)
- As chips are added, the border fades and the chip stack becomes the visual
- The current bet total is displayed below or inside the circle in JetBrains Mono
- On hover/hold: show a "tap to undo" hint

**Rapid tapping:**
- Players should be able to tap a chip repeatedly to quickly add multiples (e.g., tap $100 five times = $500 bet)
- Each tap should feel responsive — the chip animation should start immediately even if the previous one hasn't finished landing
- A subtle haptic feedback (if supported via `navigator.vibrate`) on each tap

**ALL IN shortcut:**
- A small "ALL IN" button (or double-tap the betting circle) that fills the circle with chips equal to the entire bankroll
- When bankroll is negative (debt), "ALL IN" bets whatever the minimum is since there's nothing to go all-in with — but the player can still stack chips freely because the casino extends credit

**No bet cap when in debt:**
- There is NO maximum bet, ever. A player at -$500,000 can still stack $5K chips 100 times for a $500,000 bet. The casino doesn't care. This is intentional and critical to the comedy.
- The only validation: total bet must be >= MIN_BET ($25) when DEAL is pressed.

**When do dealer trash talk triggers fire relative to chips?**
- `bigBet` triggers when the DEAL action is dispatched and `currentBet > $5,000`, NOT during chip stacking. The dealer reacts to the committed bet, not the assembly process.

**Undo / Clear:**
- Single tap on the betting circle or a small "↩" undo button removes the last chip
- Long press or a "CLEAR" button removes all chips from the circle
- Chips animate back to the tray when removed

**State tracking for chip stacks:**
- The bet is tracked as an array of chip values, not just a total: `chipStack: [100, 100, 500, 25]` → total bet of $725
- This allows proper undo (pop the last chip) and visual rendering (know exactly which chips to show)
- On DEAL, the chipStack is locked in and the total becomes `currentBet`

**Animation specs:**
- Chip tray → circle: 250ms ease-out with slight arc (not a straight line — use a CSS animation with translateX + translateY + scale, or a simple quadratic bezier if using JS)
- Chip land: tiny bounce (scale 1 → 1.1 → 1 over 100ms)
- Chip undo (circle → tray): 200ms ease-in, reverse arc
- Chip stack offset: each chip in the stack is offset 3px up and 1px right from the one below (creates a 3D stack illusion)
- Win animation: chips spread outward briefly then fly toward player side
- Loss animation: chips fade out or get swept away toward dealer side

**Visual stack cap:**
- Max 12 chips displayed in the stack. If more than 12 chips are bet, show the top 12 with a "×N" multiplier badge (e.g., if 30 chips are stacked, show 12 chips with "×30" badge)
- This prevents the stack from growing absurdly tall and overflowing the betting circle
- The total bet amount displayed below the circle is always accurate regardless of visual cap

**Asset betting + chip circle interaction:**
- When an asset is bet, it appears as a special "asset chip" in the betting circle — a chip-sized circle with the asset's emoji instead of a dollar value
- Asset chips sit on TOP of the regular chip stack (visually distinct — slightly larger, gold border, glowing)
- The bet total below the circle updates to include the asset's cash value
- Asset chips cannot be undone with the normal undo — they have their own remove button (tap the asset chip itself) or are committed once DEAL is pressed

**Chip clear animation timing (IMPORTANT):**
- When RESOLVE_HAND fires, the reducer clears `chipStack` from state — but the UI needs time to animate chips away
- Use a `resultAnimating` boolean in local component state (NOT the reducer) that delays the visual removal by ~800ms
- Sequence: result announced → chips animate out (800ms) → chipStack visually clears → "NEXT HAND" button appears
- This prevents the jarring instant-disappearance of chips when the reducer state updates

### 4.9 Responsive Considerations
- Max container width: 480px, centered on larger screens
- Min supported width: 320px (iPhone SE)
- Test targets: iPhone 15 Pro (393px), iPhone 15 Pro Max (430px), iPhone SE (375px)
- No horizontal scrolling ever
- Ensure the full betting UI + action buttons are visible without scrolling on iPhone 15 Pro in portrait mode
- Use `dvh` (dynamic viewport height) instead of `vh` to account for Safari's address bar

### 4.10 Vertical Space Budget (CRITICAL for iPhone)
With the betting circle added between dealer and player areas, vertical space is tight. On an iPhone 15 Pro in Safari (roughly 660px usable viewport), every pixel counts.

**Approximate height budget:**
- Header: 44px
- Bankroll display: 60px (can compress to 48px if needed)
- Dealer area (label + speech bubble + cards + value): ~180px
- Betting circle: ~130px (circle + bet total below)
- Player area (cards + value + label): ~140px
- Controls (chip tray + DEAL button OR action buttons): ~120px
- Safe area padding: ~34px
- **Total: ~708px** — tight but workable

**Compression strategies if it doesn't fit:**
- Speech bubble can collapse to a single line with horizontal scroll/truncation
- Bankroll display can be inline in the header instead of its own section
- Betting circle can shrink to 100px diameter
- Card areas can overlap slightly with the betting circle (z-index layering)
- Dealer label ("DEALER") and player label ("YOUR HAND") can be smaller (8px) or hidden

**Test this early.** Task 1.5 should verify the full layout fits on-screen before adding features.

### 4.11 PWA & Meta Tags
Since this will be played on iPhones via Safari, include these for a native-app feel:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#0c200c">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="manifest" href="/manifest.json">
```

Include a basic `manifest.json` in `public/` so John (or anyone) can "Add to Home Screen" and it launches fullscreen without Safari chrome. This makes it feel like a real app.

### 4.12 Sound Effects (Optional — Task 1.10)
Subtle audio feedback makes the chip system feel tactile. All sounds should be short (<500ms) and low-volume by default.

**Sound list:**
- `chip_place.mp3` — Ceramic chip clack, plays on each ADD_CHIP
- `chip_stack.mp3` — Slightly different clack for stacking on existing chips
- `card_deal.mp3` — Card sliding sound, plays on each card dealt
- `card_flip.mp3` — Card flip sound, plays when dealer hole card is revealed
- `win.mp3` — Subtle cash register ding or coin sounds
- `lose.mp3` — Low, muted thud
- `blackjack.mp3` — Celebratory but brief jingle
- `bust.mp3` — Dramatic descending tone

**Implementation notes:**
- Use the Web Audio API, NOT `<audio>` elements (better performance, lower latency)
- **Mobile Safari requires a user gesture before audio can play.** Initialize the AudioContext on the first tap (DEAL button or first chip tap). Don't try to play sounds before user interaction.
- Include a mute/unmute toggle in the header (🔊/🔇)
- Sound files go in `public/sounds/`
- Sounds are optional/nice-to-have — the app must work perfectly without them
- Add a `muted: boolean` to the game state to persist mute preference

### 4.13 Session Persistence
**What persists across page refresh (localStorage):**
- Unlocked achievements
- Mute preference
- Highest debt reached (for bragging rights)

**What does NOT persist (resets on refresh):**
- Bankroll (fresh $10,000 each session)
- Owned assets (all restored)
- Hands played, streaks
- Current game state

**Rationale:** Each session is a fresh gambling run. This keeps the "spiral into debt" arc replayable and funny every time. Achievements persist so there's a long-term meta-progression. If a player wants to show John their achievement list, it survives closing the tab.

---

## 5. State Management Architecture

### 5.1 Why useReducer
The original version of this app had a critical bug: scattered `useState` calls caused race conditions where the bankroll wouldn't update correctly after a loss — the player could keep their previous bet even at $0. 

Think of it like this: `useState` is like having 15 different people each holding one piece of information about the game, and you have to yell at each one individually to update. `useReducer` is like having one person (the reducer) who holds the entire game state and processes changes one at a time in order. No race conditions, no stale state.

### 5.2 Game State Shape
```typescript
interface GameState {
  // Deck
  deck: Card[];
  
  // Hands
  playerHand: Card[];
  dealerHand: Card[];
  
  // Money
  bankroll: number;          // Can be negative (debt)
  currentBet: number;        // Total bet once hand is dealt (sum of chipStack at deal time)
  chipStack: number[];       // Array of chip values in the betting circle, e.g. [100, 100, 500] = $700
  selectedChipValue: number; // Currently selected chip denomination for rapid tapping (default: 100)
  
  // Assets
  ownedAssets: Record<AssetId, boolean>;
  bettedAssets: Asset[];     // Assets wagered on current hand
  
  // Game flow
  phase: 'betting' | 'playing' | 'dealerTurn' | 'result';
  result: null | 'win' | 'lose' | 'bust' | 'dealerBust' | 'push' | 'blackjack';
  isDoubledDown: boolean;        // Whether the current hand was doubled down (for achievements + dealer lines)
  isAllIn: boolean;              // Whether the player used ALL_IN action this hand (for achievements)
  
  // Dealer
  dealerMessage: string;
  
  // Stats
  handsPlayed: number;
  winStreak: number;
  loseStreak: number;
  totalWon: number;
  totalLost: number;
  peakBankroll: number;
  lowestBankroll: number;
  
  // Systems
  unlockedAchievements: string[];
  seenLoanThresholds: number[];
  shownDealerLines: Record<string, number[]>;  // Track shown lines per category
  
  // UI
  showAssetMenu: boolean;
  showAchievements: boolean;
  achievementQueue: Achievement[];
  loanSharkMessage: string | null;
  muted: boolean;                // Sound mute preference (persisted to localStorage)
}
```

### 5.3 Action Types
```typescript
type GameAction =
  | { type: 'ADD_CHIP'; value: number }         // Tap a chip → add to betting circle stack
  | { type: 'UNDO_CHIP' }                       // Tap betting circle → remove last chip
  | { type: 'CLEAR_CHIPS' }                     // Long press / clear → remove all chips
  | { type: 'SELECT_CHIP'; value: number }       // Select active chip denomination for rapid tapping
  | { type: 'ALL_IN' }                           // Fill chips to match entire bankroll (or min bet if in debt)
  | { type: 'DEAL'; cards: Card[] }              // Lock in chipStack as currentBet, deal cards (pass 4 cards: p1, d1, p2, d2)
  | { type: 'BET_ASSET'; asset: Asset }
  | { type: 'HIT'; card: Card }                   // Draw one card for player (pass the card in)
  | { type: 'STAND' }
  | { type: 'DOUBLE_DOWN'; card: Card }            // Double bet, draw one card (pass it in)
  | { type: 'DEALER_DRAW'; card: Card }
  | { type: 'RESOLVE_HAND'; outcome: Outcome }
  | { type: 'NEW_ROUND' }
  | { type: 'RESET_GAME' }
  | { type: 'TOGGLE_ASSET_MENU' }
  | { type: 'TOGGLE_ACHIEVEMENTS' }
  | { type: 'DISMISS_ACHIEVEMENT' }
  | { type: 'DISMISS_LOAN_SHARK' }
  | { type: 'UNLOCK_ACHIEVEMENT'; id: string }
```

### 5.4 Key Reducer Rules
1. **ADD_CHIP** pushes the chip value onto `chipStack` array. No bankroll validation — debt is allowed. Triggers a dealer comment if bet is getting large.
2. **UNDO_CHIP** pops the last value from `chipStack`. If stack is empty, no-op.
3. **CLEAR_CHIPS** resets `chipStack` to `[]`.
4. **ALL_IN** fills `chipStack` with chips that sum to the player's bankroll (use largest denominations first for efficient stacking). If bankroll <= 0, adds a single MIN_BET chip (casino extends credit).
5. **DEAL** must validate that `chipStack` is not empty (total >= MIN_BET). Sets `currentBet` = sum of `chipStack`. Receives 4 pre-drawn cards in the action payload (`cards[0]` = player1, `cards[1]` = dealer1, `cards[2]` = player2, `cards[3]` = dealer2). Transitions to 'playing' phase. Does NOT clear `chipStack` — the visual stack stays in the betting circle during the hand. The component is responsible for drawing cards from deck and passing them in.
6. **DEAL** checks for natural blackjack immediately after dealing.
7. **HIT** receives a pre-drawn card in the action payload and adds it to playerHand. If hand value > 21, auto-transitions to bust.
8. **STAND** transitions to 'dealerTurn' phase.
9. **DOUBLE_DOWN** doubles `currentBet`, receives a pre-drawn card in the action payload, adds it to playerHand, sets `isDoubledDown = true`. If bust, transitions to bust. Otherwise transitions to dealerTurn (player MUST stand after double — no more hitting).
10. **RESOLVE_HAND** is the critical action — it calculates payout, updates bankroll, clears `chipStack`, checks achievements, checks loan shark thresholds, selects dealer message, returns/loses betted assets.
11. **NEW_ROUND** resets hand-specific state (hands, chipStack, currentBet, bettedAssets) but preserves bankroll, assets, achievements, stats. Sets `selectedChipValue` to the last used value (convenience for rapid replaying).
12. **RESET_GAME** returns everything to initial state.

### 5.5 Deck Management (Important Pattern)
The reducer is pure, but the deck is part of the game state. Here's how to reconcile:

1. The `deck` array lives in the reducer state
2. A helper hook or function (`useCardDraw`) reads the current deck from state
3. When the component needs to deal/hit/draw, it calls a wrapper function that:
   - Reads the top card(s) from `state.deck`
   - Dispatches the action WITH those cards as payload
4. The reducer receives the cards in the action, adds them to the appropriate hand, and removes them from the deck
5. If the deck is low (< 20 cards), the reducer creates a fresh shuffled deck (this is the ONE exception where randomness is in the reducer — deck reshuffling). Alternatively, check deck size in the component before dispatching and dispatch a RESHUFFLE action first.

**Recommended approach (simplest):** Create a helper in `App.jsx`:
```javascript
const drawCards = (count) => {
  // Read from current state, return cards
  // The reducer will remove them from deck when it processes the action
};

// Usage:
const handleDeal = () => {
  const cards = drawCards(4);
  dispatch({ type: 'DEAL', cards });
};
```

The key insight: **the component picks the cards, the reducer processes them.** This keeps the reducer deterministic and testable.

### 5.6 Dealer Turn Logic
The dealer turn should be animated with sequential card draws (one every 600ms). This should be handled OUTSIDE the reducer via a `useEffect` or callback that dispatches DEALER_DRAW actions in sequence, then dispatches RESOLVE_HAND when the dealer stands or busts.

```
function useDealerTurn(state, dispatch) {
  useEffect(() => {
    if (state.phase !== 'dealerTurn') return;
    
    const dealerValue = handValue(state.dealerHand);
    const soft = isSoft(state.dealerHand);
    
    // Dealer hits on soft 17, stands on hard 17+
    if (dealerValue < 17 || (dealerValue === 17 && soft)) {
      const timeout = setTimeout(() => {
        dispatch({ type: 'DEALER_DRAW', card: drawFromDeck(state.deck) });
      }, 600);
      return () => clearTimeout(timeout);
    } else {
      // Dealer stands — resolve
      const timeout = setTimeout(() => {
        const outcome = determineOutcome(state.playerHand, state.dealerHand);
        dispatch({ type: 'RESOLVE_HAND', outcome });
      }, 400);
      return () => clearTimeout(timeout);
    }
  }, [state.phase, state.dealerHand]);
}
```

---

## 6. File / Folder Structure

```
blackjack/
├── CLAUDE.md                    # Claude Code project instructions
├── BLACKJACK_TECHNICAL_DIRECTION.md  # This document
├── package.json
├── vite.config.js
├── index.html
├── public/
│   ├── favicon.svg              # Spade emoji or custom icon
│   ├── manifest.json            # PWA manifest for Add to Home Screen
│   ├── icon-192.png             # App icon (192x192)
│   └── sounds/                  # Sound effect files (Task 1.10)
│       ├── chip_place.mp3
│       ├── card_deal.mp3
│       ├── card_flip.mp3
│       ├── win.mp3
│       ├── lose.mp3
│       └── blackjack.mp3
├── src/
│   ├── main.jsx                 # Entry point, renders <App />
│   ├── App.jsx                  # Root component, holds game state via useReducer
│   ├── reducer/
│   │   ├── gameReducer.js       # Main reducer function
│   │   ├── initialState.js      # Default state factory
│   │   └── actions.js           # Action creator helpers (optional)
│   ├── hooks/
│   │   ├── useDealerTurn.js     # Handles animated dealer card drawing
│   │   ├── useAchievements.js   # Achievement checking logic
│   │   └── useLoanShark.js      # Loan shark message triggering
│   ├── components/
│   │   ├── Card.jsx             # Single playing card
│   │   ├── Hand.jsx             # Fan of cards with value display
│   │   ├── DealerArea.jsx       # Dealer hand + speech bubble
│   │   ├── PlayerArea.jsx       # Player hand
│   │   ├── BettingCircle.jsx    # The circular bet spot on the felt — shows chip stack + bet total
│   │   ├── ChipTray.jsx         # Row of tappable chip denominations at the bottom
│   │   ├── Chip.jsx             # Single chip component (used in both tray and betting circle)
│   │   ├── BettingControls.jsx  # Wraps ChipTray + DEAL button + ALL IN + undo/clear + asset betting
│   │   ├── ActionButtons.jsx    # Hit / Stand / Double Down
│   │   ├── ResultBanner.jsx     # Win/Lose/Push overlay
│   │   ├── BankrollDisplay.jsx  # Bankroll with animations
│   │   ├── Header.jsx           # Logo, subtitle, achievement count, reset
│   │   ├── AchievementToast.jsx # Pop-up notification
│   │   ├── AchievementPanel.jsx # Full achievement list overlay
│   │   └── LoanSharkPopup.jsx   # Threatening message popup
│   ├── constants/
│   │   ├── cards.js             # SUITS, RANKS arrays (data only — no functions)
│   │   ├── chips.js             # Chip denominations, colors, unlock thresholds
│   │   ├── assets.js            # Asset definitions and thresholds
│   │   ├── achievements.js      # Achievement definitions
│   │   ├── dealerLines.js       # All dealer trash talk lines by category
│   │   ├── loanSharkMessages.js # Debt milestone messages
│   │   └── gameConfig.js        # STARTING_BANKROLL, MIN_BET, etc.
│   ├── utils/
│   │   ├── cardUtils.js         # createDeck, shuffle, handValue, isSoft, isBlackjack, cardValue
│   │   └── formatters.js        # formatMoney, pickRandom, etc.
│   └── styles/
│       ├── theme.css            # CSS variables, global styles, felt texture
│       └── animations.css       # All @keyframes definitions
├── Dockerfile                   # Multi-stage: build + nginx serve
├── nginx.conf                   # Nginx config for SPA routing (try_files, gzip, cache headers)
├── docker-compose.yml           # For deployment on sia-server
└── server/                      # Phase 2 only — don't create until Task 2.1
    ├── Dockerfile
    ├── requirements.txt         # fastapi, uvicorn, websockets
    ├── main.py                  # FastAPI app with WebSocket endpoints
    ├── game_logic.py            # Deck, hand evaluation (Python port of cardUtils.js)
    └── game_room.py             # GameRoom and PlayerState classes
```

---

## 7. Design Critiques & Fixes (From Playtesting)

These are specific issues identified during initial playtesting that MUST be addressed:

### 7.1 Screen Shake — FIXED SCOPE
**Problem:** When in debt, the ENTIRE screen shakes. This is disorienting and annoying during gameplay.
**Fix:** Only the **bankroll number** and the **DEAL/bet button** should shake. Nothing else. The shake should be subtle — a gentle wobble, not an earthquake. Use CSS `animation` on those specific elements only, not on the container.

### 7.2 Asset Emoji Bar — REMOVED
**Problem:** The row of asset emojis at the bottom of the screen (showing owned vs lost assets) was not useful and took up space.
**Fix:** Remove the bottom asset emoji bar entirely. Asset status is already communicated through the asset betting menu. If we want a persistent indicator, consider a small counter in the header like "Assets: 4/6" — but not a priority.

### 7.3 Cards Too Small
**Problem:** Cards were too small and numbers on them were hard to read, especially on mobile.
**Fix:** Increase card size to minimum 70-75px wide, 105-110px tall. Increase rank font size to 18-20px. Increase center suit size to 34-36px. See Section 4.5 for full spec.

### 7.4 Not Enough Green / Felt
**Problem:** The background was too dark/black, not enough green casino felt feeling.
**Fix:** Push the background significantly more green. Use visible green tones (not just dark green that reads as black). Add a felt texture overlay — subtle noise/grain that simulates baize fabric. Add a radial gradient "spotlight" effect that's clearly green, not just dark. The surface cards sit on should feel like green felt. See Section 4.2 and 4.3 for color palette and texture details.

### 7.5 Loan Shark Messages — KEEP
**Verdict:** The loan shark popup messages were funny and well-received. Keep them. Add a few more milestones (see Section 3.6 for expanded list).

---

## 8. Phase 2 — Multiplayer Architecture

### 8.1 Overview
Phase 2 adds real-time multiplayer: 2-6 players at a virtual table, each on their own device. One player creates a room and shares a code; others join with that code.

### 8.2 Architecture
```
┌──────────────┐     WebSocket      ┌──────────────────┐
│  Player 1    │◄──────────────────►│                  │
│  (React App) │                    │   FastAPI         │
├──────────────┤     WebSocket      │   WebSocket       │
│  Player 2    │◄──────────────────►│   Server          │
│  (React App) │                    │                  │
├──────────────┤     WebSocket      │  Game Rooms:     │
│  Player 3    │◄──────────────────►│  - Room "XKCD"   │
│  (React App) │                    │  - Room "ABCD"   │
└──────────────┘                    └──────────────────┘
```

### 8.3 Game Room Lifecycle
1. **Create Room:** Player 1 hits "Create Room" → server generates a 4-char code (e.g., "XKCD") → Player 1 is in the lobby
2. **Join Room:** Player 2 enters the code → joins the lobby → sees other players
3. **Start Game:** Room creator hits "Start" when 2+ players are in → game begins
4. **Gameplay:** Each round, all players bet independently → cards dealt to all players + dealer → each player takes their turn sequentially (other players see "Waiting for Player 2...") → dealer plays → all hands resolved → next round
5. **Leave/Disconnect:** Player can leave anytime. If room creator leaves, ownership transfers. If all players leave, room is destroyed after 5 minutes.

### 8.4 Server-Side State
The server is the **single source of truth** for game state in multiplayer. The client sends actions (bet, hit, stand, double); the server validates and broadcasts updated state to all clients.

```python
class GameRoom:
    code: str
    players: dict[str, PlayerState]  # websocket_id -> state
    dealer_hand: list[Card]
    deck: list[Card]
    phase: str  # 'lobby' | 'betting' | 'playing' | 'dealer_turn' | 'result'
    current_player_idx: int  # Whose turn it is
    created_at: datetime
    
class PlayerState:
    name: str
    bankroll: int
    hand: list[Card]
    bet: int
    betted_assets: list[Asset]
    owned_assets: dict[str, bool]
    status: str  # 'betting' | 'playing' | 'standing' | 'bust' | 'done'
    achievements: list[str]
    connected: bool
```

### 8.5 WebSocket Message Protocol
**Note:** The chip-stacking system (Section 4.8) is purely a client-side UX feature. The server only needs the final bet amount — it doesn't care how the player assembled it. The client sums `chipStack` and sends `place_bet` with the total.

```json
// Client → Server
{ "type": "create_room", "player_name": "Sia" }
{ "type": "join_room", "code": "XKCD", "player_name": "John" }
{ "type": "place_bet", "amount": 500 }
{ "type": "bet_asset", "asset_id": "car" }
{ "type": "hit" }
{ "type": "stand" }
{ "type": "double_down" }
{ "type": "leave" }

// Server → Client (broadcast to all in room)
{ "type": "room_created", "code": "XKCD" }
{ "type": "player_joined", "player_name": "John", "players": [...] }
{ "type": "game_started", "state": {...} }
{ "type": "state_update", "state": {...} }  // After every action
{ "type": "your_turn" }
{ "type": "round_result", "results": {...} }
{ "type": "player_left", "player_name": "John" }
{ "type": "error", "message": "..." }
```

### 8.6 Multiplayer-Specific Features
- **Shared table view:** All players' hands visible (but only your controls are active during your turn)
- **Spectate mode:** Players who bust or stand see others play in real-time
- **Trash talk between players:** Optional text chat or predefined quick messages ("Nice hand!", "RIP", "You're insane", "ALL IN BABY")
- **Shared dealer:** Same dealer trash-talks everyone — can roast specific players by name
- **Leaderboard:** End-of-session stats — who lost the most, who went deepest in debt, who bet the most assets
- **The debt mechanic applies to each player independently** — everyone has their own bankroll and asset inventory

### 8.7 Multiplayer Tech Notes
- FastAPI with `websockets` (built-in support, no extra deps)
- Game rooms stored in-memory (Python dict) — no database needed for MVP
- Room cleanup: background task that prunes rooms with no connected players after 5 min
- WebSocket heartbeat: ping every 30 seconds to detect disconnects
- Reconnection: if a player disconnects and reconnects within 2 minutes, restore their state
- All game logic validation happens server-side — clients are "dumb" renderers
- Deploy as a Docker container alongside the frontend container on sia-server

---

## 9. Deployment Plan

### 9.1 Docker Setup

**Frontend Dockerfile (multi-stage):**
```dockerfile
# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Serve stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**nginx.conf (SPA routing + performance):**
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback — all routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets aggressively
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Cache sound files
    location /sounds/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
}
```

**Backend Dockerfile (Phase 2):**
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3021:80"
    restart: unless-stopped

  # Phase 2 — uncomment when backend is ready
  # backend:
  #   build:
  #     context: ./server
  #     dockerfile: Dockerfile
  #   ports:
  #     - "3022:8000"
  #   restart: unless-stopped
```

### 9.2 Nginx Proxy Manager Configuration
- **Host:** blackjack.siaahmadi.com
- **Forward to:** sia-server:3021 (frontend)
- **WebSocket support:** Enable for /ws/* paths → forward to sia-server:3022 (Phase 2)
- **SSL:** Cloudflare origin cert (already configured for siaahmadi.com)

### 9.3 Domain
- Primary: `blackjack.siaahmadi.com`
- Future: `blackjack.siaa.dev` (when siaa.dev is configured)

---

## 10. Phased Task Breakdown

Each task is a discrete, completable unit of work. Complete them in order. Each task should result in a working (if incomplete) app.

### Phase 1: Core Game (Single Player)

**Task 1.1 — Project Scaffolding**
- Initialize Vite + React project
- Set up folder structure per Section 6
- Install dependencies (just React + Vite, no extra deps)
- Create CSS variables and global styles (theme.css) per Section 4.2
- Create animations.css with all @keyframes (card deal, slide up, shake, pulse glow, toast in, fade in, chip bounce/arc)
- Set up `index.html` with PWA meta tags per Section 4.11 (viewport, apple-mobile-web-app-capable, theme-color)
- Create a basic `public/manifest.json` for Add to Home Screen support
- Verify `npm run dev` works with a hello world
- Verify the green felt background renders correctly in the base layout

**Task 1.2 — Card Utilities & Constants**
- Implement `cardUtils.js`: createDeck, shuffle (Fisher-Yates), handValue, isSoft (returns true if hand contains an ace counted as 11), isBlackjack, cardValue
- Implement `gameConfig.js`: STARTING_BANKROLL, MIN_BET, DECK_COUNT, RESHUFFLE_THRESHOLD, etc.
- Implement `chips.js`: Chip denominations, colors, labels, and unlock thresholds per Section 4.8
- Implement `assets.js`: Asset definitions per Section 3.4
- Implement `formatters.js`: formatMoney, pickRandom
- Write basic tests or console.log verification that deck creation, shuffling, hand evaluation, and isSoft work correctly. Specifically test: A+6 = soft 17, A+6+10 = hard 17 (ace flips to 1), A+A = soft 12, 10+7 = hard 17

**Task 1.3 — Game Reducer**
- Implement `initialState.js` per Section 5.2 (includes chipStack, selectedChipValue, isDoubledDown, isAllIn, muted)
- Implement `gameReducer.js` with ALL action types per Section 5.3
- Key actions to get right: ADD_CHIP, UNDO_CHIP, CLEAR_CHIPS, ALL_IN, DEAL (this replaces the old PLACE_BET — it sums chipStack into currentBet then deals)
- Pay special attention to RESOLVE_HAND — this is where bankroll bugs happen. It must: calculate payout, update bankroll, update stats (streaks, peakBankroll, lowestBankroll), return/lose betted assets, and reset hand-level flags
- DOUBLE_DOWN must set isDoubledDown = true and double currentBet
- The reducer must be pure (no side effects, no randomness inside it — pass cards in via action payloads)
- Test the reducer in isolation: simulate a full game by dispatching actions and verifying state transitions. Test specifically: normal win, normal loss, bust, dealer bust, push, blackjack, double down, negative bankroll betting, asset bet + win (asset returned), asset bet + loss (asset gone)

**Task 1.4 — Card Component & Felt Background**
- Build the `Card` component per Section 4.5 (larger cards, readable numbers)
- Build the `Hand` component (fan of cards with overlap when 4+ cards)
- Implement the green felt background with texture per Section 4.3
- Verify cards look good on a felt background

**Task 1.5 — Core Game Layout & Flow**
- Build `Header`, `BankrollDisplay`, `DealerArea`, `PlayerArea` components
- Build `Chip` component — single casino chip with denomination-specific colors per Section 4.8
- Build `ChipTray` — horizontal row of tappable chips at the bottom of the screen
- Build `BettingCircle` — circular bet spot on the felt that shows stacked chips and bet total
- Build `BettingControls` — wraps ChipTray + BettingCircle + DEAL button + ALL IN + undo/clear
- Implement chip tap → animate to betting circle → stack visually (see Section 4.8 for animation specs)
- Implement undo (tap circle to remove last chip) and clear (long press or clear button)
- Build `ActionButtons` (Hit, Stand, Double Down) — replaces ChipTray during play phase
- Wire everything to the reducer in `App.jsx`
- Implement the dealer turn animation via `useDealerTurn` hook
- **At this point, a complete game of blackjack should be playable** — tap chips to bet, deal, hit/stand, see results
- **CRITICAL:** Verify the full layout fits on iPhone 15 Pro viewport (393×660px usable) without scrolling during gameplay. If it doesn't fit, apply compression strategies from Section 4.10 before proceeding to Task 1.6

**Task 1.6 — Debt Mechanic & Asset Betting**
- Ensure the reducer allows negative bankroll (no validation blocking bets when broke)
- Implement asset betting UI in `BettingControls`
- Implement asset return on win/push and asset loss on lose/bust
- Implement bankroll-specific animations (shake on bankroll number only, NOT screen)
- Implement dynamic subtitle and button text changes per Section 3.8

**Task 1.7 — Dealer Trash Talk**
- Create `dealerLines.js` with all categories and lines per Section 3.5
- Implement line selection logic with no-repeat-until-all-shown tracking
- Wire dealer message updates into the reducer's RESOLVE_HAND and other relevant actions
- Add speech bubble animation (fade/type effect)

**Task 1.8 — Loan Shark Messages**
- Create `loanSharkMessages.js` per Section 3.6
- Build `LoanSharkPopup` component
- Wire threshold checking into state management (check after bankroll updates)
- Auto-dismiss after 4-5 seconds

**Task 1.9 — Achievement System**
- Create `achievements.js` with all achievements per Section 3.7
- Build `AchievementToast` and `AchievementPanel` components
- Implement `useAchievements` hook that checks conditions after each hand
- Wire into game flow
- Add localStorage persistence for achievements

**Task 1.10 — Polish & Mobile Optimization**
- Test on iPhone viewport sizes (375px, 393px, 430px) — use Chrome DevTools device emulation
- Ensure no horizontal scrolling at any point in the game flow
- Ensure controls are visible without scrolling on iPhone 15 Pro
- Add `env(safe-area-inset-bottom)` padding
- Add touch feedback on buttons (active state scale(0.97), brief opacity change)
- Add card dealing sound effects per Section 4.12 (Web Audio API, initialize on first user gesture, respect Safari restrictions)
- Add mute/unmute toggle (🔊/🔇) in the header
- Implement session persistence per Section 4.13 (localStorage for achievements, mute pref, highest debt)
- Performance pass: ensure no unnecessary re-renders (React.memo on Card, Chip components; useMemo for derived values like handValue, available assets)
- Test the full degenerate flow: start → broke → debt → bet assets → lose everything → keep going → close tab → reopen → achievements still there, fresh bankroll
- Verify chip stacking animations feel responsive on mobile (no lag between tap and chip appearing)

**Task 1.11 — Docker & Deployment**
- Create `nginx.conf` per Section 9.1 (SPA routing, gzip, cache headers)
- Create `Dockerfile` per Section 9.1 (multi-stage build)
- Create `docker-compose.yml` per Section 9.1
- Build and test locally: `docker compose up --build`, verify at localhost:3021
- Deploy to sia-server: `scp` or `git clone` the repo, `docker compose up -d`
- Configure Nginx Proxy Manager for blackjack.siaahmadi.com → sia-server:3021
- Verify SSL works via Cloudflare origin cert
- Test on actual iPhone over the internet — full game flow, chip stacking, sound, achievements

### Phase 2: Multiplayer

**Task 2.1 — Backend Scaffolding**
- Create `server/` directory with FastAPI project
- Implement WebSocket connection handling
- Implement room creation and joining (in-memory)
- Implement the 4-char room code generator
- Test with a simple WebSocket client (wscat or browser console)

**Task 2.2 — Server-Side Game Logic**
- Port game logic to Python (deck, hand evaluation, dealing)
- Implement GameRoom and PlayerState classes per Section 8.4
- Implement turn-based play flow
- Implement server-side validation for all player actions
- The server is the authority — clients cannot cheat

**Task 2.3 — WebSocket Protocol**
- Implement full message protocol per Section 8.5
- Handle all client messages (create, join, bet, hit, stand, double, leave)
- Broadcast state updates to all players in a room
- Handle disconnection and reconnection

**Task 2.4 — Frontend Multiplayer Mode**
- Add "Solo" vs "Multiplayer" mode selection to the app
- Build lobby UI (create room, join room, player list, start game)
- Adapt the game UI to show multiple player hands
- Implement "waiting for other players" states
- Wire frontend to WebSocket server

**Task 2.5 — Multiplayer Polish**
- Add player quick-chat messages
- Add end-of-session leaderboard/stats
- Add room cleanup background task
- Add WebSocket heartbeat/ping
- Docker containerize the backend
- Update docker-compose.yml
- Deploy and test with actual multiplayer (Sia + John)

---

## 11. CLAUDE.md Instructions

When setting up the Claude Code project, the CLAUDE.md file should include:

```markdown
# Blackjack App — Claude Code Instructions

## Context
Read BLACKJACK_TECHNICAL_DIRECTION.md for the full technical spec. It contains every feature, design decision, architecture choice, and task breakdown.

## Working Style
- Complete one task at a time from the Phase 1 task list (Section 10)
- After each task, verify the app still runs (`npm run dev`)
- Keep components small and focused — one component per file
- All game state goes through the reducer — NO standalone useState for game logic
- Constants in separate files — never hardcode game values in components

## Tech Constraints
- React 18+ with Vite, no Next.js, no Astro
- No Tailwind — use CSS variables defined in theme.css + CSS Modules (`.module.css`) for component styles
- No component libraries (no MUI, no shadcn) — everything custom
- Fonts from Google Fonts: Playfair Display, DM Sans, JetBrains Mono
- No external state management (no Redux, no Zustand) — useReducer for game state, useState only for local component UI concerns

## Critical Rules
1. The bankroll CAN go negative. Never add validation that prevents betting when broke.
2. The entire screen must NEVER shake. Only the bankroll number and bet button can shake.
3. Cards must be large enough to read easily on a phone (min 70px wide, rank text 18px+).
4. The background must look like green felt, not just a dark gradient.
5. All dealer lines go in constants/dealerLines.js, not inline in components.
6. The reducer must be pure — no Math.random() inside it. Pass randomness (cards) via action payloads. See Section 5.5 for the deck management pattern.
7. Betting uses a chip-stacking system — players TAP chips that animate into a betting circle on the table. No text input for bet amounts. Bets are tracked as an array of chip values (chipStack), not a single number. See Section 4.8.
8. Chip denominations have specific colors (green $25, black $100, purple $500, orange $1K, red $5K). These must be visually distinct and match real casino chip conventions.
9. Dealer hits on SOFT 17 (A+6). Use the isSoft() helper. See Section 3.1 for edge cases.
10. Double down auto-stands — player cannot hit after doubling. One card only.

## Deployment
- Self-hosted on Ubuntu server via Docker
- Domain: blackjack.siaahmadi.com
- Frontend: Vite build → nginx container on port 3021
- Backend (Phase 2): FastAPI on port 3022
```

---

*Last updated: March 2026. This is a living document — update it as features are added or requirements change.*