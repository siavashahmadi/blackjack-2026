# Codebase Refactor: Split God Files

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the three largest files — `server/main.py` (1,730 lines), `src/reducer/gameReducer.js` (932 lines), and `src/components/SoloGame.jsx` (505 lines) — into focused modules with clear responsibilities, without changing any behavior.

**Architecture:** Pure mechanical refactoring. Code moves between files; no logic changes. Each task produces a passing test suite. The backend split separates connection management, blackjack handlers, and slots handlers from the main file. The frontend reducer split groups action cases by domain. The SoloGame split extracts callback groups into custom hooks.

**Tech Stack:** Python/FastAPI (backend), React 19/Vite 8 (frontend), Vitest (frontend tests), pytest (backend tests)

---

## File Structure

### Backend (server/)

| File | Responsibility | Status |
|------|---------------|--------|
| `server/main.py` | App setup, CORS, lifespan, WebSocket endpoint, message router (`handle_message`) | Modify (trim from 1,730 → ~300 lines) |
| `server/connection.py` | `ConnectionManager` class, heartbeat loop, room cleanup loop, shared state (cooldowns, timers) | Create |
| `server/blackjack_handlers.py` | All blackjack `handle_*` functions, turn/bet timers, dealer turn logic | Create |
| `server/slots_handlers.py` | All slots `handle_*` functions, slots timers, slots broadcast helper | Create |

### Frontend (src/reducer/)

| File | Responsibility | Status |
|------|---------------|--------|
| `src/reducer/gameReducer.js` | Thin dispatcher: imports sub-reducers, delegates by action type | Modify (trim from 932 → ~60 lines) |
| `src/reducer/bettingReducer.js` | `ADD_CHIP`, `UNDO_CHIP`, `CLEAR_CHIPS`, `SELECT_CHIP`, `ALL_IN`, `PLACE_SIDE_BET`, `CLEAR_SIDE_BET`, `REMOVE_SIDE_BET_CHIP`, `TOGGLE_SIDE_BETS` | Create |
| `src/reducer/playReducer.js` | `DEAL`, `BET_ASSET`, `REMOVE_ASSET`, `HIT`, `STAND`, `DOUBLE_DOWN`, `SPLIT`, `DEALER_DRAW`, `TAKE_LOAN` | Create |
| `src/reducer/resolveReducer.js` | `RESOLVE_HAND`, `OFFER_DOUBLE_OR_NOTHING`, `ACCEPT_DOUBLE_OR_NOTHING`, `DECLINE_DOUBLE_OR_NOTHING`, `NEW_ROUND`, `RESET_GAME`, `ACCEPT_TABLE_UPGRADE`, `DECLINE_TABLE_UPGRADE`, `DISMISS_TABLE_TOAST` | Create |
| `src/reducer/uiReducer.js` | All `TOGGLE_*`, `DISMISS_*`, `LOAD_*`, `SET_*`, `UNLOCK_ACHIEVEMENT` cases | Create |

### Frontend (src/hooks/)

| File | Responsibility | Status |
|------|---------------|--------|
| `src/hooks/useBettingActions.js` | Betting callbacks: deal, clear, allIn, undo, chip tap delegation | Create |
| `src/hooks/useGameActions.js` | Play callbacks: hit, stand, doubleDown, split, loan confirm/cancel, newRound, reset, back | Create |
| `src/hooks/useUIActions.js` | UI toggle callbacks: mute, notifications, settings, achievements, debtTracker, handHistory, etc. | Create |
| `src/components/SoloGame.jsx` | Thin shell: hooks + render tree | Modify (trim from 505 → ~250 lines) |

---

## Task 1: Split `server/main.py` — Extract `connection.py`

**Files:**
- Create: `server/connection.py`
- Modify: `server/main.py`
- Test: `server/test_game.py` (existing — must still pass)

- [ ] **Step 1: Create `server/connection.py`**

Move `ConnectionManager`, shared state dicts, constants, and background loops into this new file:

```python
"""Connection management, shared state, and background loops."""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from fastapi import WebSocket

from game_room import cleanup_empty_rooms, get_room, rooms
from slots_room import get_slots_room, slots_rooms

logger = logging.getLogger("blackjack")

HEARTBEAT_INTERVAL = 30
HEARTBEAT_TIMEOUT = 10
DISCONNECT_GRACE_PERIOD = 120
CLEANUP_INTERVAL = 60
TURN_TIMEOUT = 60
BET_TIMEOUT = 30

ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "https://blackjack.siaahmadi.com",
}

MAX_MESSAGE_SIZE = 4096
MAX_ROOMS = 100
ROOM_CREATE_COOLDOWN_SECONDS = 5.0
CHAT_COOLDOWN_SECONDS = 2.0
ACTION_COOLDOWN_SECONDS = 0.2

SLOTS_SPIN_TIMEOUT = 10
SLOTS_ROUND_ADVANCE_DELAY = 3


class ConnectionManager:
    """Manages WebSocket connections, mapping player_ids to sockets and rooms."""

    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.player_rooms: dict[str, str] = {}
        self.disconnect_tasks: dict[str, asyncio.Task] = {}
        self._conn_generation: dict[str, int] = {}

    async def connect(self, player_id: str, websocket: WebSocket) -> int:
        """Register a connection and return its generation number."""
        self.connections[player_id] = websocket
        gen = self._conn_generation.get(player_id, 0) + 1
        self._conn_generation[player_id] = gen
        return gen

    def get_generation(self, player_id: str) -> int:
        return self._conn_generation.get(player_id, 0)

    def disconnect(self, player_id: str):
        self.connections.pop(player_id, None)

    async def send_to_player(self, player_id: str, message: dict):
        ws = self.connections.get(player_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception as e:
                logger.debug("Failed to send to player %s: %s", player_id, e)

    async def broadcast_to_room(
        self, room_code: str, message: dict, exclude: str | None = None
    ):
        room = get_room(room_code)
        if not room:
            return
        msg_text = json.dumps(message)
        failed_pids = []
        for pid, player in room.players.items():
            if pid == exclude or not player.connected:
                continue
            ws = self.connections.get(pid)
            if ws:
                try:
                    await ws.send_text(msg_text)
                except Exception as e:
                    logger.warning("Failed to broadcast to player %s: %s", pid, e)
                    failed_pids.append(pid)
        for pid in failed_pids:
            from blackjack_handlers import handle_disconnect
            asyncio.create_task(handle_disconnect(pid))

    def cancel_disconnect_task(self, player_id: str):
        task = self.disconnect_tasks.pop(player_id, None)
        if task and not task.done():
            task.cancel()


# Singleton instances
manager = ConnectionManager()

# Track which game type each player is in
player_game_types: dict[str, str] = {}

# Rate limiting
chat_cooldowns: dict[str, float] = {}
action_cooldowns: dict[str, float] = {}
room_create_cooldowns: dict[str, float] = {}

# Turn timers
turn_timers: dict[str, asyncio.Task] = {}
bet_timers: dict[str, asyncio.Task] = {}

# Slots timers
slots_spin_timers: dict[str, asyncio.Task] = {}


async def room_cleanup_loop():
    """Periodically prune rooms where all players disconnected > 5 min ago."""
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL)
        removed = cleanup_empty_rooms(max_age_seconds=300)
        if removed > 0:
            logger.info(f"Cleaned up {removed} empty room(s). Active rooms: {len(rooms)}")

        slots_to_remove = []
        now_utc = datetime.now(timezone.utc)
        for code, sroom in list(slots_rooms.items()):
            if not sroom.players:
                if (now_utc - sroom.created_at).total_seconds() > 300:
                    slots_to_remove.append(code)
                continue
            all_disconnected = all(not p.connected for p in sroom.players.values())
            if not all_disconnected:
                continue
            disconnect_times = [
                p.disconnected_at for p in sroom.players.values()
                if p.disconnected_at is not None
            ]
            if not disconnect_times:
                continue
            if (now_utc - max(disconnect_times)).total_seconds() > 300:
                slots_to_remove.append(code)
        for code in slots_to_remove:
            from slots_handlers import cancel_slots_spin_timer
            cancel_slots_spin_timer(code)
            del slots_rooms[code]
        if slots_to_remove:
            logger.info(f"Cleaned up {len(slots_to_remove)} empty slots room(s). Active: {len(slots_rooms)}")


async def heartbeat_loop():
    """Ping all connected WebSockets every 30s to detect dead connections."""
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL)
        stale = []
        for player_id, ws in list(manager.connections.items()):
            try:
                await asyncio.wait_for(ws.send_text(json.dumps({"type": "ping"})), timeout=HEARTBEAT_TIMEOUT)
            except Exception:
                stale.append(player_id)

        for player_id in stale:
            logger.info(f"Heartbeat failed for {player_id}, triggering disconnect")
            from blackjack_handlers import handle_disconnect
            await handle_disconnect(player_id)

        now = time.monotonic()
        stale_cooldowns = [
            pid for pid, ts in chat_cooldowns.items()
            if pid not in manager.connections and now - ts > CHAT_COOLDOWN_SECONDS
        ]
        for pid in stale_cooldowns:
            del chat_cooldowns[pid]

        stale_action_cooldowns = [
            pid for pid, ts in action_cooldowns.items()
            if pid not in manager.connections and now - ts > ACTION_COOLDOWN_SECONDS
        ]
        for pid in stale_action_cooldowns:
            del action_cooldowns[pid]

        stale_room_cooldowns = [
            pid for pid, ts in room_create_cooldowns.items()
            if pid not in manager.connections and now - ts > ROOM_CREATE_COOLDOWN_SECONDS
        ]
        for pid in stale_room_cooldowns:
            del room_create_cooldowns[pid]
```

