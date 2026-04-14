# PvP Slots Frontend (Phase 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete PvP Slots Battle frontend — reducer, lobby, battle view, score bars, and wrapper — wired to the existing server WebSocket handlers.

**Architecture:** Server-driven state via `slotsBattleReducer` (same pattern as `multiplayerReducer.js`). The existing `useWebSocket` hook dispatches `SERVER_${TYPE}` actions — each reducer ignores types it doesn't recognize. Lobby reuses Lobby.jsx visual patterns with slots-specific config (rounds/bet). Battle view reuses `SlotMachine` from solo slots. `MultiplayerSlotsApp` is the wrapper (reducer + WebSocket), rendered by `App.jsx` when `mode === 'multiplayer-slots'`.

**Tech Stack:** React 19, CSS Modules, `useReducer`, existing `useWebSocket` hook, existing `SlotMachine`/`SlotReel` components.

---

## File Structure

```
src/
  reducer/
    slotsBattleInitialState.js   # createSlotsBattleInitialState() + initial state object
    slotsBattleReducer.js        # Server-driven PvP slots reducer
  components/
    slots/
      SlotsLobby.jsx             # Lobby: name input, create/join, config panel, player list
      SlotsLobby.module.css      # Lobby styles (mirrors Lobby.module.css patterns)
      MultiplayerSlots.jsx       # Battle view: slot machine, spin, round results, final results
      MultiplayerSlots.module.css
      ScoreBar.jsx               # Horizontal score comparison bars
      ScoreBar.module.css
      MultiplayerSlotsApp.jsx    # Wrapper: reducer + useWebSocket + phase routing

Modified:
  src/App.jsx                    # Add multiplayer-slots mode rendering
  src/components/ModeSelect.jsx  # Enable BATTLE button for slots
  src/hooks/useWebSocket.js      # Add slots session persistence + queueable types
```

---

### Task 1: Battle Initial State

**Files:**
- Create: `src/reducer/slotsBattleInitialState.js`

- [ ] **Step 1: Create the initial state file**

This file defines the state shape for PvP slots — server-driven state (same pattern as `src/reducer/multiplayerInitialState.js`). All game data arrives via `action.payload` from `useWebSocket`.

```javascript
export const slotsBattleInitialState = {
  // Connection
  connected: false,
  playerId: null,
  roomCode: null,
  sessionToken: null,
  error: null,

  // Lobby
  playerName: '',
  players: [],
  isHost: false,

  // Game config
  totalRounds: 10,
  betPerRound: 100,

  // Game state (from server)
  phase: 'disconnected', // disconnected | lobby | spinning | round_result | final_result
  currentRound: 0,
  pot: 0,
  buyIn: 0,

  // Player states — pid → { name, totalScore, hasSpun, roundScore, reels, matchType, connected, isHost }
  playerStates: {},

  // Round result — array of { player_id, name, round_score, total_score, reels, match_type }
  roundResults: null,

  // Final result
  finalStandings: null,
  winnerId: null,
  winnerPayout: 0,
  houseCut: 0,
  payoutType: null, // 'winner' | 'refund'
  isTie: false,

  // Audio
  muted: false,
}

export function createSlotsBattleInitialState() {
  return { ...slotsBattleInitialState }
}
```

- [ ] **Step 2: Verify the file is importable**

Run: `cd /Users/sia/Desktop/blackjack && node -e "import('./src/reducer/slotsBattleInitialState.js').then(m => console.log(Object.keys(m.slotsBattleInitialState).length, 'keys')).catch(e => console.error(e.message))"`
Expected: `21 keys`

- [ ] **Step 3: Commit**

```bash
git add src/reducer/slotsBattleInitialState.js
git commit -m "feat(slots): add PvP battle initial state"
```

---

### Task 2: Battle Reducer

**Files:**
- Create: `src/reducer/slotsBattleReducer.js`
- Reference: `src/reducer/multiplayerReducer.js` (follow the same patterns)

The reducer handles:
1. Connection actions (`WS_CONNECTED`, `WS_DISCONNECTED`)
2. Local-only actions (player name, clear error, force leave, toggle mute)
3. Server actions — each arrives as `SERVER_SLOTS_${TYPE}` with `action.payload` containing the server message

The server sends these message types (which `useWebSocket` converts to `SERVER_SLOTS_ROOM_CREATED`, etc.):
- `slots_room_created` — room code, player_id, session_token, players list
- `slots_player_joined` — player_name, player_id, session_token (only for joiner), code, players list
- `slots_configured` — total_rounds, bet_per_round
- `slots_game_started` — total_rounds, bet_per_round, current_round, buy_in, pot, state (full room state)
- `slots_spin_result` — player_id, reels, multiplier, match_type, matched_symbol, total_score
- `slots_round_result` — current_round, total_rounds, standings array, state
- `slots_round_started` — current_round, total_rounds, state
- `slots_game_ended` — final_standings, pot, buy_in, is_tie, payout_type, winner_id, winner_payout, house_cut, state
- `slots_player_left` — player_name, players list, new_host
- `slots_returned_to_lobby` — state (full room state)
- `left_room` — confirmation of own leave
- `error` — error message

- [ ] **Step 1: Create the reducer**

