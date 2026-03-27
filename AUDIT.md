# House Money — Full Audit & Fix Plan

> This document contains every bug, gap, and improvement identified in a comprehensive audit of the entire codebase. Feed this to Claude Code and execute in tier order. Each tier is independently shippable.

---

## How to Use This Document

1. Read the entire document before starting any work.
2. Execute fixes in **tier order** (Tier 1 first, then Tier 2, etc.).
3. Within each tier, fixes are ordered by priority — do them top to bottom.
4. After each tier, run `npm run build` and test the specific scenarios listed.
5. **Do not skip tiers.** Tier 1 bugs affect gameplay correctness and must be fixed before anything else.

---

## Tier 1 — Bugs Affecting Gameplay Correctness

### FIX 1.1: Split Vig Double-Counting (Client + Server)

**Bug:** In both `gameReducer.js:308-312` (SPLIT action) and `server/game_logic.py:473-483` (split method), the vig on a new split hand is calculated using:

```javascript
const totalCommitted = state.playerHands.reduce((sum, h) => sum + h.bet, 0)
const effectiveBankroll = Math.max(0, state.bankroll - totalCommitted)
const borrowedAmount = Math.max(0, splitHand.bet - effectiveBankroll)
```

The problem: `totalCommitted` includes the hand being split. That hand's bet is counted in `totalCommitted` AND again as `splitHand.bet` for the new hand. The borrowed amount is inflated because the original hand's money is being double-counted — it's treated as both "already committed" (reducing effective bankroll) and "new commitment" (the split hand's bet).

**Fix (client — `gameReducer.js` SPLIT case):** Change the `totalCommitted` calculation to exclude the hand being split:

```javascript
const totalCommitted = state.playerHands
  .filter((_, i) => i !== state.activeHandIndex)
  .reduce((sum, h) => sum + h.bet, 0)
```

**Fix (server — `game_logic.py` split method):** Same logic in Python:

```python
total_committed = sum(h["bet"] for i, h in enumerate(player.hands) if i != hand_index)
```

Also apply the same fix to DOUBLE_DOWN in both client (`gameReducer.js:250-253`) and server (`game_logic.py:406-408`) — the double-down vig has the same double-counting issue since `totalCommitted` includes the hand being doubled.

**Files:** `src/reducer/gameReducer.js`, `server/game_logic.py`

---

### FIX 1.2: DOUBLE_DOWN Missing Debt Gate Check (Client + Server)

**Bug:** The DOUBLE_DOWN action in `gameReducer.js:243-278` doubles the hand's bet and deducts vig, but never checks whether the player should be allowed to borrow. If a player somehow enters the playing phase with $0 bankroll (e.g., via an asset-only bet), doubling down creates borrowed money without requiring `inDebtMode`. The server's `game_logic.py` double_down (line 393-448) has the same gap.

**Fix (client):** In `gameReducer.js` DOUBLE_DOWN case, after the existing guards (line 246-248), add:

```javascript
// Debt gate: if doubling would push bankroll negative and not in debt mode, reject
if (state.bankroll - hand.bet < 0 && !state.inDebtMode) return state
```

**Fix (server):** In `game_logic.py` double_down method, after the existing guards (line 399-402), add:

```python
if player.bankroll - hand["bet"] < 0 and not player.in_debt_mode:
    raise ValueError("Cannot double down — insufficient funds")
```

**Files:** `src/reducer/gameReducer.js`, `server/game_logic.py`

---

### FIX 1.3: Multiplayer Chip Stacking Has No Bankroll Cap

**Bug:** Solo reducer's `ADD_CHIP` (line 89-90) correctly blocks chips when `newTotal > bankroll && !inDebtMode`. But the multiplayer reducer's `MP_ADD_CHIP` (line 90-97) has NO equivalent check — it pushes chips unconditionally. A player with $5K can stack $100K in chips client-side. The server will reject the bet on `place_bet`, but the UX is terrible: stack chips, hit DEAL, get an error, chip stack is now invalid.

**Fix:** In `multiplayerReducer.js` `MP_ADD_CHIP` case, add bankroll cap:

```javascript
case MP_ADD_CHIP: {
  if (state.betSubmitted) return state
  const bankroll = getLocalBankroll(state)
  const localPlayer = state.playerStates[state.playerId] || {}
  const inDebtMode = localPlayer.in_debt_mode || false
  const newTotal = state.chipStack.reduce((sum, v) => sum + v, 0) + action.value
  // Cap at bankroll when not in debt mode
  if (bankroll > 0 && newTotal > bankroll && !inDebtMode) return state
  // Block entirely when broke and not in debt mode
  if (bankroll <= 0 && !inDebtMode) return state
  return {
    ...state,
    chipStack: [...state.chipStack, action.value],
    selectedChipValue: action.value,
  }
}
```

**Files:** `src/reducer/multiplayerReducer.js`

---

### FIX 1.4: Multiplayer ALL_IN Calculates Wrong Amount in Debt Mode

**Bug:** `multiplayerReducer.js` line 118: `const amount = bankroll > 0 ? bankroll : (Math.abs(bankroll) || MIN_BET)`. When bankroll is -$50,000, this bets $50,000 (the absolute value of the debt). Solo ALL_IN bets MIN_BET when bankroll ≤ 0. The multiplayer version creates an absurdly large bet from debt.

**Fix:** Change line 118 to match solo behavior:

```javascript
const amount = bankroll > 0 ? bankroll : MIN_BET
```

**Files:** `src/reducer/multiplayerReducer.js`

---

### FIX 1.5: Multiplayer ResultBanner Missing playerHands Prop

**Bug:** In `MultiplayerGame.jsx` line 271-278, the result-phase `ResultBanner` in the controls area doesn't receive `playerHands`. It cannot show per-hand split breakdowns or accurate payout info.

**Fix:** Add the prop:

```jsx
{state.phase === 'result' && (
  <ResultBanner
    result={localResult}
    bankroll={bankroll}
    playerHands={localPlayer?.hands || []}
    autoAdvance
    nextRoundAt={state.nextRoundAt}
  />
)}
```

**Files:** `src/components/MultiplayerGame.jsx`

---

### FIX 1.6: Verify allBust Path With Split Hands

**Bug (potential):** In `gameReducer.js:56-58`, when all split hands bust after advancement, it sets `phase: 'result'` and `result: 'bust'` directly without dispatching RESOLVE_HAND. The `useDealerTurn` hook's second effect (line 48-61) catches this by looking for `phase === 'result' && chipStack.length > 0`. But if any previous dispatch already cleared chipStack, this guard fails and RESOLVE_HAND never fires — bankroll, stats, and assets are never settled.

**Action:** Write a test scenario: start a hand, split, bust both hands. Verify that:
- RESOLVE_HAND fires and bankroll is correctly reduced
- Stats (handsPlayed, loseStreak) are updated
- Assets tied to hand[0] are correctly lost
- The result modal appears with correct payout display

If the all-bust path works, mark this as verified. If it doesn't, the fix is to ensure RESOLVE_HAND is always dispatched before bankroll/stats are needed — possibly by having the reducer itself trigger resolution when all hands bust instead of relying on the hook timing.

**Files:** `src/reducer/gameReducer.js`, `src/hooks/useDealerTurn.js`

---

### Tier 1 Verification

After all Tier 1 fixes:

1. `npm run build` — clean build
2. Solo: Play a full round (deal, hit, stand). Verify bankroll changes correctly.
3. Solo: Split a pair. Verify vig is charged correctly (check the vig indicator amount — it should NOT be inflated).
4. Solo: Double down while in debt mode. Verify vig is charged correctly.
5. Solo: At $0 with assets, verify you CANNOT double down past $0 without debt mode.
6. Solo: Split, bust both hands. Verify bankroll reduces and result shows.
7. Multiplayer: Open 2 browser tabs. Verify chip stacking respects bankroll cap (can't stack more than bankroll when not in debt mode).
8. Multiplayer: Verify ALL IN at negative bankroll bets $25 (MIN_BET), not the absolute debt value.
9. Multiplayer: Split hands, go to result. Verify per-hand breakdown shows in the result banner.
10. `cd server && python -m pytest test_game.py -v` — all tests pass.

---

## Tier 2 — Significant Feature Gaps

### FIX 2.1: No Dealer Trash Talk in Multiplayer

**Problem:** `MultiplayerGame.jsx` line 189 passes `dealerMessage=""` to DealerArea — hardcoded empty string. Multiplayer has zero dealer commentary. This is a huge comedy gap.

**Solution:** Add server-side dealer message selection. The server should pick a dealer line based on game events and include it in state broadcasts. This parallels how the solo `useDealerMessage` hook works, but the logic runs server-side so all players see the same message.

**Implementation:**

1. In `server/game_logic.py`, add a `_select_dealer_message` method that picks a line based on the current event (deal, bust, win, split, big bet, etc.). Port the category selection logic from `src/utils/dealerMessages.js` to Python. Store dealer lines in `server/constants.py` (duplicate from `src/constants/dealerLines.js`).

2. Add `dealer_message: str = ""` to `GameRoom` dataclass in `game_room.py`.

3. In each game event that should trigger dealer commentary (deal_initial_cards, hit-bust, resolve_all_hands, split, etc.), call `_select_dealer_message` and set `room.dealer_message`. Include it in the state broadcast via `get_room_state`.

4. In `multiplayerReducer.js`, `applyServerState` should extract `dealer_message` from the server state and store it.

5. In `MultiplayerGame.jsx`, pass the dealer message from state instead of empty string:
```jsx
dealerMessage={state.dealerMessage || ""}
```

**Multiplayer-specific dealer lines to add:**
- Lines that reference specific players by name: "Sia just bet $5K with a -$200K bankroll. That's called 'denial.'"
- Lines for when another player busts: "And John goes down. Next!"
- Lines for split in multiplayer: "Two players splitting in the same round? The casino loves this."

The server has access to `player.name` in all contexts, so template strings with player names are straightforward.

**Files:** `server/game_logic.py`, `server/game_room.py`, `server/constants.py`, `src/reducer/multiplayerReducer.js`, `src/components/MultiplayerGame.jsx`

---

### FIX 2.2: No Debt Tracker in Multiplayer

**Problem:** The `DebtTracker` component exists and works in solo, but `MultiplayerGame.jsx` doesn't render it and there's no `bankrollHistory` in the multiplayer state.

**Fix:**

1. Add `bankrollHistory: []` to `multiplayerInitialState.js`.

2. In `multiplayerReducer.js`, when `SERVER_ROUND_RESULT` is processed, push the local player's new bankroll onto `bankrollHistory`:

```javascript
case 'SERVER_ROUND_RESULT': {
  const newState = applyServerState(state, action.payload.state)
  const localPlayer = newState.playerStates[state.playerId]
  const newBankroll = localPlayer?.bankroll ?? 0
  return {
    ...newState,
    dealerHand: action.payload.dealer_hand,
    dealerValue: action.payload.dealer_value,
    phase: 'result',
    nextRoundAt: Date.now() + NEXT_ROUND_DELAY_MS,
    bankrollHistory: [...state.bankrollHistory, newBankroll],
  }
}
```

3. Also seed `bankrollHistory` with the starting bankroll on `SERVER_GAME_STARTED`.

4. Add the 📊 button to the multiplayer Header (it currently only shows in solo). Add `showDebtTracker` state and toggle handler in MultiplayerGame.

5. Render `<DebtTracker>` in MultiplayerGame, passing the same props as solo:
```jsx
{showDebtTracker && (
  <DebtTracker
    bankrollHistory={state.bankrollHistory}
    peakBankroll={localPlayer?.stats?.peak_bankroll || STARTING_BANKROLL}
    lowestBankroll={localPlayer?.stats?.lowest_bankroll || STARTING_BANKROLL}
    handsPlayed={localPlayer?.stats?.hands_played || 0}
    totalVigPaid={localPlayer?.stats?.total_vig_paid || 0}
    onClose={() => setShowDebtTracker(false)}
  />
)}
```

**Files:** `src/reducer/multiplayerInitialState.js`, `src/reducer/multiplayerReducer.js`, `src/components/MultiplayerGame.jsx`, `src/components/Header.jsx`

---

### FIX 2.3: Multiplayer Must NOT Show Achievement Toasts or Loan Shark Popups

**Design decision:** In multiplayer, achievement toasts and loan shark popup messages must NOT appear. They crowd the UI, compete with quick chat toasts, and distract from the social experience. The dealer trash talk and player chat are the comedy channels in multiplayer.

**However:** Achievements should still **unlock silently** in multiplayer. The achievement counter in the header should still increment. The achievement panel should still be viewable. They just don't produce toast notifications.

**Current state:** Verify that `MultiplayerGame.jsx` does NOT render `<AchievementToast>` or `<LoanSharkPopup>`. Looking at the current code, it doesn't — these are only in `SoloGame.jsx`. **This is already correct.** But verify the achievement counter still shows in the multiplayer header. If it doesn't (because `useAchievements` isn't called in multiplayer), that's a gap — achievements should still be tracked via the server's stats even if toasts don't show.

**Note:** If multiplayer achievements are ever added, they should be tracked server-side and shown only in the achievement panel (accessed via header button) and the session leaderboard — never as interruptive toasts.

**Files:** Verify `src/components/MultiplayerGame.jsx` — likely no changes needed, just confirmation.

---

### FIX 2.4: Delete Old Spec, Write ARCHITECTURE.md

**Problem:** `BLACKJACK_TECHNICAL_DIRECTION.md` is 1,160 lines documenting a version of the game that no longer exists. It references the old asset betting system, doesn't mention the debt gate, vig, splits, credit labels, UI degradation, debt tracker, or the dynamic chip system. `CLAUDE.md` references section numbers from this outdated spec. The document is actively misleading for anyone (including Claude Code) who reads it for guidance.

**Action:**

1. **Delete** `BLACKJACK_TECHNICAL_DIRECTION.md` entirely.

2. **Create** `ARCHITECTURE.md` — a new document written from scratch that describes the system as it actually exists today. Structure:

   - **Overview** — One paragraph: what the app is, tech stack, deployment model.
   - **State Shape** — The full `createInitialState()` object with annotations (copy from README, verify it matches current code).
   - **Reducer Action Catalog** — Every action type with a one-line description of what it does and what it validates. Group by category: betting, gameplay, resolution, UI toggles, system.
   - **Phase State Machine** — The 4 phases (betting → playing → dealerTurn → result) with all transitions and what triggers them.
   - **Debt Gate Flow** — Step-by-step: cash → $0 → asset gate → asset bet → lose → $0 again → repeat → all assets gone → loan gate → TAKE_LOAN → debt mode. Include the rule: debt mode exits when bankroll > 0, re-enters via TAKE_LOAN.
   - **Vig System** — Rate table, calculation formula, when it's charged (DEAL, SPLIT, DOUBLE_DOWN), the borrowed-amount math.
   - **Asset System** — Asset list, unlock thresholds, bet/return/loss logic, interaction with debt gate.
   - **Split System** — Rules (same rank, max 4, ace handling, double after split), state shape (`playerHands[]`, `activeHandIndex`), hand advancement.
   - **Multiplayer Protocol** — WebSocket message types (client→server, server→client), room lifecycle, reconnection, turn management.
   - **Server Validation Rules** — Every check the server performs on game actions (bet caps, turn validation, debt gate, phase checks).
   - **File Map** — One-line description per file (copy from README, verify current).

3. **Update** `CLAUDE.md` to reference `ARCHITECTURE.md` instead of the old spec. Remove any section number references (e.g., "See Section 3.4") and replace with descriptive references (e.g., "See Asset System in ARCHITECTURE.md").

**Files:** Delete `BLACKJACK_TECHNICAL_DIRECTION.md`, create `ARCHITECTURE.md`, update `CLAUDE.md`

---

### Tier 2 Verification

1. Multiplayer: Play a round — verify dealer says something in the speech bubble (not empty).
2. Multiplayer: Open the debt tracker — verify the chart shows bankroll history.
3. Multiplayer: Verify NO achievement toasts or loan shark popups appear at any point.
4. Verify `ARCHITECTURE.md` exists and `BLACKJACK_TECHNICAL_DIRECTION.md` is gone.
5. Verify `CLAUDE.md` has no broken section references.

---

## Tier 3 — Quality & Hardening

### FIX 3.1: Server-Side Game Action Rate Limiting

**Problem:** The server has rate limiting on quick chat (2s cooldown) but none on game actions (hit, stand, split, bet). A client could spam actions faster than the server processes them. While the async lock prevents data corruption, rapid spam wastes server resources and could cause unexpected state transitions.

**Fix:** Add a per-player action cooldown of 200ms. In `server/main.py`:

1. Add module-level `action_cooldowns: dict[str, float] = {}` (same pattern as `chat_cooldowns`).

2. In `handle_game_action`, before routing to the specific handler:

```python
now = time.monotonic()
last_action = action_cooldowns.get(player_id, 0)
if now - last_action < 0.2:
    await manager.send_to_player(
        player_id, {"type": "error", "message": "Too fast — slow down"}
    )
    return
action_cooldowns[player_id] = now
```

3. Clean up `action_cooldowns` entries in `handle_leave` and `handle_disconnect` (same as chat_cooldowns cleanup).

**Files:** `server/main.py`

---

### FIX 3.2: Player Name Unicode Sanitization

**Problem:** `validate_player_name` strips `<` and `>` but allows zero-width characters, RTL override characters, and other Unicode abuse. A player could set their name to invisible characters or mess up other players' UIs with directional overrides.

**Fix:** In `server/game_room.py` `validate_player_name`, add after the existing cleaning:

```python
import re

def validate_player_name(name: str | None) -> str:
    if not name or not name.strip():
        raise ValueError("Player name is required")
    cleaned = name.strip().replace('<', '').replace('>', '')
    # Remove zero-width and control characters
    cleaned = re.sub(r'[\u200b-\u200f\u2028-\u202f\u2060-\u2069\ufeff\x00-\x1f\x7f]', '', cleaned)
    if not cleaned:
        raise ValueError("Player name is required")
    if len(cleaned) > 20:
        raise ValueError("Player name must be 20 characters or less")
    return cleaned
```

This strips zero-width spaces, joiners, directional overrides, and control characters while still allowing legitimate Unicode (accented characters, CJK, Cyrillic, emoji).

**Files:** `server/game_room.py`

---

### FIX 3.3: Document Asset/Debt Gate Interaction

**Problem:** The interaction between assets, the debt gate, and the vig system is non-obvious and nowhere documented in code. If someone refactors any of these systems without understanding the full flow, they'll break it.

**Fix:** Add a comment block at the top of `gameReducer.js` (before the switch statement) explaining the flow:

```javascript
/*
 * DEBT GATE FLOW — How assets, debt, and vig interact:
 *
 * 1. Player starts with $10,000 cash + 6 assets.
 * 2. Player loses cash to $0. Chip tray is disabled (ADD_CHIP blocked by bankroll check).
 * 3. At $0, the BettingControls UI shows "BET AN ASSET" overlay (asset gate).
 *    Assets unlock progressively based on bankroll threshold (watch at $0, jewelry at -$500, etc.).
 * 4. Player bets an asset as a side bet (BET_ASSET action). The asset's cash value is added
 *    to the bet total alongside any chip bet. If the player has $0 cash + $500 watch bet,
 *    total bet = $500.
 * 5. If they LOSE: bankroll drops by the total bet amount (e.g., $0 → -$500). Asset is gone.
 *    This negative bankroll unlocks the NEXT asset (jewelry at -$500).
 * 6. The cycle repeats: bet asset → lose → go deeper negative → unlock next asset.
 * 7. When ALL assets are bet/lost and bankroll hits $0 (or is negative with no assets):
 *    The "TAKE A LOAN" button appears (loan gate).
 * 8. Player taps TAKE A LOAN → inDebtMode = true → chip tray unlocks permanently.
 *    Now the player can bet freely with borrowed money. Vig applies on all borrowed portions.
 * 9. If the player WINS back above $0: inDebtMode resets to false.
 *    If they drop back to $0 with no assets, they must tap TAKE A LOAN again.
 *
 * Key invariant: ADD_CHIP is blocked when bankroll <= 0 && !inDebtMode.
 * This forces the player through the asset → loan pipeline before accessing credit.
 */
```

Add a similar but shorter Python comment in `server/game_logic.py` above the `place_bet` method.

**Files:** `src/reducer/gameReducer.js`, `server/game_logic.py`

---

### FIX 3.4: isDoubledDown Field Name Consistency

**Problem:** Client uses `isDoubledDown` (camelCase). Server serializes as `is_doubled_down` (snake_case). The multiplayer client reads server data. Most multiplayer components correctly use `is_doubled_down`, but any cross-reference between solo state (camelCase) and multiplayer state (snake_case) will silently fail.

**Action:** Grep the entire `src/` directory for both `isDoubledDown` and `is_doubled_down`. Verify:
- Solo components and hooks use `isDoubledDown` (reading from client reducer)
- Multiplayer components use `is_doubled_down` (reading from server state)
- `useAchievements.js` uses `isDoubledDown` (solo only — this hook is only called in SoloGame)
- `useMultiplayerSound.js` and `PlayerSpot.jsx` use `is_doubled_down` (multiplayer)

If any file reads the wrong casing for its context, fix it. This is a search-and-verify task, not necessarily a code change — but document any mismatches found.

**Files:** Grep across `src/`

---

### Tier 3 Verification

1. Multiplayer: Open browser console, send 10 rapid `hit` messages via WebSocket — verify rate limiting kicks in after the first.
2. Multiplayer: Try joining with a name containing zero-width characters — verify it's cleaned or rejected.
3. Read the new comment block in `gameReducer.js` — verify it accurately describes the current flow.
4. `npm run build` — clean.

---

## Tier 4 — Unbuilt Specced Features

### FIX 4.1: UI Degradation System

**Status:** Designed in conversation but never implemented. No `degradation.css`, no `CasinoCracks.jsx`, no degradation tier computation exists anywhere in the codebase.

**Spec (from original design):**

| Debt Level | Effect |
|---|---|
| -$50K | Gold accents tarnish slightly (shift `--gold` from `#f0c850` toward `#c9a83a`) |
| -$100K | A hairline crack appears in the top-right corner (SVG overlay, ~60px, ~20% opacity) |
| -$250K | Felt texture fades (reduce noise opacity from 12% to 6%) |
| -$500K | Gold tarnishes further (`--gold` → `#a88a2a`), dim `--gold-glow` by 50% |
| -$1M | Desaturation (`filter: saturate(0.85)` on app container) |
| -$5M | Crack grows, second crack appears bottom-left |
| -$10M | Full decay — `saturate(0.7)`, gold is `#8a7020`, felt noise at 3% |

**Implementation approach:**

1. Create `src/constants/degradationTiers.js` with tier definitions and `getDegradationTier(bankroll)` helper.
2. Create `src/styles/degradation.css` with CSS variable overrides per tier class (`.degradation-1`, `.degradation-2`, etc.). Use `--gold`, `--gold-glow`, `--felt-noise-opacity` overrides.
3. Create `src/components/CasinoCracks.jsx` + CSS — thin SVG crack lines, positioned fixed, conditional on tier.
4. In `SoloGame.jsx`, compute tier from `state.bankroll`, apply class to wrapper, render `<CasinoCracks>`.
5. In `theme.css`, add `--felt-noise-opacity: 0.12` variable and use it in the `body::after` opacity.
6. Import `degradation.css` in `main.jsx`.

**Note:** This is a solo-mode feature only. Multiplayer UI should NOT degrade (each player has different debt levels and the game state is shared visually).

**Files:** Create `src/constants/degradationTiers.js`, `src/styles/degradation.css`, `src/components/CasinoCracks.jsx`, `src/components/CasinoCracks.module.css`. Modify `src/styles/theme.css`, `src/components/SoloGame.jsx`, `src/main.jsx`.

---

### FIX 4.2: bettingOnCredit Dealer Trash Talk Trigger

**Status:** Specced in the original design as a dealer line category that fires during chip stacking when the chipStack total first exceeds the player's bankroll. Not implemented — the `dealerLines.js` categories don't include `bettingOnCredit`.

**Implementation:**

1. Add `bettingOnCredit` category to `src/constants/dealerLines.js` with 6-8 lines:
   - "Oh, going on credit? The house is *delighted* to accommodate."
   - "Spending money you don't have? You'll fit right in here."
   - "Our finance department thanks you for your... optimism."
   - "Credit approved instantly. We're very understanding here."
   - "That chip costs more than your remaining dignity."
   - "Borrowing to gamble. Your financial advisor just fainted."

2. In `src/utils/dealerMessages.js`, add a trigger check: when a chip is added that pushes chipStack total past bankroll (previous total ≤ bankroll, new total > bankroll), fire the `bettingOnCredit` category.

3. In `src/hooks/useDealerMessage.js`, add an effect that watches chipStack total vs bankroll and triggers when the threshold is crossed. This should fire once per betting round (track with a ref that resets on NEW_ROUND).

**Files:** `src/constants/dealerLines.js`, `src/utils/dealerMessages.js`, `src/hooks/useDealerMessage.js`

---

### FIX 4.3: Chip Tray Credit Badge Dimming

**Status:** Specced as a visual indicator on chips when the player is betting on credit (chipStack total exceeds bankroll). Not implemented.

**Implementation:** This is low priority and purely visual. When `chipStackTotal > bankroll && bankroll > 0` (betting on credit while still positive), chips in the tray that would push the total past the bankroll get a subtle dimming treatment and a tiny "💳" badge. Skip this for now — the `bettingOnCredit` dealer line (Fix 4.2) and the amber bankroll color (already implemented) provide enough feedback.

**Status:** DEFER — not worth the complexity for minimal UX gain.

---

### Tier 4 Verification

1. Solo: Lose until -$50K. Verify gold accents look slightly different (duller).
2. Solo: Lose until -$100K. Verify a faint crack appears in the top-right corner.
3. Solo: Lose until -$1M. Verify overall colors look desaturated.
4. Solo: Stack chips past your bankroll. Verify dealer says a `bettingOnCredit` line.
5. Win back to positive. Verify degradation effects reverse and dealer line doesn't re-trigger.

---

## Tier 5 — Comedy Expansions

These are new ideas, not bug fixes. Implement them after all bugs and gaps are addressed.

### IDEA 5.1: Dealer Reacts to Debt Tracker Being Opened

When the player opens the Financial Journey chart (📊 button), the dealer should comment. Add a `debtTrackerOpened` category to dealer lines:

- "Oh, you're checking the damage? I wouldn't."
- "That chart goes one direction, you know."
- "Financial advisors hate this one simple trick: don't play blackjack."
- "Looking at the graph won't make it go up."
- "Every data scientist who sees this chart cries a little."

**Trigger:** In `useDealerMessage.js`, add an effect that fires when `state.showDebtTracker` transitions from false to true.

**Files:** `src/constants/dealerLines.js`, `src/hooks/useDealerMessage.js`

---

### IDEA 5.2: "The Impossible" Achievement

Add an achievement for winning back from extreme debt to positive bankroll:

```javascript
{ id: 'the_impossible', name: 'The Impossible', description: 'Win back to positive from -$100K+ debt', emoji: '🏔️' }
```

**Trigger:** In `useAchievements.js`, check: `state.bankroll > 0 && prevState.bankroll <= -100000`. This requires the player to have been at -$100K or below at some point during the hand's resolution and end up positive. Actually, simpler: check `state.lowestBankroll <= -100000 && state.bankroll > 0` — this triggers when the player is currently positive but has been -$100K+ deep at some point in the session.

**Files:** `src/constants/achievements.js`, `src/hooks/useAchievements.js`

---

### IDEA 5.3: Dealer Reacts to Large Vig Charges

When a vig charge exceeds $1,000, the dealer comments. Add a `bigVig` category:

- "That vig just cost more than most people's rent."
- "The interest alone could feed a family of four."
- "You're paying me more in vig than your actual bet is worth."
- "The accounting department just sent a thank-you card."

**Trigger:** In `useDealerMessage.js`, add an effect that fires when `state.vigAmount > 1000` and phase just transitioned to 'playing' (vig is charged at DEAL time).

**Files:** `src/constants/dealerLines.js`, `src/hooks/useDealerMessage.js`

---

### IDEA 5.4: Session Time Tracking with Commentary

Add a `sessionStartTime` to initialState (set to `Date.now()` on creation). Show elapsed time in the debt tracker overlay. Add time-based commentary:

- 30 minutes: "You've been here 30 minutes. Time flies when you're losing money."
- 1 hour: "One hour. Your dinner is getting cold."
- 2 hours: "Two hours. Your friends are worried."
- 4 hours: "The casino staff are on their second shift change. You're still here."

Show these as small text in the DebtTracker overlay, below the chart stats.

**Files:** `src/reducer/initialState.js`, `src/components/DebtTracker.jsx`

---

### Tier 5 Verification

1. Open debt tracker. Verify dealer says something about it.
2. Play from $10K down to -$100K, then win back to positive. Verify "The Impossible" achievement unlocks.
3. In debt mode, make a large bet. Verify dealer comments on the vig if it's over $1K.
4. Play for 30+ minutes (or set sessionStartTime to the past for testing). Verify time commentary appears in debt tracker.

---

## Summary — Files Touched Per Tier

### Tier 1 (6 fixes)
- `src/reducer/gameReducer.js` — Fixes 1.1, 1.2, 1.6
- `server/game_logic.py` — Fixes 1.1, 1.2
- `src/reducer/multiplayerReducer.js` — Fixes 1.3, 1.4
- `src/components/MultiplayerGame.jsx` — Fix 1.5
- `src/hooks/useDealerTurn.js` — Fix 1.6 (verify)

### Tier 2 (4 fixes)
- `server/game_logic.py` — Fix 2.1
- `server/game_room.py` — Fix 2.1
- `server/constants.py` — Fix 2.1
- `src/reducer/multiplayerReducer.js` — Fixes 2.1, 2.2
- `src/reducer/multiplayerInitialState.js` — Fix 2.2
- `src/components/MultiplayerGame.jsx` — Fixes 2.1, 2.2, 2.3
- `src/components/Header.jsx` — Fix 2.2
- Delete `BLACKJACK_TECHNICAL_DIRECTION.md` — Fix 2.4
- Create `ARCHITECTURE.md` — Fix 2.4
- Update `CLAUDE.md` — Fix 2.4

### Tier 3 (4 fixes)
- `server/main.py` — Fix 3.1
- `server/game_room.py` — Fix 3.2
- `src/reducer/gameReducer.js` — Fix 3.3
- `server/game_logic.py` — Fix 3.3
- Grep across `src/` — Fix 3.4

### Tier 4 (2 features + 1 deferred)
- Create `src/constants/degradationTiers.js` — Fix 4.1
- Create `src/styles/degradation.css` — Fix 4.1
- Create `src/components/CasinoCracks.jsx` + CSS — Fix 4.1
- `src/styles/theme.css` — Fix 4.1
- `src/components/SoloGame.jsx` — Fix 4.1
- `src/main.jsx` — Fix 4.1
- `src/constants/dealerLines.js` — Fix 4.2
- `src/utils/dealerMessages.js` — Fix 4.2
- `src/hooks/useDealerMessage.js` — Fix 4.2

### Tier 5 (4 ideas)
- `src/constants/dealerLines.js` — Ideas 5.1, 5.3
- `src/hooks/useDealerMessage.js` — Ideas 5.1, 5.3
- `src/constants/achievements.js` — Idea 5.2
- `src/hooks/useAchievements.js` — Idea 5.2
- `src/reducer/initialState.js` — Idea 5.4
- `src/components/DebtTracker.jsx` — Ideas 5.1, 5.4