- [ ] **Step 2: Run server tests to verify no import errors**

Run: `cd server && python3 -c "from connection import manager, ConnectionManager"`
Expected: No errors

---

## Task 2: Split `server/main.py` — Extract `blackjack_handlers.py`

**Files:**
- Create: `server/blackjack_handlers.py`
- Modify: `server/main.py`

- [ ] **Step 1: Create `server/blackjack_handlers.py`**

Move all blackjack handler functions, turn/bet timer functions, and dealer turn logic. This file imports from `connection.py` for shared state:

```python
"""Blackjack multiplayer message handlers."""

import asyncio
import logging
import secrets
import time
from datetime import datetime, timezone

from fastapi import WebSocket

from connection import (
    DISCONNECT_GRACE_PERIOD,
    BET_TIMEOUT,
    TURN_TIMEOUT,
    MAX_ROOMS,
    ROOM_CREATE_COOLDOWN_SECONDS,
    manager,
    player_game_types,
    chat_cooldowns,
    action_cooldowns,
    room_create_cooldowns,
    turn_timers,
    bet_timers,
)
from constants import NEW_ROUND_DELAY, QUICK_CHAT_MESSAGES, STARTING_BANKROLL
from game_logic import GameEngine
from game_room import (
    MIN_PLAYERS,
    GameRoom,
    add_player_to_room,
    create_room,
    get_player_list,
    get_room,
    remove_player_from_room,
    validate_player_name,
)

logger = logging.getLogger("blackjack")

engine = GameEngine()
```

Then copy these functions **exactly as they exist in `main.py`** (preserving all logic, comments, and fix references):

- `handle_create_room` (lines 335–377)
- `handle_join_room` (lines 380–444)
- `handle_start_game` (lines 447–501)
- `handle_leave` (lines 503–589)
- `handle_disconnect` (lines 591–752) — the blackjack portion plus the slots routing at the top
- `handle_reconnect` (lines 755–860)
- `_cancel_turn_timer` (lines 866–870)
- `_start_turn_timer` (lines 873–909)
- `_cancel_bet_timer` (lines 912–916)
- `_start_bet_timer` (lines 919–981)
- `handle_game_action` (lines 984–1062)
- `_start_dealer_turn_if_needed` (lines 1064–1068)
- `_run_dealer_and_advance` (lines 1071–1131)
- `handle_quick_chat` (lines 1134–1174)
- `handle_view_stats` (lines 1177–1266)

Within `handle_disconnect`, the slots branch (lines 621–675) calls `handle_leave_slots` and slots broadcast functions. Use a deferred import:

```python
# At the top of the slots branch inside handle_disconnect:
from slots_handlers import (
    handle_leave_slots,
    slots_broadcast,
    cancel_slots_spin_timer,
    schedule_slots_round_advance,
)
```

- [ ] **Step 2: Verify the file imports cleanly**

Run: `cd server && python3 -c "from blackjack_handlers import handle_create_room, handle_disconnect, handle_game_action"`
Expected: No errors

---

## Task 3: Split `server/main.py` — Extract `slots_handlers.py`

**Files:**
- Create: `server/slots_handlers.py`
- Modify: `server/main.py`

- [ ] **Step 1: Create `server/slots_handlers.py`**

Move all slots handler functions and slots-specific timers:

```python
"""Slots multiplayer message handlers."""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from connection import (
    DISCONNECT_GRACE_PERIOD,
    MAX_ROOMS,
    ROOM_CREATE_COOLDOWN_SECONDS,
    SLOTS_SPIN_TIMEOUT,
    SLOTS_ROUND_ADVANCE_DELAY,
    manager,
    player_game_types,
    room_create_cooldowns,
    slots_spin_timers,
)
from game_room import validate_player_name
from slots_engine import SlotsEngine
from slots_room import (
    SLOTS_MIN_PLAYERS,
    add_player_to_slots_room,
    create_slots_room,
    get_slots_player_list,
    get_slots_room,
    remove_player_from_slots_room,
)

logger = logging.getLogger("blackjack")

slots_engine = SlotsEngine()
```

Copy these functions exactly:

- `slots_broadcast` (was `_slots_broadcast`, lines 153–167) — rename to `slots_broadcast` (drop underscore since it's now a public module function)
- `cancel_slots_spin_timer` (was `_cancel_slots_spin_timer`, lines 170–174)
- `start_slots_spin_timer` (was `_start_slots_spin_timer`, lines 177–200)
- `schedule_slots_round_advance` (was `_schedule_slots_round_advance`, lines 203–218)
- `handle_create_slots_room` (lines 1269–1310)
- `handle_join_slots_room` (lines 1313–1374)
- `handle_configure_slots` (lines 1377–1432)
- `handle_start_slots` (lines 1435–1468)
- `handle_slots_spin` (lines 1471–1501)
- `handle_leave_slots` (lines 1504–1565)
- `handle_slots_play_again` (lines 1568–1598)

Update internal calls: `_slots_broadcast` → `slots_broadcast`, `_cancel_slots_spin_timer` → `cancel_slots_spin_timer`, `_start_slots_spin_timer` → `start_slots_spin_timer`, `_schedule_slots_round_advance` → `schedule_slots_round_advance`.

- [ ] **Step 2: Verify imports**

Run: `cd server && python3 -c "from slots_handlers import handle_create_slots_room, handle_slots_spin, slots_broadcast"`
Expected: No errors

---

## Task 4: Rewrite `server/main.py` as thin shell

**Files:**
- Modify: `server/main.py`

- [ ] **Step 1: Replace `server/main.py` with the thin shell**

The new `main.py` should be ~130 lines: app setup, lifespan, health endpoint, `handle_message` router, and `websocket_endpoint`:

```python
"""FastAPI WebSocket server for multiplayer blackjack."""

import asyncio
import json
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import time

from connection import (
    ALLOWED_ORIGINS,
    ACTION_COOLDOWN_SECONDS,
    MAX_MESSAGE_SIZE,
    action_cooldowns,
    manager,
    room_cleanup_loop,
    heartbeat_loop,
)
from blackjack_handlers import (
    handle_create_room,
    handle_join_room,
    handle_start_game,
    handle_leave,
    handle_disconnect,
    handle_reconnect,
    handle_game_action,
    handle_quick_chat,
    handle_view_stats,
)
from slots_handlers import (
    handle_create_slots_room,
    handle_join_slots_room,
    handle_configure_slots,
    handle_start_slots,
    handle_slots_spin,
    handle_leave_slots,
    handle_slots_play_again,
)
from game_room import rooms
from slots_room import slots_rooms

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("blackjack")


# --- Lifespan ---


@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_task = asyncio.create_task(room_cleanup_loop())
    heartbeat_task = asyncio.create_task(heartbeat_loop())
    yield
    cleanup_task.cancel()
    heartbeat_task.cancel()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://blackjack.siaahmadi.com",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- HTTP Endpoints ---


@app.get("/health")
async def health():
    return {"status": "ok", "rooms": len(rooms), "slots_rooms": len(slots_rooms)}


# --- Message Router ---


async def handle_message(player_id: str, message: dict):
    msg_type = message.get("type")

    if msg_type != "pong":
        now = time.monotonic()
        last_action = action_cooldowns.get(player_id, 0)
        if now - last_action < ACTION_COOLDOWN_SECONDS:
            await manager.send_to_player(
                player_id, {"type": "error", "message": "Too fast — slow down"}
            )
            return
        action_cooldowns[player_id] = now

    if msg_type == "create_room":
        await handle_create_room(player_id, message)
    elif msg_type == "join_room":
        await handle_join_room(player_id, message)
    elif msg_type == "start_game":
        await handle_start_game(player_id)
    elif msg_type == "leave":
        await handle_leave(player_id)
    elif msg_type == "pong":
        pass
    elif msg_type == "quick_chat":
        await handle_quick_chat(player_id, message)
    elif msg_type == "view_stats":
        await handle_view_stats(player_id)
    elif msg_type in ("place_bet", "bet_asset", "remove_asset", "take_loan", "hit", "stand", "double_down", "split"):
        await handle_game_action(player_id, message)
    elif msg_type == "create_slots_room":
        await handle_create_slots_room(player_id, message)
    elif msg_type == "join_slots_room":
        await handle_join_slots_room(player_id, message)
    elif msg_type == "configure_slots":
        await handle_configure_slots(player_id, message)
    elif msg_type == "start_slots":
        await handle_start_slots(player_id)
    elif msg_type == "slots_spin":
        await handle_slots_spin(player_id)
    elif msg_type == "leave_slots":
        await handle_leave_slots(player_id)
    elif msg_type == "slots_play_again":
        await handle_slots_play_again(player_id)
    else:
        await manager.send_to_player(
            player_id,
            {"type": "error", "message": f"Unknown message type: {msg_type}"},
        )


# --- WebSocket Endpoint ---


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    origin = websocket.headers.get("origin", "")
    if origin and origin not in ALLOWED_ORIGINS:
        await websocket.close(code=4003, reason="Origin not allowed")
        return

    await websocket.accept()
    player_id = None
    conn_gen = None

    try:
        data = await websocket.receive_text()
        if len(data) > MAX_MESSAGE_SIZE:
            await websocket.send_text(
                json.dumps({"type": "error", "message": "Message too large"})
            )
            await websocket.close()
            return
        message = json.loads(data)

        if message.get("type") == "reconnect":
            restored_id = await handle_reconnect(
                message.get("player_id", ""),
                message.get("code", ""),
                message.get("session_token", ""),
                websocket,
            )
            if restored_id:
                player_id = restored_id
                conn_gen = manager.get_generation(player_id)
            else:
                player_id = str(uuid.uuid4())
                conn_gen = await manager.connect(player_id, websocket)
        else:
            player_id = str(uuid.uuid4())
            conn_gen = await manager.connect(player_id, websocket)
            await handle_message(player_id, message)

        while True:
            data = await websocket.receive_text()
            if len(data) > MAX_MESSAGE_SIZE:
                await manager.send_to_player(
                    player_id, {"type": "error", "message": "Message too large"}
                )
                continue
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await manager.send_to_player(
                    player_id, {"type": "error", "message": "Invalid JSON"}
                )
                continue
            await handle_message(player_id, message)

    except WebSocketDisconnect:
        if player_id:
            await handle_disconnect(player_id, websocket, generation=conn_gen)
    except json.JSONDecodeError:
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "message": "Invalid JSON"})
            )
            await websocket.close()
        except Exception:
            pass
    except Exception as e:
        logger.error(f"WebSocket error for {player_id}: {e}")
        if player_id:
            await handle_disconnect(player_id, websocket, generation=conn_gen)
```

- [ ] **Step 2: Run all server tests**

Run: `cd server && python3 -m pytest test_game.py test_slots_engine.py test_slots_room.py test_slots.py -q`
Expected: All unit tests pass (WS integration tests may still fail due to pre-existing async issue — that's not related to this refactoring)

- [ ] **Step 3: Verify the app starts**

Run: `cd server && timeout 5 python3 -c "from main import app; print('OK')" 2>&1`
Expected: "OK" — app imports without errors

- [ ] **Step 4: Commit**

```bash
git add server/connection.py server/blackjack_handlers.py server/slots_handlers.py server/main.py
git commit -m "refactor(server): split main.py into connection, blackjack_handlers, and slots_handlers modules"
```

---

## Task 5: Split `gameReducer.js` — Extract helper functions and create sub-reducers

**Files:**
- Create: `src/reducer/reducerHelpers.js`
- Create: `src/reducer/bettingReducer.js`
- Create: `src/reducer/playReducer.js`
- Create: `src/reducer/resolveReducer.js`
- Create: `src/reducer/uiReducer.js`
- Modify: `src/reducer/gameReducer.js`
- Test: `src/reducer/__tests__/gameReducer.test.js` (existing — must still pass)

- [ ] **Step 1: Create `src/reducer/reducerHelpers.js`**

Extract the shared helper functions that multiple sub-reducers need:

```javascript
import { handValue, cardValue } from '../utils/cardUtils'
import { getVigRate } from '../constants/vigRates'
import { RESULTS } from '../constants/results'
import { createHandObject } from './initialState'

export const MAX_BANKROLL_HISTORY = 500

export function computeVig(additionalBet, bankroll, committedBets = 0) {
  const effectiveBankroll = Math.max(0, bankroll - committedBets)
  const borrowedAmount = Math.max(0, additionalBet - effectiveBankroll)
  const vigRate = borrowedAmount > 0 ? getVigRate(bankroll) : 0
  return { vigAmount: Math.floor(borrowedAmount * vigRate), vigRate }
}

export function activeHand(state) {
  return state.playerHands[state.activeHandIndex]
}

export function updateActiveHand(state, updates) {
  return state.playerHands.map((h, i) =>
    i === state.activeHandIndex ? { ...h, ...updates } : h
  )
}

export function advanceToNextHand(currentIndex, playerHands) {
  let nextIndex = currentIndex + 1
  while (nextIndex < playerHands.length && playerHands[nextIndex].status !== 'playing') {
    nextIndex++
  }
  if (nextIndex >= playerHands.length) {
    const allBust = playerHands.every(h => h.status === RESULTS.BUST)
    return {
      activeHandIndex: currentIndex,
      phase: allBust ? 'result' : 'dealerTurn',
      result: allBust ? RESULTS.BUST : null,
    }
  }
  return {
    activeHandIndex: nextIndex,
    phase: 'playing',
    result: null,
  }
}

export function determineAggregateResult(outcomes) {
  if (outcomes.length === 1) return outcomes[0]
  if (outcomes.includes(RESULTS.BLACKJACK)) return RESULTS.BLACKJACK
  const hasWin = outcomes.some(o => o === RESULTS.WIN || o === RESULTS.DEALER_BUST)
  const hasLoss = outcomes.some(o => o === RESULTS.LOSE || o === RESULTS.BUST)
  const hasPush = outcomes.some(o => o === RESULTS.PUSH)
  if (hasWin && hasLoss) return RESULTS.MIXED
  if (hasWin && hasPush) return RESULTS.MIXED
  if (hasWin) return outcomes.includes(RESULTS.DEALER_BUST) ? RESULTS.DEALER_BUST : RESULTS.WIN
  if (outcomes.every(o => o === RESULTS.PUSH)) return RESULTS.PUSH
  if (hasLoss && hasPush) return RESULTS.MIXED
  if (hasLoss) return outcomes.every(o => o === RESULTS.BUST) ? RESULTS.BUST : RESULTS.LOSE
  return RESULTS.MIXED
}

export function createSplitHandPair(splitHand, splitCards, isAces) {
  const hand1 = createHandObject([splitHand.cards[0], splitCards[0]], splitHand.bet)
  const hand2 = createHandObject([splitHand.cards[1], splitCards[1]], splitHand.bet)

  if (isAces) {
    hand1.isSplitAces = true
    hand2.isSplitAces = true
    hand1.status = 'standing'
    hand2.status = 'standing'
  } else {
    if (handValue(hand1.cards) === 21) hand1.status = 'standing'
    if (handValue(hand2.cards) === 21) hand2.status = 'standing'
  }
  return [hand1, hand2]
}

export function advanceAfterSplit(hands, activeIndex) {
  if (hands[activeIndex].status === 'playing') {
    return { phase: 'playing', result: null, activeHandIndex: activeIndex }
  }
  let idx = activeIndex
  while (idx < hands.length && hands[idx].status !== 'playing') idx++
  if (idx >= hands.length) {
    const allBust = hands.every(h => h.status === RESULTS.BUST)
    return { phase: allBust ? 'result' : 'dealerTurn', result: allBust ? RESULTS.BUST : null, activeHandIndex: activeIndex }
  }
  return { phase: 'playing', result: null, activeHandIndex: idx }
}

export function findSideBet(activeSideBets, betType) {
  return activeSideBets.find(sb => sb.type === betType)
}

export function updateSideBet(activeSideBets, betType, updater) {
  return activeSideBets.map(sb => sb.type === betType ? updater(sb) : sb)
}

export function removeSideBetFromList(activeSideBets, betType) {
  return activeSideBets.filter(sb => sb.type !== betType)
}
```

- [ ] **Step 2: Create `src/reducer/bettingReducer.js`**

```javascript
import {
  ADD_CHIP, UNDO_CHIP, CLEAR_CHIPS, SELECT_CHIP, ALL_IN,
  PLACE_SIDE_BET, CLEAR_SIDE_BET, REMOVE_SIDE_BET_CHIP, TOGGLE_SIDE_BETS,
} from './actions'
import { TABLE_LEVELS } from '../constants/tableLevels'
import { decomposeIntoChips, sumChipStack } from '../utils/chipUtils'
import { SIDE_BET_MAP } from '../constants/sideBets'
import { findSideBet, updateSideBet, removeSideBetFromList } from './reducerHelpers'

export function bettingReducer(state, action) {
  switch (action.type) {
    case ADD_CHIP: {
      if (state.phase !== 'betting') return state
      const addChipMinBet = TABLE_LEVELS[state.tableLevel].minBet
      if (state.bankroll < addChipMinBet && !state.inDebtMode) return state
      const newTotal = sumChipStack(state.chipStack) + action.value
      if (newTotal > state.bankroll && !state.inDebtMode) return state
      return { ...state, chipStack: [...state.chipStack, action.value] }
    }

    case UNDO_CHIP: {
      if (state.phase !== 'betting' || state.chipStack.length === 0) return state
      const newStack = state.chipStack.slice(0, -1)
      return { ...state, chipStack: newStack, isAllIn: newStack.length === 0 ? false : state.isAllIn }
    }

    case CLEAR_CHIPS: {
      if (state.phase !== 'betting') return state
      return { ...state, chipStack: [], isAllIn: false }
    }

    case SELECT_CHIP: {
      return { ...state, selectedChipValue: action.value }
    }

    case ALL_IN: {
      if (state.phase !== 'betting') return state
      const allInMinBet = TABLE_LEVELS[state.tableLevel].minBet
      if (state.bankroll < allInMinBet && !state.inDebtMode) return state
      let allInAmount
      if (state.inDebtMode) {
        allInAmount = Math.abs(state.bankroll)
      } else {
        allInAmount = state.bankroll
      }
      const chipStack = decomposeIntoChips(allInAmount)
      return { ...state, chipStack, isAllIn: true }
    }

    case PLACE_SIDE_BET: {
      if (state.phase !== 'betting') return state
      const chipValue = action.chipValue
      if (!chipValue || chipValue <= 0) return state
      const sbDef = SIDE_BET_MAP[action.betType]
      if (!sbDef) return state

      const existing = findSideBet(state.activeSideBets, action.betType)
      const currentAmount = existing ? existing.amount : 0
      const newAmount = currentAmount + chipValue

      if (newAmount > sbDef.maxBet) return state

      const mainBet = sumChipStack(state.chipStack)
      const otherSideBets = state.activeSideBets
        .filter(sb => sb.type !== action.betType)
        .reduce((sum, sb) => sum + sb.amount, 0)
      const totalAfter = mainBet + otherSideBets + newAmount
      if (!state.inDebtMode && totalAfter > state.bankroll) return state

      const newActiveSideBets = existing
        ? updateSideBet(state.activeSideBets, action.betType, sb => ({ ...sb, amount: newAmount }))
        : [...state.activeSideBets, { type: action.betType, amount: chipValue }]

      return { ...state, activeSideBets: newActiveSideBets, bankroll: state.bankroll - chipValue }
    }

    case CLEAR_SIDE_BET: {
      if (state.phase !== 'betting') return state
      const cleared = findSideBet(state.activeSideBets, action.betType)
      if (!cleared) return state
      return {
        ...state,
        activeSideBets: removeSideBetFromList(state.activeSideBets, action.betType),
        bankroll: state.bankroll + cleared.amount,
      }
    }

    case REMOVE_SIDE_BET_CHIP: {
      if (state.phase !== 'betting') return state
      const removeSb = findSideBet(state.activeSideBets, action.betType)
      if (!removeSb) return state
      const removeChipValue = action.chipValue
      if (removeSb.amount < removeChipValue) return state
      const newAmt = removeSb.amount - removeChipValue
      if (newAmt <= 0) {
        return {
          ...state,
          activeSideBets: removeSideBetFromList(state.activeSideBets, action.betType),
          bankroll: state.bankroll + removeSb.amount,
        }
      }
      return {
        ...state,
        activeSideBets: updateSideBet(state.activeSideBets, action.betType, sb => ({ ...sb, amount: newAmt })),
        bankroll: state.bankroll + removeChipValue,
      }
    }

    case TOGGLE_SIDE_BETS:
      return { ...state, showSideBets: !state.showSideBets }

    default:
      return null // Signal: not handled
  }
}
```

- [ ] **Step 3: Create `src/reducer/playReducer.js`**

```javascript
import {
  DEAL, BET_ASSET, REMOVE_ASSET, HIT, STAND, DOUBLE_DOWN, SPLIT, DEALER_DRAW, TAKE_LOAN,
} from './actions'
import { createHandObject } from './initialState'
import { BLACKJACK_PAYOUT, RESHUFFLE_THRESHOLD, MAX_SPLIT_HANDS } from '../constants/gameConfig'
import { TABLE_LEVELS } from '../constants/tableLevels'
import { handValue, cardValue, isBlackjack } from '../utils/cardUtils'
import { sumChipStack } from '../utils/chipUtils'
import { ASSETS } from '../constants/assets'
import { RESULTS } from '../constants/results'
import { SIDE_BET_MAP, SIDE_BET_TYPES, resolvePerfectPair, resolveColorMatch, resolveLuckyLucky } from '../constants/sideBets'
import {
  computeVig, activeHand, updateActiveHand, advanceToNextHand,
  createSplitHandPair, advanceAfterSplit,
} from './reducerHelpers'

export function playReducer(state, action) {
  switch (action.type) {
    case DEAL: {
      if (state.phase !== 'betting') return state
      const assetValue = state.bettedAssets.reduce((sum, a) => sum + a.value, 0)
      if (sumChipStack(state.chipStack) + assetValue < TABLE_LEVELS[state.tableLevel].minBet) return state
      if (!action.cards || action.cards.length !== 4) return state

      const betAmount = sumChipStack(state.chipStack)
      const totalSideBetAmount = state.activeSideBets.reduce((sum, sb) => sum + sb.amount, 0)

      const preSideBetBankroll = state.bankroll + totalSideBetAmount
      const { vigAmount, vigRate } = computeVig(betAmount + totalSideBetAmount, preSideBetBankroll)

      const playerCards = [action.cards[0], action.cards[2]]
      const dealerHand = [action.cards[1], action.cards[3]]
      const deck = action.freshDeck || state.deck.slice(4)

      const playerBJ = isBlackjack(playerCards)
      const dealerBJ = isBlackjack(dealerHand)

      let phase = 'playing'
      let result = null
      let handResult = null

      if (playerBJ && dealerBJ) {
        phase = 'result'
        result = RESULTS.PUSH
        handResult = RESULTS.PUSH
      } else if (playerBJ) {
        phase = 'result'
        result = RESULTS.BLACKJACK
        handResult = RESULTS.BLACKJACK
      } else if (dealerBJ) {
        phase = 'result'
        result = RESULTS.LOSE
        handResult = RESULTS.LOSE
      }

      const hand = createHandObject(playerCards, betAmount)
      if (handResult) {
        hand.status = 'done'
        hand.result = handResult
      }

      const dealerUpCard = dealerHand[0]
      let sideBetDelta = 0
      const resolvedSideBets = []
      const deferredSideBets = []

      for (const sb of state.activeSideBets) {
        const def = SIDE_BET_MAP[sb.type]
        if (def && def.resolveAt === 'deal') {
          let won = false
          let payoutMultiplier = 0
          if (sb.type === SIDE_BET_TYPES.PERFECT_PAIR) {
            won = resolvePerfectPair(playerCards)
            payoutMultiplier = won ? def.payout : 0
          } else if (sb.type === SIDE_BET_TYPES.COLOR_MATCH) {
            won = resolveColorMatch(playerCards)
            payoutMultiplier = won ? def.payout : 0
          } else if (sb.type === SIDE_BET_TYPES.LUCKY_LUCKY) {
            const lp = resolveLuckyLucky(playerCards, dealerUpCard)
            won = lp > 0
            payoutMultiplier = lp
          }
          const delta = won ? sb.amount * (payoutMultiplier + 1) : 0
          const displayPayout = won ? sb.amount * payoutMultiplier : -sb.amount
          sideBetDelta += delta
          resolvedSideBets.push({ type: sb.type, amount: sb.amount, won, payout: displayPayout })
        } else {
          deferredSideBets.push(sb)
        }
      }

      return {
        ...state,
        deck,
        playerHands: [hand],
        activeHandIndex: 0,
        dealerHand,
        bankroll: state.bankroll - vigAmount + sideBetDelta,
        vigAmount,
        vigRate,
        totalVigPaid: state.totalVigPaid + vigAmount,
        phase,
        result,
        activeSideBets: deferredSideBets,
        sideBetResults: resolvedSideBets,
        showSideBets: false,
        bankrollHistory: state.bankrollHistory.length === 0
          ? [state.bankroll]
          : state.bankrollHistory,
      }
    }

    case BET_ASSET: {
      if (state.phase !== 'betting' && state.phase !== 'playing') return state
      if (!state.ownedAssets[action.asset.id]) return state
      if (state.bettedAssets.some(a => a.id === action.asset.id)) return state

      return {
        ...state,
        bettedAssets: [...state.bettedAssets, action.asset],
        ownedAssets: { ...state.ownedAssets, [action.asset.id]: false },
      }
    }

    case REMOVE_ASSET: {
      if (state.phase !== 'betting' && state.phase !== 'playing') return state
      const asset = state.bettedAssets.find(a => a.id === action.assetId)
      if (!asset) return state

      return {
        ...state,
        bettedAssets: state.bettedAssets.filter(a => a.id !== action.assetId),
        ownedAssets: { ...state.ownedAssets, [action.assetId]: true },
      }
    }

    case HIT: {
      if (state.phase !== 'playing') return state
      if (!action.card && !action.freshDeck) return state
      const hand = activeHand(state)
      if (!hand || hand.isDoubledDown || hand.isSplitAces) return state

      const hitCard = action.card || action.freshDeck[0]
      const hitDeck = action.card ? state.deck.slice(1) : action.freshDeck.slice(1)

      const newCards = [...hand.cards, hitCard]
      const value = handValue(newCards)
      const isBust = value > 21

      const playerHands = updateActiveHand(state, {
        cards: newCards,
        status: isBust ? RESULTS.BUST : 'playing',
        result: isBust ? RESULTS.BUST : null,
      })

      if (isBust) {
        const advancement = advanceToNextHand(state.activeHandIndex, playerHands)
        return { ...state, playerHands, deck: hitDeck, ...advancement }
      }

      if (value === 21) {
        const autoStandHands = playerHands.map((h, i) =>
          i === state.activeHandIndex ? { ...h, status: 'standing' } : h
        )
        const advancement = advanceToNextHand(state.activeHandIndex, autoStandHands)
        return { ...state, playerHands: autoStandHands, deck: hitDeck, ...advancement }
      }

      return { ...state, playerHands, deck: hitDeck }
    }

    case STAND: {
      if (state.phase !== 'playing') return state
      const playerHands = updateActiveHand(state, { status: 'standing' })
      const advancement = advanceToNextHand(state.activeHandIndex, playerHands)
      return { ...state, playerHands, ...advancement }
    }

    case DOUBLE_DOWN: {
      if (state.phase !== 'playing') return state
      if (!action.card && !action.freshDeck) return state
      const hand = activeHand(state)
      if (!hand || hand.cards.length !== 2) return state
      if (hand.isSplitAces) return state
      if (hand.bet === 0) return state
      if (state.bankroll - hand.bet < 0 && !state.inDebtMode) return state

      const ddCard = action.card || action.freshDeck[0]
      const ddDeck = action.card ? state.deck.slice(1) : action.freshDeck.slice(1)

      const totalCommitted = state.playerHands.reduce((sum, h) => sum + h.bet, 0)
      const { vigAmount } = computeVig(hand.bet, state.bankroll, totalCommitted)

      const newCards = [...hand.cards, ddCard]
      const value = handValue(newCards)
      const isBust = value > 21

      const playerHands = updateActiveHand(state, {
        cards: newCards,
        bet: hand.bet * 2,
        isDoubledDown: true,
        status: isBust ? RESULTS.BUST : 'standing',
        result: isBust ? RESULTS.BUST : null,
      })

      const advancement = advanceToNextHand(state.activeHandIndex, playerHands)
      return {
        ...state,
        playerHands,
        deck: ddDeck,
        bankroll: state.bankroll - vigAmount,
        vigAmount: state.vigAmount + vigAmount,
        totalVigPaid: state.totalVigPaid + vigAmount,
        ...advancement,
      }
    }

    case SPLIT: {
      if (state.phase !== 'playing') return state
      if (state.playerHands.length >= MAX_SPLIT_HANDS) return state
      if (!action.cards && !action.freshDeck) return state

      const splitCards = action.cards || action.freshDeck.slice(0, 2)
      const splitDeck = action.cards ? state.deck.slice(2) : action.freshDeck.slice(2)

      if (splitCards.length !== 2) return state

      const splitHand = activeHand(state)
      if (!splitHand || splitHand.cards.length !== 2) return state
      if (cardValue(splitHand.cards[0]) !== cardValue(splitHand.cards[1])) return state
      if (splitHand.isSplitAces) return state
      if (splitHand.bet === 0) return state
      if (state.bankroll - splitHand.bet < 0 && !state.inDebtMode) return state

      const isAces = splitHand.cards[0].rank === 'A' && splitHand.cards[1].rank === 'A'
      const [hand1, hand2] = createSplitHandPair(splitHand, splitCards, isAces)

      const newHands = [
        ...state.playerHands.slice(0, state.activeHandIndex),
        hand1,
        hand2,
        ...state.playerHands.slice(state.activeHandIndex + 1),
      ]

      const totalCommitted = state.playerHands.reduce((sum, h) => sum + h.bet, 0)
      const { vigAmount } = computeVig(splitHand.bet, state.bankroll, totalCommitted)
      const advancement = advanceAfterSplit(newHands, state.activeHandIndex)

      return {
        ...state,
        playerHands: newHands,
        deck: splitDeck,
        bankroll: state.bankroll - vigAmount,
        vigAmount: state.vigAmount + vigAmount,
        totalVigPaid: state.totalVigPaid + vigAmount,
        ...advancement,
      }
    }

    case DEALER_DRAW: {
      if (state.phase !== 'dealerTurn') return state
      if (!action.card && action.freshDeck) {
        const newDeck = action.freshDeck
        return {
          ...state,
          dealerHand: [...state.dealerHand, newDeck[0]],
          deck: newDeck.slice(1),
        }
      }
      if (!action.card) return state
      return {
        ...state,
        dealerHand: [...state.dealerHand, action.card],
        deck: state.deck.slice(1),
      }
    }

    case TAKE_LOAN: {
      if (state.phase !== 'betting' && state.phase !== 'playing') return state
      if (state.phase === 'playing') {
        return { ...state, inDebtMode: true }
      }
      const loanMinBet = TABLE_LEVELS[state.tableLevel].minBet
      if (state.bankroll >= loanMinBet) return state
      const hasUnlockedAssets = ASSETS.some(
        a => state.bankroll <= a.unlockThreshold && state.ownedAssets[a.id] && !state.bettedAssets.some(b => b.id === a.id)
      )
      if (hasUnlockedAssets) return state
      return { ...state, inDebtMode: true }
    }

    default:
      return null // Signal: not handled
  }
}
```

- [ ] **Step 4: Create `src/reducer/resolveReducer.js`**

```javascript
import {
  RESOLVE_HAND,
  OFFER_DOUBLE_OR_NOTHING, ACCEPT_DOUBLE_OR_NOTHING, DECLINE_DOUBLE_OR_NOTHING,
  NEW_ROUND, RESET_GAME,
  ACCEPT_TABLE_UPGRADE, DECLINE_TABLE_UPGRADE, DISMISS_TABLE_TOAST,
} from './actions'
import { createInitialState } from './initialState'
import { BLACKJACK_PAYOUT, RESHUFFLE_THRESHOLD } from '../constants/gameConfig'
import { getTableLevel, getTableChips, TABLE_LEVELS } from '../constants/tableLevels'
import { handValue, isWinResult, isLossResult } from '../utils/cardUtils'
import { RESULTS } from '../constants/results'
import { LEVEL_TO_DEALER } from '../constants/dealers'
import { SIDE_BET_MAP, SIDE_BET_TYPES } from '../constants/sideBets'
import { determineAggregateResult, MAX_BANKROLL_HISTORY } from './reducerHelpers'

export function resolveReducer(state, action) {
  switch (action.type) {
    case RESOLVE_HAND: {
      if (state.phase === 'result' && state.chipStack.length === 0 && state.bettedAssets.length === 0) return state

      const { outcomes } = action
      const assetValue = state.bettedAssets.reduce((sum, a) => sum + a.value, 0)

      let totalDelta = 0
      const resolvedHands = state.playerHands.map((hand, i) => {
        const outcome = outcomes[i] || RESULTS.PUSH
        const handBet = hand.bet + (i === 0 ? assetValue : 0)

        let delta = 0
        switch (outcome) {
          case RESULTS.BLACKJACK:
            delta = Math.floor(BLACKJACK_PAYOUT * handBet)
            break
          case RESULTS.WIN:
          case RESULTS.DEALER_BUST:
            delta = handBet
            break
          case RESULTS.PUSH:
            delta = 0
            break
          case RESULTS.LOSE:
          case RESULTS.BUST:
            delta = -handBet
            break
        }
        totalDelta += delta
        return { ...hand, result: outcome, status: 'done', payout: delta }
      })

      const hand0Result = outcomes[0]
      const hand0Win = hand0Result === RESULTS.WIN || hand0Result === RESULTS.DEALER_BUST ||
        hand0Result === RESULTS.BLACKJACK || hand0Result === RESULTS.PUSH
      const newOwnedAssets = { ...state.ownedAssets }
      if (hand0Win) {
        for (const asset of state.bettedAssets) {
          newOwnedAssets[asset.id] = true
        }
      }

      const aggregateResult = determineAggregateResult(outcomes)
      const isWin = isWinResult(aggregateResult)
      const isLoss = isLossResult(aggregateResult)
      const isMixed = aggregateResult === RESULTS.MIXED

      let deferredSideBetDelta = 0
      const deferredResults = []
      const dealerBusted = outcomes.some(o => o === RESULTS.DEALER_BUST)

      for (const sb of state.activeSideBets) {
        const def = SIDE_BET_MAP[sb.type]
        if (def && def.resolveAt === 'resolve') {
          let won = false
          if (sb.type === SIDE_BET_TYPES.DEALER_BUST) won = dealerBusted
          else if (sb.type === SIDE_BET_TYPES.JINX_BET) won = isLoss
          const delta = won ? sb.amount * (def.payout + 1) : 0
          const displayPayout = won ? sb.amount * def.payout : -sb.amount
          deferredSideBetDelta += delta
          deferredResults.push({ type: sb.type, amount: sb.amount, won, payout: displayPayout })
        }
      }

      const newBankroll = state.bankroll + totalDelta + deferredSideBetDelta

      const totalBet = resolvedHands.reduce((sum, h) => sum + h.bet, 0) + assetValue
      const newWinStreak = isWin ? state.winStreak + 1 : (isLoss || isMixed ? 0 : state.winStreak)
      const newLoseStreak = isLoss ? state.loseStreak + 1 : (isWin || isMixed ? 0 : state.loseStreak)

      let newDoublesWon = state.doublesWon
      let newDoublesLost = state.doublesLost
      for (const hand of resolvedHands) {
        if (hand.isDoubledDown) {
          if (isWinResult(hand.result)) newDoublesWon++
          if (isLossResult(hand.result)) newDoublesLost++
        }
      }

      let newSplitsWon = state.splitsWon
      let newSplitsLost = state.splitsLost
      if (state.playerHands.length > 1) {
        for (const hand of resolvedHands) {
          if (isWinResult(hand.result)) newSplitsWon++
          if (isLossResult(hand.result)) newSplitsLost++
        }
      }

      const historyEntry = {
        handNumber: state.handsPlayed + 1,
        playerHands: resolvedHands.map(h => ({
          cards: h.cards,
          value: handValue(h.cards),
          result: h.result,
          bet: h.bet,
          payout: h.payout,
          isDoubledDown: h.isDoubledDown,
        })),
        dealerCards: state.dealerHand,
        dealerValue: handValue(state.dealerHand),
        result: aggregateResult,
        totalBet,
        totalDelta,
        bankrollAfter: newBankroll,
      }
      const newHandHistory = [historyEntry, ...state.handHistory].slice(0, 30)

      const computedLevel = getTableLevel(newBankroll)
      let newTableLevel = state.tableLevel
      let tableLevelChanged = null
      let pendingTableUpgrade = state.pendingTableUpgrade
      let declinedTableUpgrade = state.declinedTableUpgrade
      let selectedChipValue = state.selectedChipValue

      if (computedLevel !== state.tableLevel) {
        if (computedLevel < state.tableLevel) {
          newTableLevel = computedLevel
          tableLevelChanged = { from: state.tableLevel, to: computedLevel }
          pendingTableUpgrade = null
          declinedTableUpgrade = null
          const downgradeChips = getTableChips(computedLevel, newBankroll)
          const downgradeValues = downgradeChips.map(c => c.value)
          selectedChipValue = downgradeValues.includes(selectedChipValue)
            ? selectedChipValue : downgradeValues[0]
        } else if (declinedTableUpgrade !== computedLevel) {
          pendingTableUpgrade = { from: state.tableLevel, to: computedLevel }
        }
      } else {
        if (declinedTableUpgrade !== null && computedLevel < declinedTableUpgrade) {
          declinedTableUpgrade = null
        }
      }

      const newHighestTableLevel = Math.max(state.highestTableLevel, newTableLevel)

      const resolveMinBet = TABLE_LEVELS[newTableLevel].minBet
      const newInDebtMode = state.inDebtMode && newBankroll < resolveMinBet

      return {
        ...state,
        bankroll: newBankroll,
        inDebtMode: newInDebtMode,
        playerHands: resolvedHands,
        ownedAssets: newOwnedAssets,
        bettedAssets: [],
        chipStack: [],
        activeSideBets: [],
        sideBetResults: [...state.sideBetResults, ...deferredResults],
        phase: 'result',
        result: aggregateResult,
        tableLevel: newTableLevel,
        tableLevelChanged,
        pendingTableUpgrade,
        declinedTableUpgrade,
        selectedChipValue,
        currentDealer: LEVEL_TO_DEALER[newTableLevel],
        highestTableLevel: newHighestTableLevel,
        handsPlayed: state.handsPlayed + 1,
        handsWon: isWin ? state.handsWon + 1 : state.handsWon,
        blackjackCount: aggregateResult === RESULTS.BLACKJACK ? state.blackjackCount + 1 : state.blackjackCount,
        winStreak: newWinStreak,
        loseStreak: newLoseStreak,
        bestWinStreak: Math.max(state.bestWinStreak, newWinStreak),
        bestLoseStreak: Math.max(state.bestLoseStreak, newLoseStreak),
        biggestWin: totalDelta > 0 ? Math.max(state.biggestWin, totalDelta) : state.biggestWin,
        biggestLoss: totalDelta < 0 ? Math.max(state.biggestLoss, Math.abs(totalDelta)) : state.biggestLoss,
        totalWagered: state.totalWagered + totalBet,
        doublesWon: newDoublesWon,
        doublesLost: newDoublesLost,
        splitsWon: newSplitsWon,
        splitsLost: newSplitsLost,
        totalWon: totalDelta > 0 ? state.totalWon + totalDelta : state.totalWon,
        totalLost: totalDelta < 0 ? state.totalLost + Math.abs(totalDelta) : state.totalLost,
        peakBankroll: Math.max(state.peakBankroll, newBankroll),
        lowestBankroll: Math.min(state.lowestBankroll, newBankroll),
        bankrollHistory: state.bankrollHistory.length >= MAX_BANKROLL_HISTORY
          ? [...state.bankrollHistory.slice(-(MAX_BANKROLL_HISTORY - 1)), newBankroll]
          : [...state.bankrollHistory, newBankroll],
        handHistory: newHandHistory,
      }
    }

    case OFFER_DOUBLE_OR_NOTHING: {
      if (state.phase !== 'result') return state
      return {
        ...state,
        doubleOrNothing: {
          originalLoss: action.lossAmount,
          currentStakes: action.lossAmount,
          flipCount: 0,
          lastResult: null,
        },
      }
    }

    case ACCEPT_DOUBLE_OR_NOTHING: {
      if (!state.doubleOrNothing) return state
      const don = state.doubleOrNothing
      if (action.won) {
        return {
          ...state,
          bankroll: state.bankroll + don.currentStakes,
          doubleOrNothing: null,
          donFlipsWon: state.donFlipsWon + 1,
          donBiggestStakes: Math.max(state.donBiggestStakes, don.currentStakes),
          donLastChainLength: don.flipCount,
        }
      } else {
        const newStakes = don.currentStakes * 2
        return {
          ...state,
          bankroll: state.bankroll - don.currentStakes,
          doubleOrNothing: {
            ...don,
            currentStakes: newStakes,
            flipCount: don.flipCount + 1,
            lastResult: 'lose',
          },
          donFlipsLost: state.donFlipsLost + 1,
          donBiggestStakes: Math.max(state.donBiggestStakes, newStakes),
          lowestBankroll: Math.min(state.lowestBankroll, state.bankroll - don.currentStakes),
        }
      }
    }

    case DECLINE_DOUBLE_OR_NOTHING: {
      return {
        ...state,
        doubleOrNothing: null,
      }
    }

    case NEW_ROUND: {
      if (state.phase !== 'result' || state.chipStack.length > 0) return state

      const deck = state.deck.length < RESHUFFLE_THRESHOLD
        ? action.freshDeck
        : state.deck

      return {
        ...state,
        deck,
        playerHands: [],
        activeHandIndex: 0,
        dealerHand: [],
        chipStack: [],
        bettedAssets: [],
        activeSideBets: [],
        sideBetResults: [],
        showSideBets: false,
        phase: 'betting',
        result: null,
        isAllIn: false,
        dealerMessage: '',
        showAssetMenu: false,
        vigAmount: 0,
        vigRate: 0,
        tableLevelChanged: null,
        doubleOrNothing: null,
      }
    }

    case DISMISS_TABLE_TOAST: {
      return { ...state, tableLevelChanged: null }
    }

    case ACCEPT_TABLE_UPGRADE: {
      if (!state.pendingTableUpgrade) return state
      const { from, to } = state.pendingTableUpgrade
      const upgradeChips = getTableChips(to, state.bankroll)
      const upgradeValues = upgradeChips.map(c => c.value)
      const chipValue = upgradeValues.includes(state.selectedChipValue)
        ? state.selectedChipValue : upgradeValues[0]
      return {
        ...state,
        tableLevel: to,
        tableLevelChanged: { from, to },
        pendingTableUpgrade: null,
        declinedTableUpgrade: null,
        selectedChipValue: chipValue,
      }
    }

    case DECLINE_TABLE_UPGRADE: {
      if (!state.pendingTableUpgrade) return state
      return {
        ...state,
        pendingTableUpgrade: null,
        declinedTableUpgrade: state.pendingTableUpgrade.to,
      }
    }

    case RESET_GAME: {
      return { ...createInitialState(), deck: action.freshDeck, muted: state.muted, notificationsEnabled: state.notificationsEnabled, achievementsEnabled: state.achievementsEnabled, ddCardFaceDown: state.ddCardFaceDown }
    }

    default:
      return null // Signal: not handled
  }
}
```

- [ ] **Step 5: Create `src/reducer/uiReducer.js`**

```javascript
import {
  TOGGLE_ASSET_MENU, TOGGLE_ACHIEVEMENTS, TOGGLE_DEBT_TRACKER, TOGGLE_HAND_HISTORY,
  DISMISS_ACHIEVEMENT, DISMISS_LOAN_SHARK, SET_LOAN_SHARK_MESSAGE,
  UNLOCK_ACHIEVEMENT, LOAD_ACHIEVEMENTS,
  TOGGLE_MUTE, TOGGLE_NOTIFICATIONS, LOAD_HIGHEST_DEBT, SET_DEALER_MESSAGE,
  SET_COMP_MESSAGE, DISMISS_COMP,
  TOGGLE_SETTINGS, TOGGLE_ACHIEVEMENTS_ENABLED, TOGGLE_DD_FACE_DOWN,
} from './actions'

export function uiReducer(state, action) {
  switch (action.type) {
    case TOGGLE_ASSET_MENU:
      return { ...state, showAssetMenu: !state.showAssetMenu }

    case TOGGLE_ACHIEVEMENTS:
      return { ...state, showAchievements: !state.showAchievements }

    case TOGGLE_DEBT_TRACKER:
      return { ...state, showDebtTracker: !state.showDebtTracker }

    case TOGGLE_HAND_HISTORY:
      return { ...state, showHandHistory: !state.showHandHistory }

    case DISMISS_ACHIEVEMENT:
      return { ...state, achievementQueue: state.achievementQueue.slice(1) }

    case DISMISS_LOAN_SHARK:
      return { ...state, loanSharkQueue: state.loanSharkQueue.slice(1) }

    case SET_LOAN_SHARK_MESSAGE:
      return {
        ...state,
        loanSharkQueue: [...state.loanSharkQueue, ...action.messages],
        seenLoanThresholds: action.seenThresholds,
      }

    case SET_COMP_MESSAGE:
      return {
        ...state,
        compQueue: [...state.compQueue, ...action.messages],
        seenCompThresholds: action.seenThresholds,
        bankroll: state.bankroll + (action.totalCompValue || 0),
      }

    case DISMISS_COMP:
      return { ...state, compQueue: state.compQueue.slice(1) }

    case UNLOCK_ACHIEVEMENT:
      if (state.unlockedAchievements.includes(action.id)) return state
      return {
        ...state,
        unlockedAchievements: [...state.unlockedAchievements, action.id],
        achievementQueue: [...state.achievementQueue, action.id],
      }

    case LOAD_ACHIEVEMENTS:
      return { ...state, unlockedAchievements: action.ids }

    case TOGGLE_MUTE:
      return { ...state, muted: !state.muted }

    case TOGGLE_NOTIFICATIONS:
      return { ...state, notificationsEnabled: !state.notificationsEnabled }

    case TOGGLE_SETTINGS:
      return { ...state, showSettings: !state.showSettings }

    case TOGGLE_ACHIEVEMENTS_ENABLED:
      return { ...state, achievementsEnabled: !state.achievementsEnabled }

    case TOGGLE_DD_FACE_DOWN:
      return { ...state, ddCardFaceDown: !state.ddCardFaceDown }

    case LOAD_HIGHEST_DEBT:
      return { ...state, lowestBankroll: Math.min(state.lowestBankroll, action.value) }

    case SET_DEALER_MESSAGE:
      return {
        ...state,
        dealerMessage: action.message,
        shownDealerLines: action.shownDealerLines,
      }

    default:
      return null // Signal: not handled
  }
}
```

- [ ] **Step 6: Rewrite `src/reducer/gameReducer.js` as thin dispatcher**

```javascript
/*
 * DEBT GATE FLOW — How assets, debt, and vig interact:
 *
 * 1. Player starts with $10,000 cash + 6 assets.
 * 2. Player loses cash to $0. Chip tray is disabled (ADD_CHIP blocked by bankroll check).
 * 3. At $0, the BettingControls UI shows "BET AN ASSET" overlay (asset gate).
 *    Assets unlock progressively based on bankroll threshold.
 * 4. Player bets an asset as a side bet (BET_ASSET action). The asset's cash value
 *    is added to the bet total alongside any chip bet.
 * 5. If they LOSE: bankroll drops by the total bet amount. Asset is gone.
 *    This negative bankroll unlocks the NEXT asset.
 * 6. The cycle repeats: bet asset → lose → go deeper negative → unlock next asset.
 * 7. When ALL assets are bet/lost and bankroll is $0 or negative:
 *    The "TAKE A LOAN" button appears (loan gate).
 * 8. Player taps TAKE A LOAN → inDebtMode = true → chip tray unlocks permanently.
 *    Now the player can bet freely with borrowed money. Vig applies on borrowed portions.
 * 9. If the player WINS back above $0: inDebtMode resets to false.
 *    If they drop back to $0 with no assets, they must tap TAKE A LOAN again.
 *
 * Key invariant: ADD_CHIP is blocked when bankroll < minBet && !inDebtMode.
 * This forces the player through the asset → loan pipeline before accessing credit.
 */

import { bettingReducer } from './bettingReducer'
import { playReducer } from './playReducer'
import { resolveReducer } from './resolveReducer'
import { uiReducer } from './uiReducer'

export function gameReducer(state, action) {
  return bettingReducer(state, action)
    ?? playReducer(state, action)
    ?? resolveReducer(state, action)
    ?? uiReducer(state, action)
    ?? state
}
```

- [ ] **Step 7: Run the existing test suite**

Run: `npx vitest run src/reducer/__tests__/gameReducer.test.js`
Expected: All tests pass (406 passing, 1 pre-existing failure)

- [ ] **Step 8: Run the full frontend test suite**

Run: `npx vitest run`
Expected: Same results as before the refactoring (406 passed, 1 pre-existing failure)

- [ ] **Step 9: Commit**

```bash
git add src/reducer/reducerHelpers.js src/reducer/bettingReducer.js src/reducer/playReducer.js src/reducer/resolveReducer.js src/reducer/uiReducer.js src/reducer/gameReducer.js
git commit -m "refactor(reducer): split gameReducer into betting, play, resolve, and ui sub-reducers"
```

---

## Task 6: Extract SoloGame callback hooks

**Files:**
- Create: `src/hooks/useBettingActions.js`
- Create: `src/hooks/useGameActions.js`
- Create: `src/hooks/useUIActions.js`
- Modify: `src/components/SoloGame.jsx`

- [ ] **Step 1: Create `src/hooks/useBettingActions.js`**

```javascript
import { useCallback } from 'react'
import { drawFromDeck } from '../utils/deckUtils'
import { deal, UNDO_CHIP, CLEAR_CHIPS, ALL_IN } from '../reducer/actions'
import audioManager from '../utils/audioManager'

export function useBettingActions(dispatch, stateRef) {
  const handleClear = useCallback(() => dispatch({ type: CLEAR_CHIPS }), [dispatch])

  const handleAllIn = useCallback(() => {
    audioManager.play('all_in')
    dispatch({ type: ALL_IN })
  }, [dispatch])

  const handleDeal = useCallback(() => {
    const { cards, deck, reshuffled } = drawFromDeck(stateRef.current.deck, 4)
    dispatch(deal(cards, reshuffled ? deck : undefined))
  }, [dispatch, stateRef])

  return { handleClear, handleAllIn, handleDeal }
}
```

- [ ] **Step 2: Create `src/hooks/useGameActions.js`**

```javascript
import { useCallback, useState } from 'react'
import { drawFromDeck } from '../utils/deckUtils'
import {
  hit, doubleDown, split, takeLoan, newRound, resetGame,
  STAND,
} from '../reducer/actions'
import { createDeck, shuffle } from '../utils/cardUtils'

export function useGameActions(dispatch, stateRef, onBack) {
  const [pendingLoanAction, setPendingLoanAction] = useState(null)

  const handleHit = useCallback(() => {
    const { cards, reshuffled, deck } = drawFromDeck(stateRef.current.deck, 1)
    dispatch(reshuffled ? hit(null, [cards[0], ...deck]) : hit(cards[0]))
  }, [dispatch, stateRef])

  const handleStand = useCallback(() => dispatch({ type: STAND }), [dispatch])

  const handleDoubleDown = useCallback(() => {
    const s = stateRef.current
    const hand = s.playerHands[s.activeHandIndex]
    if (hand && s.bankroll - hand.bet < 0 && !s.inDebtMode) {
      setPendingLoanAction({ type: 'double' })
      return
    }
    const { cards, reshuffled, deck } = drawFromDeck(s.deck, 1)
    dispatch(reshuffled ? doubleDown(null, [cards[0], ...deck]) : doubleDown(cards[0]))
  }, [dispatch, stateRef])

  const handleSplit = useCallback(() => {
    const s = stateRef.current
    const hand = s.playerHands[s.activeHandIndex]
    if (hand && s.bankroll - hand.bet < 0 && !s.inDebtMode) {
      setPendingLoanAction({ type: 'split' })
      return
    }
    const { cards, reshuffled, deck } = drawFromDeck(s.deck, 2)
    dispatch(reshuffled ? split(null, [cards[0], cards[1], ...deck]) : split(cards))
  }, [dispatch, stateRef])

  const handleConfirmLoan = useCallback(() => {
    const deck = stateRef.current.deck
    dispatch(takeLoan())
    if (pendingLoanAction?.type === 'double') {
      const { cards, reshuffled, deck: remaining } = drawFromDeck(deck, 1)
      dispatch(reshuffled ? doubleDown(null, [cards[0], ...remaining]) : doubleDown(cards[0]))
    } else if (pendingLoanAction?.type === 'split') {
      const { cards, reshuffled, deck: remaining } = drawFromDeck(deck, 2)
      dispatch(reshuffled ? split(null, [cards[0], cards[1], ...remaining]) : split(cards))
    }
    setPendingLoanAction(null)
  }, [dispatch, stateRef, pendingLoanAction])

  const handleCancelLoan = useCallback(() => setPendingLoanAction(null), [])

  const handleNewRound = useCallback(() => dispatch(newRound(shuffle(createDeck()))), [dispatch])

  const handleReset = useCallback(() => {
    if (stateRef.current.handsPlayed > 0) {
      if (!window.confirm('Start a new game? Current progress will be lost.')) return
    }
    dispatch(resetGame(shuffle(createDeck())))
  }, [dispatch, stateRef])

  const handleBack = useCallback(() => {
    if (stateRef.current.handsPlayed > 0) {
      if (!window.confirm('Return to menu? Current progress will be lost.')) return
    }
    onBack()
  }, [stateRef, onBack])

  return {
    pendingLoanAction,
    handleHit, handleStand, handleDoubleDown, handleSplit,
    handleConfirmLoan, handleCancelLoan,
    handleNewRound, handleReset, handleBack,
  }
}
```

- [ ] **Step 3: Create `src/hooks/useUIActions.js`**

```javascript
import { useCallback } from 'react'
import {
  DISMISS_TABLE_TOAST, ACCEPT_TABLE_UPGRADE, DECLINE_TABLE_UPGRADE,
  TOGGLE_ASSET_MENU, DISMISS_LOAN_SHARK, DISMISS_COMP,
  TOGGLE_ACHIEVEMENTS, TOGGLE_DEBT_TRACKER, TOGGLE_HAND_HISTORY,
  DISMISS_ACHIEVEMENT, TOGGLE_MUTE, TOGGLE_NOTIFICATIONS,
  TOGGLE_SETTINGS, TOGGLE_ACHIEVEMENTS_ENABLED, TOGGLE_DD_FACE_DOWN,
  TOGGLE_SIDE_BETS,
  placeSideBet, removeSideBetChip, clearSideBet,
  removeAsset, takeLoan,
  acceptDoubleOrNothing, declineDoubleOrNothing,
} from '../reducer/actions'

export function useUIActions(dispatch, stateRef) {
  const handleDismissTableToast = useCallback(() => dispatch({ type: DISMISS_TABLE_TOAST }), [dispatch])
  const handleAcceptUpgrade = useCallback(() => dispatch({ type: ACCEPT_TABLE_UPGRADE }), [dispatch])
  const handleDeclineUpgrade = useCallback(() => dispatch({ type: DECLINE_TABLE_UPGRADE }), [dispatch])
  const handleRemoveAsset = useCallback((assetId) => dispatch(removeAsset(assetId)), [dispatch])
  const handleToggleAssetMenu = useCallback(() => dispatch({ type: TOGGLE_ASSET_MENU }), [dispatch])
  const handleTakeLoan = useCallback(() => dispatch(takeLoan()), [dispatch])
  const handleDismissLoanShark = useCallback(() => dispatch({ type: DISMISS_LOAN_SHARK }), [dispatch])
  const handleDismissComp = useCallback(() => dispatch({ type: DISMISS_COMP }), [dispatch])
  const handleDonAccept = useCallback((won) => dispatch(acceptDoubleOrNothing(won)), [dispatch])
  const handleDonDecline = useCallback(() => dispatch(declineDoubleOrNothing()), [dispatch])
  const handleToggleAchievements = useCallback(() => dispatch({ type: TOGGLE_ACHIEVEMENTS }), [dispatch])
  const handleToggleDebtTracker = useCallback(() => dispatch({ type: TOGGLE_DEBT_TRACKER }), [dispatch])
  const handleToggleHandHistory = useCallback(() => dispatch({ type: TOGGLE_HAND_HISTORY }), [dispatch])
  const handleDismissAchievement = useCallback(() => dispatch({ type: DISMISS_ACHIEVEMENT }), [dispatch])
  const handleToggleMute = useCallback(() => dispatch({ type: TOGGLE_MUTE }), [dispatch])
  const handleToggleNotifications = useCallback(() => dispatch({ type: TOGGLE_NOTIFICATIONS }), [dispatch])
  const handleToggleSettings = useCallback(() => dispatch({ type: TOGGLE_SETTINGS }), [dispatch])
  const handleToggleAchievementsEnabled = useCallback(() => dispatch({ type: TOGGLE_ACHIEVEMENTS_ENABLED }), [dispatch])
  const handleToggleDdFaceDown = useCallback(() => dispatch({ type: TOGGLE_DD_FACE_DOWN }), [dispatch])
  const handlePlaceSideBet = useCallback(
    (betType) => dispatch(placeSideBet(betType, stateRef.current.selectedChipValue)),
    [dispatch, stateRef]
  )
  const handleRemoveSideBetChip = useCallback(
    (betType) => dispatch(removeSideBetChip(betType, stateRef.current.selectedChipValue)),
    [dispatch, stateRef]
  )
  const handleClearSideBet = useCallback(
    (betType) => dispatch(clearSideBet(betType)),
    [dispatch]
  )
  const handleToggleSideBets = useCallback(() => dispatch({ type: TOGGLE_SIDE_BETS }), [dispatch])

  return {
    handleDismissTableToast, handleAcceptUpgrade, handleDeclineUpgrade,
    handleRemoveAsset, handleToggleAssetMenu, handleTakeLoan,
    handleDismissLoanShark, handleDismissComp,
    handleDonAccept, handleDonDecline,
    handleToggleAchievements, handleToggleDebtTracker, handleToggleHandHistory,
    handleDismissAchievement, handleToggleMute, handleToggleNotifications,
    handleToggleSettings, handleToggleAchievementsEnabled, handleToggleDdFaceDown,
    handlePlaceSideBet, handleRemoveSideBetChip, handleClearSideBet, handleToggleSideBets,
  }
}
```

- [ ] **Step 4: Rewrite `src/components/SoloGame.jsx` to use the new hooks**

Replace the ~30 individual `useCallback` definitions with the three hook calls. The render tree (JSX) stays identical — only the callback definitions are extracted:

```javascript
import { useReducer, useRef, useMemo, useEffect } from 'react'
import { gameReducer } from '../reducer/gameReducer'
import { createInitialState } from '../reducer/initialState'
import { createDeck, shuffle, cardValue } from '../utils/cardUtils'
import { sumChipStack } from '../utils/chipUtils'
import { TABLE_LEVELS } from '../constants/tableLevels'
import { getDealerForLevel } from '../constants/dealers'
import audioManager from '../utils/audioManager'
import { betAsset, TOGGLE_ASSET_MENU } from '../reducer/actions'
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
  selectChip: (dispatch, value) => dispatch({ type: 'SELECT_CHIP', value }),
  addChip: (dispatch, value) => dispatch({ type: 'ADD_CHIP', value }),
  undo: (dispatch) => dispatch({ type: 'UNDO_CHIP' }),
}

function SoloGame({ onBack }) {
  const [state, dispatch] = useReducer(gameReducer, null, () => ({
    ...createInitialState(),
    deck: shuffle(createDeck()),
  }))
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (import.meta.env.DEV) window.$game = { state, dispatch }
  })

  const circleRef = useRef(null)
  const trayRef = useRef(null)
  const { flyingChips, handleChipTap, handleUndo, removeFlyingChip } = useChipInteraction(
    dispatch, soloChipActions, stateRef, circleRef, trayRef
  )

  // Game system hooks
  useDealerTurn(state, dispatch)
  useDealerMessage(state, dispatch)
  useLoanShark(state, dispatch)
  useCasinoComps(state, dispatch)
  useAchievements(state, dispatch)
  useSound(state)
  useSessionPersistence(state, dispatch)
  useDoubleOrNothing(state, dispatch)

  // Set felt color
  useEffect(() => {
    const tableId = TABLE_LEVELS[state.tableLevel].id
    document.documentElement.dataset.table = tableId
    return () => delete document.documentElement.dataset.table
  }, [state.tableLevel])

  // Action hooks
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

  // --- JSX (unchanged from before) ---
  return (
    <div className={styles.soloGame}>
      {/* ... entire render tree stays exactly the same ... */}
    </div>
  )
}

export default SoloGame
```

The JSX portion of the return statement should be copied exactly from the current file — no changes to the render tree whatsoever. The only difference is where the callbacks come from (hook returns vs. inline `useCallback`).

- [ ] **Step 5: Run the full frontend test suite**

Run: `npx vitest run`
Expected: Same results as before (406 passed, 1 pre-existing failure)

- [ ] **Step 6: Start the dev server and verify the game works**

Run: `npm run dev`
Expected: Game loads, betting works, dealing works, all phases function correctly

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useBettingActions.js src/hooks/useGameActions.js src/hooks/useUIActions.js src/components/SoloGame.jsx
git commit -m "refactor(SoloGame): extract callback groups into useBettingActions, useGameActions, useUIActions hooks"
```

---

## Summary of line count changes

| File | Before | After |
|------|--------|-------|
| `server/main.py` | 1,730 | ~200 |
| `server/connection.py` | — | ~200 |
| `server/blackjack_handlers.py` | — | ~950 |
| `server/slots_handlers.py` | — | ~400 |
| `src/reducer/gameReducer.js` | 932 | ~30 |
| `src/reducer/reducerHelpers.js` | — | ~100 |
| `src/reducer/bettingReducer.js` | — | ~120 |
| `src/reducer/playReducer.js` | — | ~270 |
| `src/reducer/resolveReducer.js` | — | ~280 |
| `src/reducer/uiReducer.js` | — | ~80 |
| `src/components/SoloGame.jsx` | 505 | ~270 |
| `src/hooks/useBettingActions.js` | — | ~25 |
| `src/hooks/useGameActions.js` | — | ~75 |
| `src/hooks/useUIActions.js` | — | ~70 |

Total lines: ~same. No file exceeds 950 lines. The three god files are eliminated.