```javascript
import { slotsBattleInitialState } from './slotsBattleInitialState'

// Local-only action types
export const SLOTS_BATTLE_SET_NAME = 'SLOTS_BATTLE_SET_NAME'
export const SLOTS_BATTLE_CLEAR_ERROR = 'SLOTS_BATTLE_CLEAR_ERROR'
export const SLOTS_BATTLE_FORCE_LEAVE = 'SLOTS_BATTLE_FORCE_LEAVE'
export const SLOTS_BATTLE_TOGGLE_MUTE = 'SLOTS_BATTLE_TOGGLE_MUTE'

/** Extract players list and host status from a players array */
function extractPlayersInfo(playerId, players) {
  if (!players) return {}
  const isHost = players.some(p => p.player_id === playerId && p.is_host)
  return { players, isHost }
}

/** Apply full room state snapshot from server */
function applyRoomState(state, roomState) {
  if (!roomState) return state
  return {
    ...state,
    phase: roomState.phase ?? state.phase,
    currentRound: roomState.current_round ?? state.currentRound,
    totalRounds: roomState.total_rounds ?? state.totalRounds,
    betPerRound: roomState.bet_per_round ?? state.betPerRound,
    buyIn: roomState.buy_in ?? state.buyIn,
    pot: roomState.pot ?? state.pot,
    playerStates: roomState.player_states ?? state.playerStates,
  }
}

export function slotsBattleReducer(state, action) {
  switch (action.type) {

    // ===== Connection =====

    case 'WS_CONNECTED':
      return { ...state, connected: true, error: null }

    case 'WS_DISCONNECTED':
      return { ...state, connected: false }

    // ===== Local-only =====

    case SLOTS_BATTLE_SET_NAME:
      return { ...state, playerName: action.name }

    case SLOTS_BATTLE_CLEAR_ERROR:
      return { ...state, error: null }

    case SLOTS_BATTLE_FORCE_LEAVE:
      return { ...slotsBattleInitialState, connected: state.connected, playerName: state.playerName }

    case SLOTS_BATTLE_TOGGLE_MUTE:
      return { ...state, muted: !state.muted }

    // ===== Server: Lobby =====

    case 'SERVER_SLOTS_ROOM_CREATED': {
      const { code, player_id, session_token, players } = action.payload
      return {
        ...state,
        roomCode: code,
        playerId: player_id,
        sessionToken: session_token,
        phase: 'lobby',
        error: null,
        ...extractPlayersInfo(player_id, players),
      }
    }

    case 'SERVER_SLOTS_PLAYER_JOINED': {
      const { player_id, session_token, code, players } = action.payload
      const newPlayerId = state.playerId || player_id
      const updates = {
        ...state,
        playerId: newPlayerId,
        roomCode: code || state.roomCode,
        phase: 'lobby',
        error: null,
        ...extractPlayersInfo(newPlayerId, players),
      }
      // Only set session_token if this message is for us (has token)
      if (session_token) {
        updates.sessionToken = session_token
      }
      return updates
    }

    case 'SERVER_SLOTS_CONFIGURED': {
      const { total_rounds, bet_per_round } = action.payload
      return {
        ...state,
        totalRounds: total_rounds ?? state.totalRounds,
        betPerRound: bet_per_round ?? state.betPerRound,
      }
    }

    // ===== Server: Game =====

    case 'SERVER_SLOTS_GAME_STARTED': {
      const p = action.payload
      let newState = {
        ...state,
        phase: 'spinning',
        currentRound: p.current_round,
        totalRounds: p.total_rounds,
        betPerRound: p.bet_per_round,
        buyIn: p.buy_in,
        pot: p.pot,
        roundResults: null,
        finalStandings: null,
        winnerId: null,
        isTie: false,
      }
      if (p.state) {
        newState = applyRoomState(newState, p.state)
      }
      return newState
    }

    case 'SERVER_SLOTS_SPIN_RESULT': {
      const { player_id, reels, multiplier, match_type, total_score } = action.payload
      const existingPlayer = state.playerStates[player_id] || {}
      return {
        ...state,
        playerStates: {
          ...state.playerStates,
          [player_id]: {
            ...existingPlayer,
            reels,
            roundScore: multiplier,
            matchType: match_type,
            totalScore: total_score,
            hasSpun: true,
          },
        },
      }
    }

    case 'SERVER_SLOTS_ROUND_RESULT': {
      const { standings } = action.payload
      let newState = { ...state, roundResults: standings, phase: 'round_result' }
      if (action.payload.state) {
        newState = applyRoomState(newState, action.payload.state)
      }
      return newState
    }

    case 'SERVER_SLOTS_ROUND_STARTED': {
      let newState = {
        ...state,
        phase: 'spinning',
        currentRound: action.payload.current_round,
        roundResults: null,
      }
      if (action.payload.state) {
        newState = applyRoomState(newState, action.payload.state)
      }
      return newState
    }

    case 'SERVER_SLOTS_GAME_ENDED': {
      const p = action.payload
      let newState = {
        ...state,
        phase: 'final_result',
        finalStandings: p.final_standings,
        pot: p.pot,
        buyIn: p.buy_in,
        isTie: p.is_tie,
        payoutType: p.payout_type,
        winnerId: p.winner_id,
        winnerPayout: p.winner_payout,
        houseCut: p.house_cut,
      }
      if (p.state) {
        newState = applyRoomState(newState, p.state)
      }
      return newState
    }

    case 'SERVER_SLOTS_PLAYER_LEFT': {
      const { players } = action.payload
      return {
        ...state,
        ...extractPlayersInfo(state.playerId, players),
      }
    }

    case 'SERVER_SLOTS_RETURNED_TO_LOBBY': {
      let newState = {
        ...state,
        phase: 'lobby',
        currentRound: 0,
        roundResults: null,
        finalStandings: null,
        winnerId: null,
        isTie: false,
        payoutType: null,
      }
      if (action.payload.state) {
        newState = applyRoomState(newState, action.payload.state)
      }
      return newState
    }

    // ===== Server: Leave/Error =====

    case 'SERVER_LEFT_ROOM':
      return { ...slotsBattleInitialState, connected: state.connected, playerName: state.playerName }

    case 'SERVER_ERROR':
      return { ...state, error: action.payload.message }

    default:
      return state
  }
}
```

- [ ] **Step 2: Verify the reducer is importable**

Run: `cd /Users/sia/Desktop/blackjack && node -e "import('./src/reducer/slotsBattleReducer.js').then(m => console.log(typeof m.slotsBattleReducer)).catch(e => console.error(e.message))"`
Expected: `function`

- [ ] **Step 3: Write tests for the reducer**

