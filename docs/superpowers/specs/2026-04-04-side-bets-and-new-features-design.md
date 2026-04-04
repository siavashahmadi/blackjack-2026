# Side Bet Overhaul + New Game Features Design

**Date:** 2026-04-04
**Scope:** 4 features -- side bet overhaul, double or nothing, hot streak multipliers, loan shark bounty board

---

## Feature 1: Side Bet Overhaul

### Problem

Side bets are currently broken and limited:
- Money is never deducted from bankroll at placement. Wins give free money; losses deduct correctly.
- Fixed at table minimum bet -- no player choice.
- Capped at 2 side bets max. Only 2 of 5 available bets can be active.
- No vig on borrowed side bet amounts.

### Design

**Amount selection:** Tapping a side bet card adds one chip of the currently selected denomination (from the main chip tray). Tapping again adds another chip of that denomination. Long-press removes one chip of the currently selected denomination. A small "x" button clears the entire side bet.

**No max bet.** Players can bet as much as they want on any side bet, as long as bankroll covers it (or they're in debt mode).

**All 5 side bets available.** Remove `MAX_SIDE_BETS` constant. All side bets can be active simultaneously.

**Bankroll deducted at placement.** `PLACE_SIDE_BET` immediately subtracts the chip value from bankroll. `REMOVE_SIDE_BET` refunds accordingly.

**Vig applies.** At DEAL time, vig is computed on the combined exposure (main bet + total side bets). Since side bet amounts were already deducted from bankroll, reconstruct the pre-side-bet bankroll as `bankroll + totalSideBets` for the vig formula.

### State Changes

No new state fields. `activeSideBets` remains `[{ type, amount }]` but `amount` is now player-chosen.

### Reducer Changes

**`PLACE_SIDE_BET`:**
- Action payload: `{ type: PLACE_SIDE_BET, betType, chipValue }`
- If `betType` exists in `activeSideBets`, increment its `amount` by `chipValue`
- If not, create `{ type: betType, amount: chipValue }`
- Bankroll validation (if not in debt mode): `sumChipStack(chipStack) + totalSideBets + chipValue <= bankroll` using pre-deduction bankroll
- Deduct `chipValue` from bankroll immediately

**`REMOVE_SIDE_BET`:**
- Action payload: `{ type: REMOVE_SIDE_BET, betType, removeAll }`
- If `removeAll`: remove entry, refund full amount to bankroll
- If not: subtract currently selected chip value from side bet amount. If result <= 0, remove entry. Refund the subtracted amount.
- Problem: we don't know selected chip value in the reducer. Pass it: `{ type: REMOVE_SIDE_BET, betType, removeAll, chipValue }`

**`DEAL` payout math:**
- Side bet amounts already deducted at placement
- Win: `payout = sb.amount * (payoutMultiplier + 1)` (return stake + profit)
- Loss: `payout = 0` (stake already taken)
- `sideBetDelta` accumulates only win payouts
- Vig: compute on `mainBet + totalSideBets` using `bankroll + totalSideBets` as the effective bankroll

**`RESOLVE_HAND`:** Same payout change for deferred side bets (dealer bust, jinx).

### UI Changes

**SideBetPanel:**
- Each card shows current wagered amount in gold Outfit font (if > 0)
- Tap adds selected chip value
- Long-press subtracts selected chip value (with haptic feedback via `navigator.vibrate`)
- Small "x" button appears when amount > 0 to clear entirely
- Header changes from `"$25 each - max 2"` to `"Tap to add chips"`
- No "ACTIVE" badge -- the amount itself indicates activity

**SideBetResults:**
- Replace per-bet badges with single consolidated badge
- Net positive: `"Side Bets: +$1,200"` (green)
- Net negative: `"Side Bets: -$50"` (red)
- Auto-fades after 3s (same as current)

### Props Changes

`SideBetPanel` needs `selectedChipValue` prop passed through from `SoloGame`.

---

## Feature 2: Double or Nothing

### Core Mechanic

After a loss where the amount lost >= 10x the current table's min bet, a "DOUBLE OR NOTHING?" modal appears. The player can accept (50/50 coin flip) or decline (proceed to next hand). On a win, the loss is erased. On a loss, the amount doubles and the offer reappears with escalating text. Unlimited chaining.

### State Changes

New fields in `initialState.js`:
```
doubleOrNothing: null
// When active:
// {
//   originalLoss: number,
//   currentStakes: number,
//   flipCount: number,
//   lastResult: null | 'win' | 'lose',
// }
```

New stat fields:
```
donFlipsWon: 0,
donFlipsLost: 0,
donBiggestStakes: 0,
```

### Actions

- `OFFER_DOUBLE_OR_NOTHING` -- sets `doubleOrNothing` with loss amount
- `ACCEPT_DOUBLE_OR_NOTHING` -- payload: `{ won: boolean }` (randomness outside reducer)
  - The original loss was already applied by RESOLVE_HAND. D.O.N. operates on top of that.
  - Won: `bankroll += currentStakes` (erases the loss), clear `doubleOrNothing`, increment `donFlipsWon`
  - Lost: `bankroll -= currentStakes` (loses an additional currentStakes on top of original loss), then `currentStakes *= 2` for the next flip, increment `flipCount`, increment `donFlipsLost`, update `donBiggestStakes`
- `DECLINE_DOUBLE_OR_NOTHING` -- clears `doubleOrNothing`

### Hook: `useDoubleOrNothing`

Watches `state.phase` and `state.result`. When phase transitions to `'result'` and result is a loss:
1. Calculate total loss from the hand (sum of hand payouts, all negative)
2. Compare against `10 * TABLE_LEVELS[state.tableLevel].minBet`
3. If qualifies, dispatch `OFFER_DOUBLE_OR_NOTHING` after 800ms delay

Coin flip randomness generated in the component, passed via action payload (keeps reducer pure).

### UI: DoubleOrNothingModal

Overlays during `result` phase when `doubleOrNothing !== null`. "Next Hand" button hidden while active.

Contents:
- Coin animation (CSS-only, alternating heads/tails)
- Current stakes in large gold text
- Escalating button text by `flipCount`:
  - 0: "DOUBLE OR NOTHING?"
  - 1: "QUADRUPLE OR NOTHING?"
  - 2: "OCTUPLE OR NOTHING?"
  - 3: "THIS IS GETTING CONCERNING"
  - 4: "THE CASINO IS BEGGING YOU TO STOP"
  - 5: "MATHEMATICALLY INADVISABLE"
  - 6: "YOUR ANCESTORS ARE WEEPING"
  - 7+: "JUST... WHY?"
- "FLIP" button and "WALK AWAY" button
- 1s coin spin animation on flip, then result display

### Interactions

- D.O.N. win does NOT count toward win streak
- D.O.N. operates on the already-multiplied amount (after streak multiplier)
- D.O.N. does not trigger another D.O.N.
- Dealer messages: new `doubleOrNothing` category
- Achievements: `don_first_win`, `don_3_chain` (win 3 flips in one D.O.N. session), `don_over_million` (stakes exceed $1M)

---

## Feature 3: Hot Streak Multipliers

### Core Mechanic

Consecutive wins build a hot streak that multiplies payouts. Cold streaks do nothing -- no cosmetics, no penalty, no effect whatsoever.

### Thresholds

| Consecutive Wins | Multiplier |
|---|---|
| 3 | 1.1x |
| 5 | 1.25x |
| 7+ | 1.5x |

### State Changes

No new state fields for the multiplier itself -- it's derived from `state.winStreak`.

Pure function in `constants/streaks.js`:
```javascript
function getStreakMultiplier(winStreak) {
  if (winStreak >= 7) return 1.5
  if (winStreak >= 5) return 1.25
  if (winStreak >= 3) return 1.1
  return 1
}
```

New stat field:
```
totalStreakBonuses: 0
```

### Reducer Changes

In `RESOLVE_HAND`, after computing `totalDelta` and `newWinStreak`:
- If `totalDelta > 0` and `newWinStreak >= 3`:
  - `multiplier = getStreakMultiplier(newWinStreak)`
  - `streakBonus = Math.floor(totalDelta * multiplier) - totalDelta`
  - `totalDelta = totalDelta + streakBonus`
  - Track `streakBonus` in hand history entry
  - Accumulate into `totalStreakBonuses`

### UI: StreakIndicator

`StreakIndicator.jsx` -- small component, visible only when `winStreak >= 3`.

- Positioned near bankroll display
- Shows: "HOT 1.1x" / "HOT 1.25x" / "HOT 1.5x"
- Warm glow styling (orange/red gradient, subtle pulse)
- Flash/scale animation on tier change
- Fades out when streak breaks

### ResultBanner Integration

When streak multiplier applies, append to result text:
- Normal: "YOU WIN +$1,000"
- With streak: "YOU WIN +$1,100 (1.1x HOT)"

### Interactions

- Applies only to main hand payout, not side bets
- D.O.N. operates on the post-multiplier amount
- D.O.N. wins do not count toward win streak
- Dealer messages: new `hotStreak` category per tier
- Achievements: `hot_streak_3`, `hot_streak_5`, `hot_streak_7`

---

## Feature 4: Loan Shark Bounty Board

### Core Mechanic

At -$5K debt, a bounty board unlocks in the header. Shows 3 bounties (1 easy, 1 medium, 1 hard) with specific win conditions and mixed rewards. Player picks one to attempt. Complete it for the reward, fail and it rotates out with a new bounty.

### Bounty Structure

```
{
  id: string,
  name: string,
  description: string,
  difficulty: 'easy' | 'medium' | 'hard',
  condition: {
    type: string,
    target: number,
    progress: number,
  },
  reward: {
    type: 'debt_forgiveness' | 'vig_reduction' | 'asset_restore',
    value: number,
    assetId?: string,
  },
  expiresIn: number | null,
}
```

### Condition Types

**Easy:**
- `win_hand` -- Win the next hand. Target: 1.
- `blackjack` -- Get a blackjack. No hand limit.
- `double_win` -- Win a double down. No hand limit.

**Medium:**
- `win_streak` -- Win N hands in a row. Target: 2-3.
- `win_with_value` -- Win with exactly N (e.g., 21, 20). No hand limit.
- `win_N_of_M` -- Win N out of next M hands.

**Hard:**
- `win_streak` -- Win 4-5 in a row.
- `split_win` -- Win after splitting. No hand limit.
- `comeback` -- Gain $X from current bankroll. No hand limit.

### Reward Scaling

| Debt Range | Easy Forgiveness | Medium Forgiveness | Hard Forgiveness |
|---|---|---|---|
| -$5K to -$25K | $2K | $8K | $20K |
| -$25K to -$100K | $10K | $30K | $75K |
| -$100K to -$500K | $25K | $100K | $250K |
| -$500K to -$1M | $50K | $200K | $500K |
| Below -$1M | $100K | $400K | $1M |

**Vig reduction:** Half vig for N hands (easy: 3, medium: 5, hard: 10).

**Asset restoration:** Only when player has lost assets. Medium/hard bounties only.

### State Changes

```
bountyBoard: {
  unlocked: false,
  bounties: [],              // array of 3 bounty objects
  activeBountyId: null,
  completedCount: 0,
  failedCount: 0,
  vigReductionHands: 0,
}
showBountyBoard: false
```

### Actions

- `TOGGLE_BOUNTY_BOARD` -- UI toggle
- `UNLOCK_BOUNTY_BOARD` -- sets `unlocked: true`, populates initial bounties
- `SELECT_BOUNTY` -- payload: `{ bountyId }`. Sets `activeBountyId`.
- `UPDATE_BOUNTY_PROGRESS` -- updates progress on active bounty
- `COMPLETE_BOUNTY` -- apply reward, generate replacement. Payload includes new bounty (randomness outside reducer).
- `FAIL_BOUNTY` -- rotate out, generate replacement. Payload includes new bounty.

### Hook: `useBountyBoard`

Watches state after each `RESOLVE_HAND`:
1. Unlock check: `bankroll <= -5000 && !bountyBoard.unlocked`
2. If active bounty, evaluate:
   - Condition met -> dispatch `COMPLETE_BOUNTY`
   - Condition failed -> dispatch `FAIL_BOUNTY`
   - Otherwise -> dispatch `UPDATE_BOUNTY_PROGRESS`
3. Generate replacement bounties outside reducer (for purity)

### Bounty Generation

Done in the hook (or a utility function called by the hook). Picks from condition pool, filters by difficulty, checks lost assets for restoration rewards, scales rewards to debt level. Passes generated bounties via action payload.

### Vig Reduction Integration

In `DEAL`, check `state.bountyBoard.vigReductionHands > 0`. If so, halve the computed vig amount. In `RESOLVE_HAND`, decrement `vigReductionHands` by 1 if > 0.

### UI: BountyBoardPanel

Opened from header icon (crosshair/target). Only visible when `bountyBoard.unlocked`.

Panel layout:
- Title: "BOUNTY BOARD"
- Subtitle: "The shark has a proposition..."
- 3 bounty cards with:
  - Difficulty badge (green/yellow/red)
  - Name and description
  - Reward preview
  - If active: progress bar/counter
  - If not active and no other is active: "ACCEPT" button
  - Expiry indicator if applicable
- Footer: completed/failed lifetime stats

One bounty active at a time. Active bounty shows "IN PROGRESS", others greyed out.

### Interactions

- Dealer messages: `bountyComplete` and `bountyFailed` categories
- Achievements: `bounty_first`, `bounty_five`, `bounty_asset_back`
- Loan shark: references bounty board on unlock

---

## File Impact Summary

### New Files
- `src/constants/streaks.js` -- streak multiplier thresholds
- `src/constants/bounties.js` -- bounty definitions, condition types, reward scaling, generation logic
- `src/hooks/useDoubleOrNothing.js` -- D.O.N. trigger logic
- `src/hooks/useBountyBoard.js` -- bounty progress tracking
- `src/components/DoubleOrNothingModal.jsx` + `.module.css`
- `src/components/StreakIndicator.jsx` + `.module.css`
- `src/components/BountyBoardPanel.jsx` + `.module.css`

### Modified Files
- `src/constants/sideBets.js` -- remove `MAX_SIDE_BETS`
- `src/reducer/initialState.js` -- new state fields
- `src/reducer/actions.js` -- new action types and creators
- `src/reducer/gameReducer.js` -- all reducer changes
- `src/components/SideBetPanel.jsx` + `.module.css` -- amount picker, long-press, clear
- `src/components/SideBetResults.jsx` + `.module.css` -- consolidated badge
- `src/components/SoloGame.jsx` -- wire up new components and hooks
- `src/components/BettingControls.jsx` -- pass `selectedChipValue` to SideBetPanel
- `src/components/ResultBanner.jsx` -- streak multiplier display, D.O.N. integration
- `src/components/Header.jsx` -- bounty board icon
- `src/constants/dealerLines.js` -- new message categories
- `src/constants/achievements.js` -- new achievements
