# Architecture

Technical reference for the House Money blackjack app. For project overview and setup, see README.md.

## Overview

Mobile-first blackjack web app. React 18 + Vite frontend, Python FastAPI WebSocket backend. CSS Modules + CSS variables for styling (no Tailwind). `useReducer` for all game state (no Redux/Zustand). Self-hosted via Docker on `blackjack.siaahmadi.com`.

## Solo State Shape

```javascript
{
  deck: [],                    // Remaining cards in shoe
  playerHands: [],             // Array of hand objects (see below)
  activeHandIndex: 0,          // Which split hand is being played
  dealerHand: [],              // Dealer's cards
  bankroll: 10000,             // STARTING_BANKROLL — can go negative
  chipStack: [],               // Array of chip values (e.g. [100, 500])
  selectedChipValue: 100,      // Last tapped chip denomination
  vigAmount: 0,                // Vig charged this hand
  vigRate: 0,                  // Current vig rate
  totalVigPaid: 0,             // Lifetime vig paid
  ownedAssets: { watch: true, jewelry: true, ... },
  bettedAssets: [],            // Assets wagered this hand
  inDebtMode: false,           // True after TAKE_LOAN
  tableLevel: 0,               // Cosmetic table tier
  tableLevelChanged: null,     // 'up' | 'down' | null
  phase: 'betting',            // betting | playing | dealerTurn | result
  result: null,                // Aggregate hand outcome
  isAllIn: false,
  dealerMessage: '',           // Current dealer trash talk
  handsPlayed: 0,
  winStreak: 0, loseStreak: 0,
  totalWon: 0, totalLost: 0,
  peakBankroll: 10000, lowestBankroll: 10000,
  bankrollHistory: [],         // Bankroll after each hand (for chart)
  unlockedAchievements: [],    // Achievement IDs
  seenLoanThresholds: [],      // Loan shark thresholds already triggered
  shownDealerLines: {},        // { category: [shown indices] }
  showAssetMenu: false,
  showAchievements: false,
  showDebtTracker: false,
  achievementQueue: [],        // Pending toast notifications
  loanSharkQueue: [],          // Pending loan shark popups
  muted: false,
  notificationsEnabled: true,
}
```

**Hand object:** `{ cards, bet, isDoubledDown, isSplitAces, status, result, payout }`
- `status`: `'playing'` | `'standing'` | `'bust'` | `'done'`
- `result`: `null` | `'win'` | `'lose'` | `'bust'` | `'blackjack'` | `'dealerBust'` | `'push'`

## Multiplayer State Shape

```javascript
{
  connected: false, playerId: null, roomCode: null, error: null,
  playerName: '', players: [], isHost: false,
  phase: 'disconnected',   // disconnected | lobby | betting | playing | dealer_turn | result
  round: 0, dealerHand: [], dealerValue: null, currentPlayerId: null,
  playerStates: {},         // { playerId: serverPlayerState }
  chipStack: [], selectedChipValue: 100, showAssetMenu: false, betSubmitted: false,
  nextRoundAt: null,
  bankrollHistory: [],      // Local tracking for debt tracker chart
  dealerMessage: '',        // From server
  chatMessages: [],
  sessionStats: null, showLeaderboard: false,
  muted: false,
}
```

## Reducer Action Catalog

### Solo — Betting
| Action | Payload | Description |
|--------|---------|-------------|
| `ADD_CHIP` | `value` | Push chip onto chipStack; blocked when bankroll <= 0 && !inDebtMode |
| `UNDO_CHIP` | — | Pop last chip from chipStack |
| `CLEAR_CHIPS` | — | Empty chipStack |
| `SELECT_CHIP` | `value` | Set selectedChipValue |
| `ALL_IN` | — | Set chipStack to entire bankroll (or MIN_BET if broke in debt mode) |
| `BET_ASSET` | `asset` | Wager an asset as side bet |
| `TAKE_LOAN` | — | Enter debt mode (inDebtMode = true) |