Create `src/reducer/__tests__/slotsBattleReducer.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { slotsBattleReducer, SLOTS_BATTLE_SET_NAME, SLOTS_BATTLE_CLEAR_ERROR, SLOTS_BATTLE_FORCE_LEAVE, SLOTS_BATTLE_TOGGLE_MUTE } from '../slotsBattleReducer'
import { slotsBattleInitialState, createSlotsBattleInitialState } from '../slotsBattleInitialState'

function makeState(overrides = {}) {
  return { ...createSlotsBattleInitialState(), ...overrides }
}

describe('slotsBattleReducer', () => {
  // --- Connection ---
  it('handles WS_CONNECTED', () => {
    const state = makeState({ connected: false, error: 'old error' })
    const next = slotsBattleReducer(state, { type: 'WS_CONNECTED' })
    expect(next.connected).toBe(true)
    expect(next.error).toBeNull()
  })

  it('handles WS_DISCONNECTED', () => {
    const state = makeState({ connected: true })
    const next = slotsBattleReducer(state, { type: 'WS_DISCONNECTED' })
    expect(next.connected).toBe(false)
  })

  // --- Local-only ---
  it('handles SLOTS_BATTLE_SET_NAME', () => {
    const state = makeState()
    const next = slotsBattleReducer(state, { type: SLOTS_BATTLE_SET_NAME, name: 'Alice' })
    expect(next.playerName).toBe('Alice')
  })

  it('handles SLOTS_BATTLE_CLEAR_ERROR', () => {
    const state = makeState({ error: 'some error' })
    const next = slotsBattleReducer(state, { type: SLOTS_BATTLE_CLEAR_ERROR })
    expect(next.error).toBeNull()
  })

  it('handles SLOTS_BATTLE_FORCE_LEAVE preserving connection and name', () => {
    const state = makeState({ connected: true, playerName: 'Bob', roomCode: 'ABCD', playerId: 'p1' })
    const next = slotsBattleReducer(state, { type: SLOTS_BATTLE_FORCE_LEAVE })
    expect(next.connected).toBe(true)
    expect(next.playerName).toBe('Bob')
    expect(next.roomCode).toBeNull()
    expect(next.playerId).toBeNull()
  })

  it('handles SLOTS_BATTLE_TOGGLE_MUTE', () => {
    const state = makeState({ muted: false })
    const next = slotsBattleReducer(state, { type: SLOTS_BATTLE_TOGGLE_MUTE })
    expect(next.muted).toBe(true)
    const next2 = slotsBattleReducer(next, { type: SLOTS_BATTLE_TOGGLE_MUTE })
    expect(next2.muted).toBe(false)
  })

  // --- Server: Lobby ---
  it('handles SERVER_SLOTS_ROOM_CREATED', () => {
    const state = makeState({ connected: true })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_ROOM_CREATED',
      payload: {
        code: 'WXYZ',
        player_id: 'p1',
        session_token: 'tok1',
        players: [{ player_id: 'p1', name: 'Alice', is_host: true, connected: true }],
      },
    })
    expect(next.roomCode).toBe('WXYZ')
    expect(next.playerId).toBe('p1')
    expect(next.sessionToken).toBe('tok1')
    expect(next.phase).toBe('lobby')
    expect(next.isHost).toBe(true)
    expect(next.players).toHaveLength(1)
  })

  it('handles SERVER_SLOTS_PLAYER_JOINED for joiner', () => {
    const state = makeState({ connected: true })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_PLAYER_JOINED',
      payload: {
        player_id: 'p2',
        session_token: 'tok2',
        code: 'WXYZ',
        players: [
          { player_id: 'p1', name: 'Alice', is_host: true, connected: true },
          { player_id: 'p2', name: 'Bob', is_host: false, connected: true },
        ],
      },
    })
    expect(next.playerId).toBe('p2')
    expect(next.sessionToken).toBe('tok2')
    expect(next.roomCode).toBe('WXYZ')
    expect(next.isHost).toBe(false)
    expect(next.players).toHaveLength(2)
  })

  it('handles SERVER_SLOTS_PLAYER_JOINED for existing player (broadcast)', () => {
    const state = makeState({ connected: true, playerId: 'p1', roomCode: 'WXYZ' })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_PLAYER_JOINED',
      payload: {
        player_id: 'p2',
        player_name: 'Bob',
        players: [
          { player_id: 'p1', name: 'Alice', is_host: true, connected: true },
          { player_id: 'p2', name: 'Bob', is_host: false, connected: true },
        ],
      },
    })
    // playerId should stay as p1, not change to p2
    expect(next.playerId).toBe('p1')
    expect(next.isHost).toBe(true)
    expect(next.players).toHaveLength(2)
  })

  it('handles SERVER_SLOTS_CONFIGURED', () => {
    const state = makeState({ totalRounds: 10, betPerRound: 100 })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_CONFIGURED',
      payload: { total_rounds: 15, bet_per_round: 500 },
    })
    expect(next.totalRounds).toBe(15)
    expect(next.betPerRound).toBe(500)
  })

  // --- Server: Game ---
  it('handles SERVER_SLOTS_GAME_STARTED', () => {
    const state = makeState({ phase: 'lobby', playerId: 'p1' })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_GAME_STARTED',
      payload: {
        total_rounds: 10,
        bet_per_round: 100,
        current_round: 1,
        buy_in: 1000,
        pot: 2000,
        state: {
          phase: 'spinning',
          current_round: 1,
          total_rounds: 10,
          bet_per_round: 100,
          buy_in: 1000,
          pot: 2000,
          player_states: {
            p1: { name: 'Alice', total_score: 0, has_spun: false, round_score: 0, reels: null, match_type: null },
            p2: { name: 'Bob', total_score: 0, has_spun: false, round_score: 0, reels: null, match_type: null },
          },
        },
      },
    })
    expect(next.phase).toBe('spinning')
    expect(next.currentRound).toBe(1)
    expect(next.pot).toBe(2000)
    expect(next.buyIn).toBe(1000)
    expect(Object.keys(next.playerStates)).toHaveLength(2)
  })

  it('handles SERVER_SLOTS_SPIN_RESULT', () => {
    const state = makeState({
      phase: 'spinning',
      playerStates: {
        p1: { name: 'Alice', totalScore: 0, hasSpun: false },
        p2: { name: 'Bob', totalScore: 0, hasSpun: false },
      },
    })
    const reels = [
      { index: 0, name: 'Cherry' },
      { index: 0, name: 'Cherry' },
      { index: 1, name: 'Lemon' },
    ]
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_SPIN_RESULT',
      payload: {
        player_id: 'p1',
        reels,
        multiplier: 0.5,
        match_type: 'pair',
        total_score: 0.5,
      },
    })
    expect(next.playerStates.p1.hasSpun).toBe(true)
    expect(next.playerStates.p1.reels).toEqual(reels)
    expect(next.playerStates.p1.matchType).toBe('pair')
    expect(next.playerStates.p1.totalScore).toBe(0.5)
    // p2 should be unchanged
    expect(next.playerStates.p2.hasSpun).toBe(false)
  })

  it('handles SERVER_SLOTS_ROUND_RESULT', () => {
    const state = makeState({ phase: 'spinning' })
    const standings = [
      { player_id: 'p1', name: 'Alice', round_score: 5, total_score: 5 },
      { player_id: 'p2', name: 'Bob', round_score: 3, total_score: 3 },
    ]
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_ROUND_RESULT',
      payload: { current_round: 1, total_rounds: 10, standings },
    })
    expect(next.phase).toBe('round_result')
    expect(next.roundResults).toEqual(standings)
  })

  it('handles SERVER_SLOTS_ROUND_STARTED', () => {
    const state = makeState({ phase: 'round_result', currentRound: 1 })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_ROUND_STARTED',
      payload: { current_round: 2, total_rounds: 10 },
    })
    expect(next.phase).toBe('spinning')
    expect(next.currentRound).toBe(2)
    expect(next.roundResults).toBeNull()
  })

  it('handles SERVER_SLOTS_GAME_ENDED with winner', () => {
    const state = makeState({ phase: 'round_result' })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_GAME_ENDED',
      payload: {
        final_standings: [
          { player_id: 'p1', name: 'Alice', total_score: 50 },
          { player_id: 'p2', name: 'Bob', total_score: 30 },
        ],
        pot: 2000,
        buy_in: 1000,
        is_tie: false,
        payout_type: 'winner',
        winner_id: 'p1',
        winner_payout: 1840,
        house_cut: 160,
      },
    })
    expect(next.phase).toBe('final_result')
    expect(next.isTie).toBe(false)
    expect(next.winnerId).toBe('p1')
    expect(next.winnerPayout).toBe(1840)
    expect(next.houseCut).toBe(160)
    expect(next.finalStandings).toHaveLength(2)
  })

  it('handles SERVER_SLOTS_GAME_ENDED with tie', () => {
    const state = makeState({ phase: 'round_result' })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_GAME_ENDED',
      payload: {
        final_standings: [
          { player_id: 'p1', name: 'Alice', total_score: 50 },
          { player_id: 'p2', name: 'Bob', total_score: 50 },
        ],
        pot: 2000,
        buy_in: 1000,
        is_tie: true,
        payout_type: 'refund',
        winner_id: null,
        winner_payout: 1000,
        house_cut: 0,
      },
    })
    expect(next.isTie).toBe(true)
    expect(next.payoutType).toBe('refund')
  })

  it('handles SERVER_SLOTS_PLAYER_LEFT', () => {
    const state = makeState({
      playerId: 'p1',
      players: [
        { player_id: 'p1', name: 'Alice', is_host: true, connected: true },
        { player_id: 'p2', name: 'Bob', is_host: false, connected: true },
      ],
    })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_PLAYER_LEFT',
      payload: {
        player_name: 'Bob',
        players: [{ player_id: 'p1', name: 'Alice', is_host: true, connected: true }],
      },
    })
    expect(next.players).toHaveLength(1)
    expect(next.isHost).toBe(true)
  })

  it('handles SERVER_SLOTS_RETURNED_TO_LOBBY', () => {
    const state = makeState({ phase: 'final_result', currentRound: 10, winnerId: 'p1' })
    const next = slotsBattleReducer(state, {
      type: 'SERVER_SLOTS_RETURNED_TO_LOBBY',
      payload: {
        state: {
          phase: 'lobby',
          current_round: 0,
          player_states: {},
        },
      },
    })
    expect(next.phase).toBe('lobby')
    expect(next.currentRound).toBe(0)
    expect(next.finalStandings).toBeNull()
    expect(next.winnerId).toBeNull()
  })

  it('handles SERVER_LEFT_ROOM', () => {
    const state = makeState({ connected: true, playerName: 'Alice', roomCode: 'WXYZ', playerId: 'p1', phase: 'lobby' })
    const next = slotsBattleReducer(state, { type: 'SERVER_LEFT_ROOM', payload: {} })
    expect(next.roomCode).toBeNull()
    expect(next.playerId).toBeNull()
    expect(next.connected).toBe(true)
    expect(next.playerName).toBe('Alice')
  })

  it('handles SERVER_ERROR', () => {
    const state = makeState()
    const next = slotsBattleReducer(state, { type: 'SERVER_ERROR', payload: { message: 'Room not found' } })
    expect(next.error).toBe('Room not found')
  })

  it('returns state for unknown action types', () => {
    const state = makeState()
    const next = slotsBattleReducer(state, { type: 'UNKNOWN_ACTION' })
    expect(next).toBe(state)
  })
})
```

- [ ] **Step 4: Run the tests**

Run: `cd /Users/sia/Desktop/blackjack && npx vitest run src/reducer/__tests__/slotsBattleReducer.test.js`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/reducer/slotsBattleReducer.js src/reducer/__tests__/slotsBattleReducer.test.js
git commit -m "feat(slots): add PvP battle reducer with tests"
```

---

### Task 3: Update useWebSocket for Slots Session Persistence

**Files:**
- Modify: `src/hooks/useWebSocket.js`

The `useWebSocket` hook needs two changes:
1. Add `slots_room_created` and `slots_player_joined` to the session persistence logic (save `mp_player_id`, `mp_room_code`, `mp_session_token` to sessionStorage)
2. Add `create_slots_room` and `join_slots_room` to the `QUEUEABLE_TYPES` set

**Important:** The hook already converts any `message.type` to `SERVER_${TYPE.toUpperCase()}` — so `slots_room_created` becomes `SERVER_SLOTS_ROOM_CREATED` automatically. No changes needed for dispatch.

- [ ] **Step 1: Add slots types to QUEUEABLE_TYPES**

In `src/hooks/useWebSocket.js`, change line 10:

```javascript
// Before:
const QUEUEABLE_TYPES = new Set(['create_room', 'join_room'])