### Solo — Gameplay
| Action | Payload | Description |
|--------|---------|-------------|
| `DEAL` | `cards` | Sum chipStack into bet, deal 4 cards, check blackjacks, apply vig |
| `HIT` | `card` | Draw one card for active hand; check bust/21 |
| `STAND` | — | Stand on active hand; advance to next hand or dealer turn |
| `DOUBLE_DOWN` | `card` | Double bet, draw one card, auto-stand; apply vig on borrowed portion |
| `SPLIT` | `cards` | Split pair into two hands; apply vig on new hand's borrowed portion |
| `DEALER_DRAW` | `card` | Add card to dealer hand (dispatched by useDealerTurn hook) |

### Solo — Resolution
| Action | Payload | Description |
|--------|---------|-------------|
| `RESOLVE_HAND` | `outcomes` | Calculate payouts, update bankroll/stats, handle assets, set result |
| `NEW_ROUND` | `freshDeck` | Reset per-round state, optionally reshuffle |
| `RESET_GAME` | `freshDeck` | Full reset to initial state |

### Solo — UI & Systems
| Action | Payload | Description |
|--------|---------|-------------|
| `TOGGLE_ASSET_MENU` | — | Show/hide asset betting overlay |
| `TOGGLE_ACHIEVEMENTS` | — | Show/hide achievement panel |
| `TOGGLE_DEBT_TRACKER` | — | Show/hide financial journey chart |
| `TOGGLE_MUTE` | — | Toggle audio |
| `TOGGLE_NOTIFICATIONS` | — | Toggle toast notifications |
| `DISMISS_ACHIEVEMENT` | — | Dequeue achievement toast |
| `DISMISS_LOAN_SHARK` | — | Dequeue loan shark popup |
| `DISMISS_TABLE_TOAST` | — | Clear table level change indicator |
| `SET_DEALER_MESSAGE` | `message, shownDealerLines` | Update dealer speech bubble |
| `SET_LOAN_SHARK_MESSAGE` | `messages, seenThresholds` | Queue loan shark popups |
| `UNLOCK_ACHIEVEMENT` | `id` | Add achievement to unlocked list + queue |
| `LOAD_ACHIEVEMENTS` | `ids` | Restore achievements from localStorage |
| `LOAD_HIGHEST_DEBT` | `value` | Restore lowestBankroll from localStorage |
| `REMOVE_ASSET` | `assetId` | Mark asset as not owned |

### Multiplayer — Local Actions
`MP_ADD_CHIP`, `MP_UNDO_CHIP`, `MP_CLEAR_CHIPS`, `MP_SELECT_CHIP`, `MP_ALL_IN`, `MP_TOGGLE_ASSET_MENU`, `MP_TOGGLE_MUTE`, `SET_PLAYER_NAME`, `CLEAR_ERROR`, `FORCE_LEAVE`

### Multiplayer — Server Events
`SERVER_ROOM_CREATED`, `SERVER_PLAYER_JOINED`, `SERVER_GAME_STARTED`, `SERVER_BETTING_PHASE`, `SERVER_BET_PLACED`, `SERVER_ASSET_BET`, `SERVER_CARDS_DEALT`, `SERVER_YOUR_TURN`, `SERVER_PLAYER_HIT`, `SERVER_PLAYER_STAND`, `SERVER_PLAYER_DOUBLE_DOWN`, `SERVER_PLAYER_SPLIT`, `SERVER_BET_TIMEOUT`, `SERVER_DEALER_TURN_START`, `SERVER_DEALER_CARD`, `SERVER_ROUND_RESULT`, `SERVER_PLAYER_LEFT`, `SERVER_PLAYER_DISCONNECTED`, `SERVER_PLAYER_RECONNECTED`, `SERVER_LEFT_ROOM`, `SERVER_RECONNECT_FAILED`, `SERVER_RECONNECTED`, `SERVER_ERROR`, `SERVER_QUICK_CHAT`, `SERVER_SESSION_STATS`

## Phase State Machine

```
betting ──DEAL──> playing ──all hands done──> dealerTurn ──resolve──> result ──NEW_ROUND──> betting
                    │                                                    │
                    │ (all hands blackjack/bust)                         │
                    └──────────> result (skip dealer) ──────────────────>│
```