// After:
const QUEUEABLE_TYPES = new Set(['create_room', 'join_room', 'create_slots_room', 'join_slots_room'])
```

- [ ] **Step 2: Add session persistence for slots_room_created**

After the existing `message.type === 'room_created'` block (around line 87), add a parallel block for slots:

```javascript
if (message.type === 'slots_room_created') {
  if (message.player_id) sessionStorage.setItem('mp_player_id', message.player_id)
  if (message.code) sessionStorage.setItem('mp_room_code', message.code)
  if (message.session_token) sessionStorage.setItem('mp_session_token', message.session_token)
}
```

- [ ] **Step 3: Add session persistence for slots_player_joined**

After the existing `message.type === 'player_joined'` block (around line 91), add:

```javascript
if (message.type === 'slots_player_joined' && !sessionStorage.getItem('mp_player_id')) {
  if (message.player_id) sessionStorage.setItem('mp_player_id', message.player_id)
  if (message.code) sessionStorage.setItem('mp_room_code', message.code)
  if (message.session_token) sessionStorage.setItem('mp_session_token', message.session_token)
}
```

- [ ] **Step 4: Add slots_room_created and slots_player_joined to reconnect counter reset**

In the block around line 109 that resets reconnect and flushes pending messages, add the slots types:

```javascript
// Before:
if (message.type === 'room_created' || message.type === 'player_joined' || message.type === 'reconnected') {

// After:
if (message.type === 'room_created' || message.type === 'player_joined' || message.type === 'reconnected' ||
    message.type === 'slots_room_created' || message.type === 'slots_player_joined') {
```

- [ ] **Step 5: Verify build succeeds**

Run: `cd /Users/sia/Desktop/blackjack && npm run build`
Expected: Build succeeds without errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useWebSocket.js
git commit -m "feat(slots): add PvP slots session persistence to useWebSocket"
```

---

### Task 4: SlotsLobby Component

**Files:**
- Create: `src/components/slots/SlotsLobby.jsx`
- Create: `src/components/slots/SlotsLobby.module.css`

The SlotsLobby mirrors the blackjack `Lobby.jsx` pattern: name input, create/join, waiting room with player list. The key addition is a host config panel for rounds and bet per round.

Props: `{ state, send, dispatch, onBack }`

Where:
- `state` = slotsBattle reducer state
- `send` = useWebSocket send function
- `dispatch` = slotsBattle reducer dispatch
- `onBack` = callback to leave and return to mode select

The lobby sends these messages to the server:
- `create_slots_room` with `{ player_name }`
- `join_slots_room` with `{ code, player_name }`
- `configure_slots` with `{ total_rounds }` or `{ bet_per_round }`
- `start_slots` (no payload)
- `leave_slots` (no payload)

- [ ] **Step 1: Create SlotsLobby.module.css**

Re-use the same styling patterns from `Lobby.module.css` plus config-specific styles:

```css
.container {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 24px;
  position: relative;
}

.backButton {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 16px);
  left: 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-dim);
  letter-spacing: 1px;
  padding: 8px 12px;
  min-height: 44px;
  touch-action: manipulation;
}

.brand {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.logo {
  font-family: 'Playfair Display', serif;
  font-size: 32px;
  font-weight: 900;
  color: var(--gold);
  letter-spacing: 3px;
  text-shadow: 0 2px 12px var(--gold-glow);
}

.subtitle {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-dim);
  letter-spacing: 3px;
}

.connecting {
  font-size: 14px;
  color: var(--text-dim);
  animation: pulse 1.5s ease-in-out infinite;
}

/* Main view */
.mainView,
.joinView {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 300px;
}

.nameInput {
  width: 100%;
  padding: 14px 16px;
  border-radius: 10px;
  border: 2px solid rgba(240, 200, 80, 0.2);
  background: var(--surface);
  color: var(--text-primary);
  font-size: 16px;
  text-align: center;
  transition: border-color 0.2s;
  -webkit-appearance: none;
  appearance: none;
}

.nameInput:focus {
  border-color: var(--gold-dim);
}

.nameInput:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

.nameInput::placeholder {
  color: var(--text-dim);
}

.createButton {
  width: 100%;
  padding: 16px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(180deg, var(--gold) 0%, var(--gold-dim) 100%);
  color: var(--felt-dark);
  font-family: 'Playfair Display', serif;
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 2px;
  cursor: pointer;
  transition: transform 0.1s;
  touch-action: manipulation;
}

.createButton:active:not(:disabled) {
  transform: scale(0.97);
}

.createButton:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.dividerLine {
  flex: 1;
  height: 1px;
  background: var(--border-subtle);
}

.dividerText {
  font-size: 12px;
  color: var(--text-dim);
  letter-spacing: 2px;
}

.joinViewButton {
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  border: 2px solid rgba(240, 200, 80, 0.25);
  background: transparent;
  color: var(--text-primary);
  font-family: 'Playfair Display', serif;
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 2px;
  cursor: pointer;
  transition: all 0.2s;
  touch-action: manipulation;
}

.joinViewButton:active {
  transform: scale(0.97);
}

/* Join view */
.codeLabel {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-dim);
  letter-spacing: 3px;
  margin-top: 4px;
}

.codeInputRow {
  display: flex;
  gap: 10px;
}

.codeChar {
  width: 52px;
  height: 62px;
  border-radius: 10px;
  border: 2px solid rgba(240, 200, 80, 0.25);
  background: var(--surface);
  color: var(--gold);
  font-family: 'Outfit', sans-serif;
  font-size: 26px;
  font-weight: 700;
  text-align: center;
  text-transform: uppercase;
  transition: border-color 0.2s;
  -webkit-appearance: none;
  appearance: none;
}

.codeChar:focus {
  border-color: var(--gold);
  box-shadow: 0 0 12px var(--gold-glow);
}

.codeChar:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

.joinButton {
  width: 100%;
  padding: 16px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(180deg, var(--gold) 0%, var(--gold-dim) 100%);
  color: var(--felt-dark);
  font-family: 'Playfair Display', serif;
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 2px;
  cursor: pointer;
  transition: transform 0.1s;
  touch-action: manipulation;
}

.joinButton:active:not(:disabled) {
  transform: scale(0.97);
}

.joinButton:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.backToMain {
  font-size: 13px;
  color: var(--text-dim);
  letter-spacing: 1px;
  padding: 8px 12px;
  min-height: 44px;
  touch-action: manipulation;
}

/* Waiting room */
.waitingRoom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 320px;
}

.waitingLabel {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-dim);
  letter-spacing: 3px;
}

.roomCode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-family: 'Outfit', sans-serif;
  font-size: 48px;
  font-weight: 700;
  color: var(--gold);
  letter-spacing: 12px;
  text-shadow: 0 2px 16px var(--gold-glow);
  padding: 12px 24px;
  cursor: pointer;
}

.copyHint {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-dim);
  letter-spacing: 1px;
}

.playerList {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border-faint);
}

.playerListLabel {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-dim);
  letter-spacing: 2px;
  margin-bottom: 4px;
}

.playerItem {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.statusDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.online {
  background: var(--success);
  box-shadow: 0 0 6px rgba(39, 174, 96, 0.5);
}

.offline {
  background: var(--text-dim);
}

.playerName {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.youBadge {
  font-size: 10px;
  font-weight: 700;
  color: var(--gold);
  letter-spacing: 1px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(240, 200, 80, 0.15);
}

.hostBadge {
  font-size: 10px;
  font-weight: 700;
  color: var(--felt-dark);
  letter-spacing: 1px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--gold);
}

/* Config panel */
.configPanel {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border-faint);
}

.configLabel {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-dim);
  letter-spacing: 2px;
}

.configRow {
  display: flex;
  gap: 8px;
}

.configOption {
  flex: 1;
  padding: 10px 4px;
  border-radius: 8px;
  border: 2px solid rgba(240, 200, 80, 0.15);
  background: transparent;
  color: var(--text-dim);
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s;
  touch-action: manipulation;
}

.configOption:active {
  transform: scale(0.95);
}

.configOptionActive {
  border-color: var(--gold);
  background: rgba(240, 200, 80, 0.12);
  color: var(--gold);
}

.buyInDisplay {
  text-align: center;
  padding: 8px;
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  color: var(--text-dim);
  letter-spacing: 1px;
}

.buyInAmount {
  color: var(--gold);
  font-weight: 700;
  font-size: 15px;
}

/* Config display for non-host */
.configDisplay {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border-faint);
  text-align: center;
}

.configDisplayRow {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}

.configDisplayLabel {
  font-size: 13px;
  color: var(--text-dim);
}

.configDisplayValue {
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.startButton {
  width: 100%;
  padding: 16px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(180deg, var(--gold) 0%, var(--gold-dim) 100%);
  color: var(--felt-dark);
  font-family: 'Playfair Display', serif;
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 2px;
  cursor: pointer;
  transition: transform 0.1s;
  margin-top: 8px;
  touch-action: manipulation;
}

.startButton:active:not(:disabled) {
  transform: scale(0.97);
}

.startButton:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.waitingHint {
  font-size: 14px;
  color: var(--text-dim);
  animation: pulse 1.5s ease-in-out infinite;
  margin-top: 8px;
}

.leaveButton {
  font-size: 13px;
  color: var(--danger);
  letter-spacing: 1px;
  padding: 8px 12px;
  min-height: 44px;
  margin-top: 4px;
  touch-action: manipulation;
}

.error {
  padding: 10px 16px;
  border-radius: 8px;
  background: rgba(231, 76, 60, 0.15);
  border: 1px solid rgba(231, 76, 60, 0.3);
  color: var(--danger);
  font-size: 13px;
  text-align: center;
  max-width: 300px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

- [ ] **Step 2: Create SlotsLobby.jsx**

```jsx
import { useState, useRef, useCallback } from 'react'
import { SLOTS_BATTLE_SET_NAME, SLOTS_BATTLE_CLEAR_ERROR, SLOTS_BATTLE_FORCE_LEAVE } from '../../reducer/slotsBattleReducer'
import { ROUND_OPTIONS } from '../../constants/slotSymbols'
import { formatMoney } from '../../utils/formatters'
import styles from './SlotsLobby.module.css'

const VALID_BETS = [100, 500, 1000, 5000]
const BET_LABELS = { 100: '$100', 500: '$500', 1000: '$1K', 5000: '$5K' }

function SlotsLobby({ state, send, dispatch, onBack }) {
  const [view, setView] = useState('main') // 'main' | 'join'
  const [roomCodeInput, setRoomCodeInput] = useState(['', '', '', ''])
  const codeInputRefs = useRef([])
  const [copied, setCopied] = useState(false)

  const inRoom = state.phase === 'lobby' && state.roomCode

  const handleNameChange = useCallback((e) => {
    dispatch({ type: SLOTS_BATTLE_SET_NAME, name: e.target.value.slice(0, 20) })
  }, [dispatch])

  const handleCreate = useCallback(() => {
    dispatch({ type: SLOTS_BATTLE_CLEAR_ERROR })
    if (!state.playerName.trim()) return
    send({ type: 'create_slots_room', player_name: state.playerName.trim() })
  }, [send, state.playerName, dispatch])

  const handleJoin = useCallback(() => {
    dispatch({ type: SLOTS_BATTLE_CLEAR_ERROR })
    const code = roomCodeInput.join('').toUpperCase()
    if (code.length !== 4 || !state.playerName.trim()) return
    send({ type: 'join_slots_room', code, player_name: state.playerName.trim() })
  }, [send, roomCodeInput, state.playerName, dispatch])

  const handleStart = useCallback(() => {
    dispatch({ type: SLOTS_BATTLE_CLEAR_ERROR })
    send({ type: 'start_slots' })
  }, [send, dispatch])

  const handleLeave = useCallback(() => {
    if (state.connected) {
      send({ type: 'leave_slots' })
    }
    sessionStorage.removeItem('mp_player_id')
    sessionStorage.removeItem('mp_room_code')
    sessionStorage.removeItem('mp_session_token')
    dispatch({ type: SLOTS_BATTLE_FORCE_LEAVE })
  }, [send, state.connected, dispatch])

  const handleConfigureRounds = useCallback((rounds) => {
    send({ type: 'configure_slots', total_rounds: rounds })
  }, [send])

  const handleConfigureBet = useCallback((bet) => {
    send({ type: 'configure_slots', bet_per_round: bet })
  }, [send])

  const handleCodeInput = useCallback((index, value) => {
    const char = value.slice(-1).toUpperCase()
    if (char && !/[A-Z0-9]/.test(char)) return

    setRoomCodeInput(prev => {
      const next = [...prev]
      next[index] = char
      return next
    })

    if (char && index < 3) {
      codeInputRefs.current[index + 1]?.focus()
    }
  }, [])

  const handleCodeKeyDown = useCallback((index, e) => {
    if (e.key === 'Backspace' && !roomCodeInput[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
    }
    if (e.key === 'Enter') {
      handleJoin()
    }
  }, [roomCodeInput, handleJoin])

  const handleCodePaste = useCallback((e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
    if (pasted.length > 0) {
      const next = ['', '', '', '']
      for (let i = 0; i < pasted.length; i++) {
        next[i] = pasted[i]
      }
      setRoomCodeInput(next)
      const focusIdx = Math.min(pasted.length, 3)
      codeInputRefs.current[focusIdx]?.focus()
    }
  }, [])

  const copyRoomCode = useCallback(async () => {
    if (!state.roomCode) return
    try {
      await navigator.clipboard.writeText(state.roomCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: noop
    }
  }, [state.roomCode])

  // --- Waiting room ---
  if (inRoom) {
    const connectedCount = state.players.filter(p => p.connected).length
    const canStart = state.isHost && connectedCount >= 2
    const buyIn = state.totalRounds * state.betPerRound

    return (
      <div className={styles.container}>
        <div className={styles.waitingRoom}>
          <span className={styles.waitingLabel}>ROOM CODE</span>
          <button className={styles.roomCode} onClick={copyRoomCode}>
            {state.roomCode}
            <span className={styles.copyHint}>{copied ? 'Copied!' : 'Tap to copy'}</span>
          </button>

          <div className={styles.playerList}>
            <span className={styles.playerListLabel}>
              PLAYERS ({connectedCount}/{state.players.length})
            </span>
            {state.players.map(p => (
              <div key={p.player_id} className={styles.playerItem}>
                <span className={`${styles.statusDot} ${p.connected ? styles.online : styles.offline}`} />
                <span className={styles.playerName}>
                  {p.name}
                  {p.player_id === state.playerId && <span className={styles.youBadge}>YOU</span>}
                </span>
                {p.is_host && <span className={styles.hostBadge}>HOST</span>}
              </div>
            ))}
          </div>

          {state.isHost ? (
            <div className={styles.configPanel}>
              <span className={styles.configLabel}>ROUNDS</span>
              <div className={styles.configRow}>
                {ROUND_OPTIONS.map(r => (
                  <button
                    key={r}
                    className={`${styles.configOption} ${state.totalRounds === r ? styles.configOptionActive : ''}`}
                    onClick={() => handleConfigureRounds(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <span className={styles.configLabel}>BET PER ROUND</span>
              <div className={styles.configRow}>
                {VALID_BETS.map(b => (
                  <button
                    key={b}
                    className={`${styles.configOption} ${state.betPerRound === b ? styles.configOptionActive : ''}`}
                    onClick={() => handleConfigureBet(b)}
                  >
                    {BET_LABELS[b]}
                  </button>
                ))}
              </div>

              <div className={styles.buyInDisplay}>
                BUY-IN: <span className={styles.buyInAmount}>{formatMoney(buyIn)}</span>
              </div>
            </div>
          ) : (
            <div className={styles.configDisplay}>
              <div className={styles.configDisplayRow}>
                <span className={styles.configDisplayLabel}>Rounds</span>
                <span className={styles.configDisplayValue}>{state.totalRounds}</span>
              </div>
              <div className={styles.configDisplayRow}>
                <span className={styles.configDisplayLabel}>Bet/Round</span>
                <span className={styles.configDisplayValue}>{formatMoney(state.betPerRound)}</span>
              </div>
              <div className={styles.configDisplayRow}>
                <span className={styles.configDisplayLabel}>Buy-in</span>
                <span className={styles.configDisplayValue}>{formatMoney(buyIn)}</span>
              </div>
            </div>
          )}

          {state.isHost && (
            <button
              className={styles.startButton}
              onClick={handleStart}
              disabled={!canStart}
            >
              {canStart ? 'START BATTLE' : 'WAITING FOR PLAYERS...'}
            </button>
          )}
          {!state.isHost && (
            <div className={styles.waitingHint}>Waiting for host to start...</div>
          )}

          <button className={styles.leaveButton} onClick={handleLeave}>
            LEAVE ROOM
          </button>
        </div>

        {state.error && (
          <div className={styles.error}>{state.error}</div>
        )}
      </div>
    )
  }

  // --- Main view ---
  return (
    <div className={styles.container}>
      <button className={styles.backButton} onClick={onBack}>
        &larr; BACK
      </button>

      <div className={styles.brand}>
        <h1 className={styles.logo}>SLOTS BATTLE</h1>
        <span className={styles.subtitle}>COMPETE WITH FRIENDS</span>
      </div>

      {!state.connected && (
        <div className={styles.connecting}>Connecting to server...</div>
      )}

      {state.connected && view === 'main' && (
        <div className={styles.mainView}>
          <input
            className={styles.nameInput}
            type="text"
            placeholder="Your name"
            value={state.playerName}
            onChange={handleNameChange}
            maxLength={20}
            autoComplete="off"
          />

          <button
            className={styles.createButton}
            onClick={handleCreate}
            disabled={!state.playerName.trim()}
          >
            CREATE ROOM
          </button>

          <div className={styles.divider}>
            <span className={styles.dividerLine} />
            <span className={styles.dividerText}>OR</span>
            <span className={styles.dividerLine} />
          </div>

          <button
            className={styles.joinViewButton}
            onClick={() => setView('join')}
          >
            JOIN A ROOM
          </button>
        </div>
      )}

      {state.connected && view === 'join' && (
        <div className={styles.joinView}>
          <input
            className={styles.nameInput}
            type="text"
            placeholder="Your name"
            value={state.playerName}
            onChange={handleNameChange}
            maxLength={20}
            autoComplete="off"
          />

          <span className={styles.codeLabel}>ROOM CODE</span>
          <div className={styles.codeInputRow}>
            {[0, 1, 2, 3].map(i => (
              <input
                key={i}
                ref={el => codeInputRefs.current[i] = el}
                className={styles.codeChar}
                type="text"
                inputMode="text"
                maxLength={1}
                value={roomCodeInput[i]}
                onChange={e => handleCodeInput(i, e.target.value)}
                onKeyDown={e => handleCodeKeyDown(i, e)}
                onPaste={i === 0 ? handleCodePaste : undefined}
                autoCapitalize="characters"
                autoComplete="off"
              />
            ))}
          </div>

          <button
            className={styles.joinButton}
            onClick={handleJoin}
            disabled={!state.playerName.trim() || roomCodeInput.join('').length !== 4}
          >
            JOIN ROOM
          </button>

          <button
            className={styles.backToMain}
            onClick={() => setView('main')}
          >
            BACK
          </button>
        </div>
      )}

      {state.error && (
        <div className={styles.error}>{state.error}</div>
      )}
    </div>
  )
}

export default SlotsLobby
```

- [ ] **Step 3: Verify build succeeds**

Run: `cd /Users/sia/Desktop/blackjack && npm run build`
Expected: Build succeeds (SlotsLobby is not imported by anyone yet, but we verify no syntax errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/slots/SlotsLobby.jsx src/components/slots/SlotsLobby.module.css
git commit -m "feat(slots): add PvP lobby with host config panel"
```

---

### Task 5: ScoreBar Component

**Files:**
- Create: `src/components/slots/ScoreBar.jsx`
- Create: `src/components/slots/ScoreBar.module.css`

Horizontal bars showing each player's cumulative score as proportional width. Leader highlighted with gold gradient. Width animates with CSS transitions.

Props: `{ players, currentPlayerId }` where `players` is an array of `{ playerId, name, totalScore }` sorted by totalScore descending.

- [ ] **Step 1: Create ScoreBar.module.css**

```css
.container {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  min-width: 64px;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nameSelf {
  color: var(--gold);
}

.barTrack {
  flex: 1;
  height: 20px;
  border-radius: 4px;
  background: var(--surface);
  overflow: hidden;
  position: relative;
}

.barFill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 2px;
}

.barDefault {
  background: rgba(240, 200, 80, 0.3);
}

.barLeader {
  background: linear-gradient(90deg, var(--gold-dim), var(--gold));
}

.score {
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  min-width: 40px;
}

.scoreLeader {
  color: var(--gold);
}
```

- [ ] **Step 2: Create ScoreBar.jsx**

```jsx
import styles from './ScoreBar.module.css'

function ScoreBar({ players, currentPlayerId }) {
  const maxScore = Math.max(1, ...players.map(p => p.totalScore))

  return (
    <div className={styles.container}>
      {players.map((p, i) => {
        const isLeader = i === 0 && p.totalScore > 0
        const isSelf = p.playerId === currentPlayerId
        const widthPct = maxScore > 0 ? (p.totalScore / maxScore) * 100 : 0

        return (
          <div key={p.playerId} className={styles.row}>
            <span className={`${styles.name} ${isSelf ? styles.nameSelf : ''}`}>
              {p.name}
            </span>
            <div className={styles.barTrack}>
              <div
                className={`${styles.barFill} ${isLeader ? styles.barLeader : styles.barDefault}`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
            <span className={`${styles.score} ${isLeader ? styles.scoreLeader : ''}`}>
              {p.totalScore}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default ScoreBar
```

- [ ] **Step 3: Commit**

```bash
git add src/components/slots/ScoreBar.jsx src/components/slots/ScoreBar.module.css
git commit -m "feat(slots): add ScoreBar component for PvP score comparison"
```

---

### Task 6: MultiplayerSlots Battle View

**Files:**
- Create: `src/components/slots/MultiplayerSlots.jsx`
- Create: `src/components/slots/MultiplayerSlots.module.css`

This is the main battle view. It renders during `spinning`, `round_result`, and `final_result` phases.

Props: `{ state, send, dispatch, onLeave }` — same pattern as `MultiplayerGame.jsx`.

**Layout:**
- **Header:** Leave button + "Round X of Y" + pot display
- **Spinning phase:** Own SlotMachine + SPIN button (only if haven't spun). After spinning, "Waiting for others..." message. Shows other players' spin status.
- **Round result phase:** All players' round results (scores + match types). ScoreBar with running totals.
- **Final result phase:** WIN/LOSE/TIE headline, pot + payout info, ranked standings, PLAY AGAIN button (host only).

The component sends:
- `slots_spin` (no payload) — player spins
- `leave_slots` (no payload) — player leaves
- `slots_play_again` (no payload) — host starts new game

For the SlotMachine in PvP, the server generates the spin. The `slots_spin_result` event contains the `reels` array for the player. We render the local player's SlotMachine using their reels from `state.playerStates[state.playerId]`.

**Important detail:** In PvP, the player doesn't generate random values — they just send `slots_spin` and the server responds with `slots_spin_result` containing the reels. The SlotMachine needs to receive these reels and animate.

- [ ] **Step 1: Create MultiplayerSlots.module.css**

```css
.container {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  gap: 16px;
}

.header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.leaveButton {
  font-size: 13px;
  color: var(--text-dim);
  letter-spacing: 1px;
  padding: 8px 12px;
  min-height: 44px;
  touch-action: manipulation;
}

.roundInfo {
  text-align: center;
}

.roundLabel {
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 1px;
}

.potDisplay {
  text-align: right;
}

.potLabel {
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 1px;
}

.potAmount {
  font-family: 'Outfit', sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: var(--gold);
}

/* Spinning phase */
.machineArea {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.spinButton {
  width: 100%;
  max-width: 280px;
  padding: 16px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(180deg, var(--gold) 0%, var(--gold-dim) 100%);
  color: var(--felt-dark);
  font-family: 'Playfair Display', serif;
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 3px;
  cursor: pointer;
  transition: transform 0.1s;
  touch-action: manipulation;
}

.spinButton:active {
  transform: scale(0.97);
}

.waitingMessage {
  font-size: 14px;
  color: var(--text-dim);
  animation: pulse 1.5s ease-in-out infinite;
}

/* Player spin status */
.playerStatusList {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--surface);
}

.playerStatus {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}

.playerStatusName {
  color: var(--text-primary);
  font-weight: 500;
}

.playerStatusReady {
  color: var(--success);
  font-weight: 600;
}

.playerStatusWaiting {
  color: var(--text-dim);
  animation: pulse 1.5s ease-in-out infinite;
}

/* Round result */
.roundResultSection {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.roundResultTitle {
  font-family: 'Playfair Display', serif;
  font-size: 20px;
  font-weight: 900;
  color: var(--text-primary);
  letter-spacing: 2px;
}

.roundResultList {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.roundResultItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--surface);
}

.roundResultName {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.roundResultNameSelf {
  color: var(--gold);
}

.roundResultScores {
  display: flex;
  align-items: center;
  gap: 12px;
}

.roundResultRoundScore {
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  color: var(--text-dim);
}

.roundResultTotalScore {
  font-family: 'Outfit', sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.roundResultMatch {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;
}

.matchTriple {
  color: var(--gold);
  background: rgba(240, 200, 80, 0.15);
}

.matchPair {
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.08);
}

.nextRoundHint {
  font-size: 13px;
  color: var(--text-dim);
  animation: pulse 1.5s ease-in-out infinite;
}

/* Final result */
.finalSection {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding-top: 16px;
}

.finalHeadline {
  font-family: 'Playfair Display', serif;
  font-size: 32px;
  font-weight: 900;
  letter-spacing: 3px;
  text-align: center;
}

.headlineWin {
  color: var(--gold);
  text-shadow: 0 2px 16px var(--gold-glow);
}

.headlineLose {
  color: var(--danger);
}

.headlineTie {
  color: var(--text-primary);
}

.finalSubtext {
  font-size: 14px;
  color: var(--text-dim);
  text-align: center;
}

.payoutInfo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.payoutLabel {
  font-size: 11px;
  color: var(--text-dim);
  letter-spacing: 2px;
}

.payoutAmount {
  font-family: 'Outfit', sans-serif;
  font-size: 28px;
  font-weight: 700;
  color: var(--gold);
}

.standingsTable {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.standingRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--surface);
}

.standingRank {
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-dim);
  min-width: 24px;
}

.standingRankFirst {
  color: var(--gold);
}

.standingName {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-left: 8px;
}

.standingScore {
  font-family: 'Outfit', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-dim);
}

.playAgainButton {
  width: 100%;
  max-width: 280px;
  padding: 16px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(180deg, var(--gold) 0%, var(--gold-dim) 100%);
  color: var(--felt-dark);
  font-family: 'Playfair Display', serif;
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 2px;
  cursor: pointer;
  transition: transform 0.1s;
  touch-action: manipulation;
}

.playAgainButton:active {
  transform: scale(0.97);
}

.leaveEndButton {
  font-size: 13px;
  color: var(--text-dim);
  letter-spacing: 1px;
  padding: 8px 12px;
  min-height: 44px;
  touch-action: manipulation;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

- [ ] **Step 2: Create MultiplayerSlots.jsx**

```jsx
import { useCallback, useEffect } from 'react'
import { slotsReelStop, slotsResolve } from '../../reducer/slotsActions'
import { formatMoney } from '../../utils/formatters'
import { useSlotsSound } from '../../hooks/useSlotsSound'
import SlotMachine from './SlotMachine'
import ScoreBar from './ScoreBar'
import styles from './MultiplayerSlots.module.css'

function MultiplayerSlots({ state, send, dispatch, onLeave }) {
  const myState = state.playerStates[state.playerId] || {}
  const myReels = myState.reels || null
  const myHasSpun = myState.hasSpun || false
  const myMatchType = myState.matchType || null

  // Build a minimal state object for useSlotsSound
  const soundState = {
    phase: myHasSpun && state.phase === 'spinning' ? 'result' : state.phase === 'spinning' ? 'betting' : 'result',
    reelStops: [myHasSpun, myHasSpun, myHasSpun],
    matchType: myMatchType,
    muted: state.muted,
  }
  useSlotsSound(soundState)

  const handleSpin = useCallback(() => {
    send({ type: 'slots_spin' })
  }, [send])

  const handleLeave = useCallback(() => {
    if (state.connected) {
      send({ type: 'leave_slots' })
    }
    onLeave()
  }, [send, state.connected, onLeave])

  const handlePlayAgain = useCallback(() => {
    send({ type: 'slots_play_again' })
  }, [send])

  // Build sorted player list for ScoreBar
  const scorePlayers = Object.entries(state.playerStates)
    .map(([pid, ps]) => ({
      playerId: pid,
      name: ps.name,
      totalScore: ps.total_score ?? ps.totalScore ?? 0,
    }))
    .sort((a, b) => b.totalScore - a.totalScore)

  // Build player status list for spinning phase
  const playerEntries = Object.entries(state.playerStates)

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.leaveButton} onClick={handleLeave}>
          &larr; LEAVE
        </button>
        <div className={styles.roundInfo}>
          <div className={styles.roundLabel}>
            ROUND {state.currentRound} OF {state.totalRounds}
          </div>
        </div>
        <div className={styles.potDisplay}>
          <div className={styles.potLabel}>POT</div>
          <div className={styles.potAmount}>{formatMoney(state.pot)}</div>
        </div>
      </div>

      {/* Spinning phase */}
      {state.phase === 'spinning' && (
        <div className={styles.machineArea}>
          {myHasSpun && myReels ? (
            <SlotMachine
              reels={myReels}
              spinning={false}
              matchType={myMatchType}
              onReelStop={() => {}}
            />
          ) : (
            <SlotMachine
              reels={[null, null, null]}
              spinning={false}
              matchType={null}
              onReelStop={() => {}}
            />
          )}

          {!myHasSpun ? (
            <button className={styles.spinButton} onClick={handleSpin}>
              SPIN
            </button>
          ) : (
            <div className={styles.waitingMessage}>Waiting for other players...</div>
          )}

          <div className={styles.playerStatusList}>
            {playerEntries.map(([pid, ps]) => (
              <div key={pid} className={styles.playerStatus}>
                <span className={styles.playerStatusName}>
                  {ps.name}{pid === state.playerId ? ' (you)' : ''}
                </span>
                {(ps.has_spun || ps.hasSpun) ? (
                  <span className={styles.playerStatusReady}>DONE</span>
                ) : (
                  <span className={styles.playerStatusWaiting}>spinning...</span>
                )}
              </div>
            ))}
          </div>

          {scorePlayers.length > 0 && state.currentRound > 1 && (
            <ScoreBar players={scorePlayers} currentPlayerId={state.playerId} />
          )}
        </div>
      )}

      {/* Round result */}
      {state.phase === 'round_result' && state.roundResults && (
        <div className={styles.roundResultSection}>
          <div className={styles.roundResultTitle}>
            ROUND {state.currentRound} RESULTS
          </div>

          <div className={styles.roundResultList}>
            {state.roundResults.map(r => (
              <div key={r.player_id} className={styles.roundResultItem}>
                <span className={`${styles.roundResultName} ${r.player_id === state.playerId ? styles.roundResultNameSelf : ''}`}>
                  {r.name}
                </span>
                <div className={styles.roundResultScores}>
                  {r.match_type && r.match_type !== 'none' && (
                    <span className={`${styles.roundResultMatch} ${r.match_type === 'triple' ? styles.matchTriple : styles.matchPair}`}>
                      {r.match_type}
                    </span>
                  )}
                  <span className={styles.roundResultRoundScore}>+{r.round_score}</span>
                  <span className={styles.roundResultTotalScore}>{r.total_score}</span>
                </div>
              </div>
            ))}
          </div>

          <ScoreBar players={scorePlayers} currentPlayerId={state.playerId} />

          <div className={styles.nextRoundHint}>
            {state.currentRound < state.totalRounds
              ? 'Next round starting soon...'
              : 'Calculating final results...'}
          </div>
        </div>
      )}

      {/* Final result */}
      {state.phase === 'final_result' && (
        <div className={styles.finalSection}>
          {state.isTie ? (
            <>
              <div className={`${styles.finalHeadline} ${styles.headlineTie}`}>TIE</div>
              <div className={styles.finalSubtext}>Everyone gets their buy-in back</div>
            </>
          ) : state.winnerId === state.playerId ? (
            <>
              <div className={`${styles.finalHeadline} ${styles.headlineWin}`}>YOU WIN</div>
              <div className={styles.payoutInfo}>
                <span className={styles.payoutLabel}>PAYOUT</span>
                <span className={styles.payoutAmount}>{formatMoney(state.winnerPayout)}</span>
              </div>
            </>
          ) : (
            <>
              <div className={`${styles.finalHeadline} ${styles.headlineLose}`}>YOU LOSE</div>
              <div className={styles.finalSubtext}>
                Better luck next time. You lost your {formatMoney(state.buyIn)} buy-in.
              </div>
            </>
          )}

          {state.finalStandings && (
            <div className={styles.standingsTable}>
              {state.finalStandings.map((s, i) => (
                <div key={s.player_id} className={styles.standingRow}>
                  <span className={`${styles.standingRank} ${i === 0 ? styles.standingRankFirst : ''}`}>
                    #{i + 1}
                  </span>
                  <span className={styles.standingName}>
                    {s.name}{s.player_id === state.playerId ? ' (you)' : ''}
                  </span>
                  <span className={styles.standingScore}>{s.total_score} pts</span>
                </div>
              ))}
            </div>
          )}

          <ScoreBar players={scorePlayers} currentPlayerId={state.playerId} />

          {state.isHost && (
            <button className={styles.playAgainButton} onClick={handlePlayAgain}>
              PLAY AGAIN
            </button>
          )}
          <button className={styles.leaveEndButton} onClick={handleLeave}>
            LEAVE
          </button>
        </div>
      )}
    </div>
  )
}

export default MultiplayerSlots
```

- [ ] **Step 3: Commit**

```bash
git add src/components/slots/MultiplayerSlots.jsx src/components/slots/MultiplayerSlots.module.css
git commit -m "feat(slots): add PvP battle view with spin, round results, and final standings"
```

---

### Task 7: MultiplayerSlotsApp Wrapper

**Files:**
- Create: `src/components/slots/MultiplayerSlotsApp.jsx`

This is the wrapper component — same pattern as the `MultiplayerApp` component in `App.jsx`. Uses `useReducer` + `useWebSocket`, routes between `SlotsLobby` and `MultiplayerSlots` based on phase.

- [ ] **Step 1: Create MultiplayerSlotsApp.jsx**

```jsx
import { useReducer, useCallback } from 'react'
import { slotsBattleReducer } from '../../reducer/slotsBattleReducer'
import { createSlotsBattleInitialState } from '../../reducer/slotsBattleInitialState'
import { useWebSocket } from '../../hooks/useWebSocket'
import SlotsLobby from './SlotsLobby'
import MultiplayerSlots from './MultiplayerSlots'

function MultiplayerSlotsApp({ onBack }) {
  const [state, dispatch] = useReducer(slotsBattleReducer, null, createSlotsBattleInitialState)
  const { send, disconnect } = useWebSocket(dispatch)

  const handleLeave = useCallback(() => {
    disconnect()
    onBack()
  }, [disconnect, onBack])

  const isInGame = state.phase === 'spinning' || state.phase === 'round_result' ||
                   state.phase === 'final_result'

  if (isInGame) {
    return (
      <MultiplayerSlots
        state={state}
        send={send}
        dispatch={dispatch}
        onLeave={handleLeave}
      />
    )
  }

  return (
    <SlotsLobby
      state={state}
      send={send}
      dispatch={dispatch}
      onBack={handleLeave}
    />
  )
}

export default MultiplayerSlotsApp
```

- [ ] **Step 2: Commit**

```bash
git add src/components/slots/MultiplayerSlotsApp.jsx
git commit -m "feat(slots): add MultiplayerSlotsApp wrapper"
```

---

### Task 8: Wire Up App.jsx and ModeSelect

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/ModeSelect.jsx`

- [ ] **Step 1: Add multiplayer-slots mode to App.jsx**

In `src/App.jsx`, add the import and the mode rendering:

```javascript
// Add import at the top (after existing SoloSlots import):
import MultiplayerSlotsApp from './components/slots/MultiplayerSlotsApp'
```

Then in the `App` component's return, add the new mode after the `solo-slots` block:

```jsx
{mode === 'multiplayer-slots' && (
  <MultiplayerSlotsApp onBack={() => setMode(null)} />
)}
```

- [ ] **Step 2: Enable BATTLE button for slots in ModeSelect.jsx**

In `src/components/ModeSelect.jsx`, the second button (MULTIPLAYER/BATTLE) is currently disabled for slots (`isBlackjack ? '' : \` \${styles.disabled}\``). Change the button to be enabled for both games:

Replace the second mode button (approximately lines 47-65):

```jsx
<button
  className={styles.modeButton}
  onClick={() => onSelectMode(`multiplayer-${selectedGame}`)}
>
  <span className={styles.modeIcon}>{'\u{1F465}'}</span>
  <span className={styles.modeTitle}>{isBlackjack ? 'MULTIPLAYER' : 'BATTLE'}</span>
  <span className={styles.modeDesc}>
    {isBlackjack ? 'Play with friends' : 'Compete with friends'}
  </span>
</button>
```

This removes the `disabled` class and the conditional `onClick` — both games now navigate to multiplayer.

- [ ] **Step 3: Verify build succeeds**

Run: `cd /Users/sia/Desktop/blackjack && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Run lint**

Run: `cd /Users/sia/Desktop/blackjack && npm run lint`
Expected: No new lint errors. Fix any that appear.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/ModeSelect.jsx
git commit -m "feat(slots): wire up PvP slots mode in App and ModeSelect"
```

---

### Task 9: Integration Verification

**Files:**
- No new files — verification only

- [ ] **Step 1: Run all existing tests**

Run: `cd /Users/sia/Desktop/blackjack && npx vitest run`
Expected: All tests pass (including new slotsBattleReducer tests and existing solo slots tests).

- [ ] **Step 2: Run server tests**

Run: `cd /Users/sia/Desktop/blackjack/server && python -m unittest discover`
Expected: All server tests pass.

- [ ] **Step 3: Run build**

Run: `cd /Users/sia/Desktop/blackjack && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Run lint**

Run: `cd /Users/sia/Desktop/blackjack && npm run lint`
Expected: Clean output.

- [ ] **Step 5: Verify blackjack still works**

Run the dev server and manually verify:
1. ModeSelect shows game picker with Blackjack and Slots
2. Blackjack solo and multiplayer still work
3. Slots solo still works
4. Slots battle mode navigates to lobby

Run: `cd /Users/sia/Desktop/blackjack && npm run dev`

- [ ] **Step 6: Final commit if any fixes were needed**

Only commit if there were fixes in previous steps.

---

## Notes

### What this plan does NOT cover

1. **Reconnection for slots PvP** — The existing `useWebSocket` reconnection sends `reconnect` with the saved session data. The server's generic reconnect handler currently only handles blackjack rooms. Server-side slots reconnection (matching player_id back to a slots room) would need a corresponding `handle_slots_reconnect` in `main.py`. This is not part of Phase 5 as defined in the spec — it would be a follow-up.

2. **useSlotsSound for PvP** — The current `useSlotsSound` hook is designed for solo play state transitions. The PvP `MultiplayerSlots` component creates a minimal proxy state object for the hook, which will produce basic sound effects. Full PvP-aware sound (e.g., sounds when opponents spin, round result fanfares) would be a polish follow-up.

3. **AFK spin timer UI** — The server handles AFK auto-spin after 10s. The frontend currently has no countdown timer showing the remaining time. A visual countdown could be added as polish.