**Edge cases:**
- Blackjack on deal: if all players have blackjack or dealer has blackjack, skip straight to result
- All hands bust (split): when every split hand busts, skip dealer turn
- Split hand hits 21: auto-stand, advance to next hand

## Debt Gate Flow

1. Player starts with $10,000 cash + 6 assets
2. Cash reaches $0 → chip tray locks (ADD_CHIP blocked by `bankroll <= 0 && !inDebtMode`)
3. **Asset gate:** UI shows "BET AN ASSET" overlay. Assets unlock progressively:
   - Watch ($500) at bankroll <= $0
   - Jewelry ($2,000) at <= -$500
   - Car ($35,000) at <= -$2,000
   - Kidney ($50,000) at <= -$10,000
   - House ($250,000) at <= -$30,000
   - Soul ($666,666) at <= -$200,000
4. Player bets asset → if they **lose**, bankroll drops by bet + asset value. Asset is gone.
5. Cycle repeats: deeper debt unlocks next asset
6. **Loan gate:** When all assets lost and bankroll <= 0, "TAKE A LOAN" button appears
7. `TAKE_LOAN` → `inDebtMode = true` → chip tray unlocks. Vig applies on all borrowed bets.
8. If player wins back above $0: `inDebtMode` resets to false

**Key invariant:** `ADD_CHIP` is blocked when `bankroll <= 0 && !inDebtMode`.

## Vig System

Vig (interest) is charged on the **borrowed portion** of each bet when the player is in debt.

**Formula:** `vig = floor(max(0, bet - max(0, bankroll)) * rate)`

**Rate table (from `server/constants.py`):**
| Bankroll Range | Rate |
|---------------|------|
| >= $0 | 2% |
| $0 to -$10K | 4% |
| -$10K to -$50K | 7% |
| -$50K to -$250K | 10% |
| -$250K to -$500K | 15% |
| -$500K to -$1M | 20% |
| -$1M to -$5M | 27.5% |
| Below -$5M | 40% |

**When charged:** DEAL (initial bet), SPLIT (new hand's bet), DOUBLE_DOWN (doubled portion). Vig is deducted from bankroll immediately.

## Asset System

Six assets with escalating value and desperation thresholds:

| Asset | Value | Unlocks At |
|-------|-------|-----------|
| Watch | $500 | $0 |
| Jewelry | $2,000 | -$500 |
| Tesla Model 3 | $35,000 | -$2,000 |
| Kidney | $50,000 | -$10,000 |
| House | $250,000 | -$30,000 |
| Immortal Soul | $666,666 | -$200,000 |

Assets are bet alongside chip bets. Asset value adds to hand[0]'s total bet. On win/push: asset returned. On loss: asset permanently lost (`owned_assets[id] = false`).

## Split System

**Rules:**
- Same **rank** required (not same value — K+Q cannot split)
- Max 4 hands
- Split aces: one card each, auto-stand, no re-split
- Double after split: allowed (except split aces)
- Split hand 21 with 2 cards: pays 1:1 (not blackjack 3:2)

**State:** `playerHands[]` array with `activeHandIndex` tracking which hand is being played. Hands advance left-to-right. When a hand busts or stands, `activeHandIndex` increments to the next playable hand.

## Multiplayer Protocol

### Client → Server
| Message | Fields | Phase |
|---------|--------|-------|
| `create_room` | `name` | — |
| `join_room` | `name`, `code` | — |
| `start_game` | — | lobby |
| `place_bet` | `amount` | betting |
| `bet_asset` | `asset_id` | betting/playing |
| `take_loan` | — | betting |
| `hit` | — | playing |
| `stand` | — | playing |
| `double_down` | — | playing |
| `split` | — | playing |
| `quick_chat` | `message_id` | any |
| `view_stats` | — | any |
| `leave` | — | any |
| `reconnect` | `session_token`, `code`, `player_id` | — |
| `pong` | — | any |

### Server → Client
Game events from `game_logic.py` are prefixed with `SERVER_` by the client reducer. Additional server messages: `ping`, `error`, `room_created`, `player_joined`, `game_started`, `left_room`, `player_left`, `player_disconnected`, `player_reconnected`, `reconnected`, `reconnect_failed`, `session_stats`, `bet_timeout`.

### Room Lifecycle
1. Host creates room → gets 4-char code
2. Players join by code → lobby phase
3. Host starts game → betting phase begins
4. Rounds cycle: betting → playing → dealer_turn → result → betting
5. Players can leave/disconnect at any time; host transfers automatically

### Reconnection
- Each player gets a `session_token` on join
- On disconnect, player stays in room for 5 minutes
- Client auto-reconnects with `session_token` + `code` + `player_id`
- Full state snapshot sent on reconnect

## Server Validation Rules

- **Bet amount:** Must be integer, >= MIN_BET ($25), <= MAX_BET ($10B)
- **Debt gate:** Cash bets blocked when `bankroll <= 0 && !in_debt_mode` (must bet assets or take loan)
- **Bankroll cap:** Bet cannot exceed bankroll when not in debt mode
- **Turn validation:** Player actions only accepted during their turn (`current_player_id` match)
- **Phase validation:** Each action checks correct phase (betting/playing/etc.)
- **Split validation:** Same rank, max 4 hands, no re-split aces, exactly 2 cards
- **Double down validation:** First 2 cards only, not split aces, debt gate check
- **Asset validation:** Must own asset, asset not already bet, bankroll at or below unlock threshold
- **Loan validation:** Must be broke, no remaining assets, not already in debt mode
- **Rate limiting:** Quick chat has 2s cooldown per player
- **Player names:** Max 20 chars, stripped of `<>` characters

## File Map

### Frontend
| Path | Description |
|------|-------------|
| `src/reducer/gameReducer.js` | Solo game reducer — all state transitions |
| `src/reducer/initialState.js` | Solo initial state factory |
| `src/reducer/actions.js` | Action type constants and creators |
| `src/reducer/multiplayerReducer.js` | Multiplayer reducer — server state sync + local UX |
| `src/reducer/multiplayerInitialState.js` | Multiplayer initial state |
| `src/hooks/useDealerTurn.js` | Animated dealer card drawing (600ms apart) |
| `src/hooks/useDealerMessage.js` | Dealer trash talk trigger effects |
| `src/hooks/useAchievements.js` | Achievement unlock checks on state changes |
| `src/hooks/useLoanShark.js` | Loan shark popup triggers at debt thresholds |
| `src/hooks/useWebSocket.js` | WebSocket connection management + reconnection |
| `src/hooks/useSound.js` | Solo sound effects |
| `src/hooks/useMultiplayerSound.js` | Multiplayer sound effects |
| `src/hooks/useSessionPersistence.js` | localStorage save/load |
| `src/constants/dealerLines.js` | 17 categories of dealer trash talk |
| `src/constants/achievements.js` | Achievement definitions |
| `src/constants/loanSharkMessages.js` | Loan shark message thresholds |
| `src/constants/assets.js` | Asset definitions (client-side) |
| `src/constants/cards.js` | Card/deck constants |
| `src/constants/chips.js` | Chip denominations and colors |
| `src/constants/gameConfig.js` | STARTING_BANKROLL, MIN_BET, etc. |
| `src/utils/cardUtils.js` | createDeck, shuffle, handValue, isSoft, isBlackjack |
| `src/utils/dealerMessages.js` | selectDealerLine, determineDealerCategory |
| `src/utils/formatters.js` | formatMoney and other display helpers |
| `src/utils/audioManager.js` | Web Audio API sound manager |
| `src/styles/theme.css` | CSS variables, felt texture, global styles |
| `src/styles/animations.css` | Keyframe animations |

### Backend
| Path | Description |
|------|-------------|
| `server/main.py` | FastAPI app, WebSocket handler, message routing |
| `server/game_logic.py` | GameEngine — all game rules, resolution, serialization |
| `server/game_room.py` | GameRoom/PlayerState dataclasses, room management |
| `server/card_engine.py` | Server-side deck/card utilities |
| `server/constants.py` | Game config, assets, vig tiers, dealer lines, quick chat |
| `server/test_game.py` | Pytest suite for game logic |
