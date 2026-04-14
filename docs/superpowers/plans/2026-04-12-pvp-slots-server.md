# PvP Slots Server (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-side PvP slots engine — room management, game engine, and WebSocket handlers — so that 2-4 players can create/join slots rooms, configure rounds/bet, spin simultaneously each round, and compete for a pot with 8% house edge.

**Architecture:** Three new files following blackjack's patterns. `slots_room.py` mirrors `game_room.py` with its own `SlotsRoom`/`SlotsPlayerState` dataclasses and a separate `slots_rooms` registry (room codes check both registries for collisions). `slots_engine.py` mirrors `game_logic.py` — a `SlotsEngine` class that mutates room state and returns event lists for the WebSocket layer to broadcast. `main.py` gets new handler functions and dispatch entries for 7 slots message types, plus a `player_game_types` tracker so `leave`/disconnect route to the correct game's cleanup. The existing `slots_constants.py` (Phase 1) provides `generate_spin()`, `score_reels()`, and `calculate_payout()`.

**Tech Stack:** Python 3.12, FastAPI WebSocket, asyncio, dataclasses, unittest.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `server/slots_room.py` | `SlotsRoom` + `SlotsPlayerState` dataclasses, `slots_rooms` registry, room CRUD functions |
| `server/slots_engine.py` | `SlotsEngine` class — game lifecycle (start, spin, resolve round, end game), state serialization |
| `server/test_slots_room.py` | Unit tests for slots_room.py |
| `server/test_slots_engine.py` | Unit tests for slots_engine.py |

### Modified Files

| File | Changes |
|------|---------|
| `server/main.py` | Add 7 slots WebSocket handlers, `player_game_types` tracker, slots broadcast helper, AFK spin timer, round advancement delay |
| `server/game_room.py:85-92` | `generate_room_code()` checks both `rooms` and `slots_rooms` for collisions |

---

### Task 1: SlotsPlayerState and SlotsRoom Dataclasses

**Files:**
- Create: `server/slots_room.py`
- Create: `server/test_slots_room.py`

- [ ] **Step 1: Write test for SlotsPlayerState defaults**

```python
# server/test_slots_room.py
"""Unit tests for slots_room module."""

import asyncio
import unittest

from slots_room import (
    SlotsPlayerState,
    SlotsRoom,
    slots_rooms,
    create_slots_room,
    add_player_to_slots_room,
    remove_player_from_slots_room,
    get_slots_player_list,
    get_slots_room,
    reset_slots_round_state,
)


class TestSlotsPlayerState(unittest.TestCase):
    def test_defaults(self):
        p = SlotsPlayerState(name="Alice", player_id="p1")
        self.assertEqual(p.name, "Alice")
        self.assertEqual(p.player_id, "p1")
        self.assertTrue(p.connected)
        self.assertFalse(p.is_host)
        self.assertEqual(p.total_score, 0)
        self.assertIsNone(p.current_spin)
        self.assertEqual(p.round_score, 0)
        self.assertFalse(p.has_spun)
        self.assertIsNotNone(p.session_token)
        self.assertTrue(len(p.session_token) > 10)

    def test_unique_session_tokens(self):
        p1 = SlotsPlayerState(name="A", player_id="p1")
        p2 = SlotsPlayerState(name="B", player_id="p2")
        self.assertNotEqual(p1.session_token, p2.session_token)


class TestSlotsRoom(unittest.TestCase):
    def test_defaults(self):
        room = SlotsRoom(code="ABCD")
        self.assertEqual(room.code, "ABCD")
        self.assertEqual(room.phase, "lobby")
        self.assertIsNone(room.host_id)
        self.assertEqual(room.total_rounds, 10)
        self.assertEqual(room.bet_per_round, 100)
        self.assertEqual(room.current_round, 0)
        self.assertEqual(room.players, {})


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sia/Desktop/blackjack/server && python -m pytest test_slots_room.py -v`
Expected: FAIL — `slots_room` module does not exist

- [ ] **Step 3: Write SlotsPlayerState and SlotsRoom dataclasses**

```python
# server/slots_room.py
"""Room and player state management for multiplayer slots."""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
import secrets

from game_room import ROOM_CODE_CHARS, rooms, validate_player_name


@dataclass
class SlotsPlayerState:
    name: str
    player_id: str
    connected: bool = True
    is_host: bool = False
    session_token: str = field(default_factory=lambda: secrets.token_urlsafe(32))
    disconnected_at: datetime | None = None
    total_score: int = 0
    current_spin: list | None = None
    round_score: int = 0
    has_spun: bool = False


@dataclass
class SlotsRoom:
    code: str
    players: dict[str, SlotsPlayerState] = field(default_factory=dict)
    phase: str = "lobby"  # lobby | spinning | round_result | final_result
    host_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    total_rounds: int = 10
    bet_per_round: int = 100
    current_round: int = 0
    _lock: object = field(default_factory=asyncio.Lock, repr=False)


# Global in-memory registry — separate from blackjack rooms
slots_rooms: dict[str, SlotsRoom] = {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sia/Desktop/blackjack/server && python -m pytest test_slots_room.py::TestSlotsPlayerState -v && python -m pytest test_slots_room.py::TestSlotsRoom -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/sia/Desktop/blackjack && git add server/slots_room.py server/test_slots_room.py
git commit -m "feat(slots): add SlotsPlayerState and SlotsRoom dataclasses"
```

---

### Task 2: Room CRUD Functions (create, join, remove, helpers)

**Files:**
- Modify: `server/slots_room.py`
- Modify: `server/test_slots_room.py`
- Modify: `server/game_room.py:85-92`

- [ ] **Step 1: Write tests for room CRUD functions**

Append to `server/test_slots_room.py`:

```python
class TestCreateSlotsRoom(unittest.TestCase):
    def setUp(self):
        slots_rooms.clear()

    def tearDown(self):
        slots_rooms.clear()

    def test_creates_room_with_host(self):
        room = create_slots_room("Alice", "p1")
        self.assertIn(room.code, slots_rooms)
        self.assertEqual(room.host_id, "p1")
        self.assertEqual(len(room.players), 1)
        self.assertTrue(room.players["p1"].is_host)
        self.assertEqual(room.players["p1"].name, "Alice")

    def test_code_is_four_chars(self):
        room = create_slots_room("Alice", "p1")
        self.assertEqual(len(room.code), 4)

    def test_code_not_in_blackjack_rooms(self):
        # Populate blackjack rooms dict to force collision avoidance
        from game_room import rooms as bj_rooms
        # Just verify the function exists and returns a room
        room = create_slots_room("Alice", "p1")
        self.assertNotIn(room.code, bj_rooms)


class TestAddPlayerToSlotsRoom(unittest.TestCase):
    def setUp(self):
        slots_rooms.clear()
        self.room = create_slots_room("Alice", "host")

    def tearDown(self):
        slots_rooms.clear()

    def test_add_player(self):
        player = add_player_to_slots_room(self.room, "Bob", "p2")
        self.assertEqual(player.name, "Bob")
        self.assertFalse(player.is_host)
        self.assertEqual(len(self.room.players), 2)

    def test_reject_duplicate_name(self):
        with self.assertRaises(ValueError):
            add_player_to_slots_room(self.room, "Alice", "p2")

    def test_reject_duplicate_name_case_insensitive(self):
        with self.assertRaises(ValueError):
            add_player_to_slots_room(self.room, "alice", "p2")

    def test_max_four_players(self):
        add_player_to_slots_room(self.room, "Bob", "p2")
        add_player_to_slots_room(self.room, "Carol", "p3")
        add_player_to_slots_room(self.room, "Dave", "p4")
        with self.assertRaises(ValueError):
            add_player_to_slots_room(self.room, "Eve", "p5")

    def test_reject_join_during_game(self):
        self.room.phase = "spinning"
        with self.assertRaises(ValueError):
            add_player_to_slots_room(self.room, "Bob", "p2")


class TestRemovePlayerFromSlotsRoom(unittest.TestCase):
    def setUp(self):
        slots_rooms.clear()
        self.room = create_slots_room("Alice", "host")
        add_player_to_slots_room(self.room, "Bob", "p2")

    def tearDown(self):
        slots_rooms.clear()

    def test_remove_non_host(self):
        new_host = remove_player_from_slots_room(self.room, "p2")
        self.assertIsNone(new_host)
        self.assertNotIn("p2", self.room.players)

    def test_remove_host_transfers(self):
        new_host = remove_player_from_slots_room(self.room, "host")
        self.assertEqual(new_host, "p2")
        self.assertTrue(self.room.players["p2"].is_host)

    def test_remove_last_player_deletes_room(self):
        remove_player_from_slots_room(self.room, "p2")
        remove_player_from_slots_room(self.room, "host")
        self.assertNotIn(self.room.code, slots_rooms)

    def test_remove_nonexistent_player(self):
        result = remove_player_from_slots_room(self.room, "nobody")
        self.assertIsNone(result)


class TestGetSlotsPlayerList(unittest.TestCase):
    def setUp(self):
        slots_rooms.clear()
        self.room = create_slots_room("Alice", "host")
        add_player_to_slots_room(self.room, "Bob", "p2")

    def tearDown(self):
        slots_rooms.clear()

    def test_returns_list_of_dicts(self):
        plist = get_slots_player_list(self.room)
        self.assertEqual(len(plist), 2)
        self.assertEqual(plist[0]["name"], "Alice")
        self.assertTrue(plist[0]["is_host"])
        self.assertEqual(plist[1]["name"], "Bob")
        self.assertFalse(plist[1]["is_host"])


class TestGetSlotsRoom(unittest.TestCase):
    def setUp(self):
        slots_rooms.clear()
        self.room = create_slots_room("Alice", "host")

    def tearDown(self):
        slots_rooms.clear()

    def test_found(self):
        found = get_slots_room(self.room.code)
        self.assertIs(found, self.room)

    def test_case_insensitive(self):
        found = get_slots_room(self.room.code.lower())
        self.assertIs(found, self.room)

    def test_not_found(self):
        self.assertIsNone(get_slots_room("ZZZZ"))


class TestResetSlotsRoundState(unittest.TestCase):
    def test_resets_per_round_fields(self):
        p = SlotsPlayerState(name="Alice", player_id="p1")
        p.total_score = 500
        p.current_spin = [{"name": "Cherry"}]
        p.round_score = 75
        p.has_spun = True
        reset_slots_round_state(p)
        self.assertIsNone(p.current_spin)
        self.assertEqual(p.round_score, 0)
        self.assertFalse(p.has_spun)
        # total_score preserved
        self.assertEqual(p.total_score, 500)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/sia/Desktop/blackjack/server && python -m pytest test_slots_room.py -v`
Expected: FAIL — functions not defined

- [ ] **Step 3: Implement room CRUD functions**

Append to `server/slots_room.py`:

```python
SLOTS_MAX_PLAYERS = 4
SLOTS_MIN_PLAYERS = 2


def generate_slots_room_code(length: int = 4) -> str:
    """Generate a unique room code that doesn't collide with blackjack rooms."""
    for _ in range(100):
        code = "".join(secrets.choice(ROOM_CODE_CHARS) for _ in range(length))
        if code not in slots_rooms and code not in rooms:
            return code
    return "".join(secrets.choice(ROOM_CODE_CHARS) for _ in range(length + 1))


def get_slots_room(code: str) -> SlotsRoom | None:
    """Look up a slots room by code (case-insensitive)."""
    return slots_rooms.get(code.upper())


def create_slots_room(player_name: str, player_id: str) -> SlotsRoom:
    """Create a new slots room and add the creator as host."""
    code = generate_slots_room_code()
    player = SlotsPlayerState(name=player_name, player_id=player_id, is_host=True)
    room = SlotsRoom(code=code, players={player_id: player}, host_id=player_id)
    slots_rooms[code] = room
    return room


def add_player_to_slots_room(room: SlotsRoom, player_name: str, player_id: str) -> SlotsPlayerState:
    """Add a player to an existing slots room. Raises ValueError on validation failures."""
    if len(room.players) >= SLOTS_MAX_PLAYERS:
        raise ValueError(f"Room is full (max {SLOTS_MAX_PLAYERS} players)")

    if room.phase != "lobby":
        raise ValueError("Cannot join, game already in progress")

    lower_name = player_name.lower()
    for p in room.players.values():
        if p.name.lower() == lower_name:
            raise ValueError("Name already taken in this room")

    player = SlotsPlayerState(name=player_name, player_id=player_id)
    room.players[player_id] = player
    return player


def remove_player_from_slots_room(room: SlotsRoom, player_id: str) -> str | None:
    """Remove a player from a slots room. Transfers host if needed.

    Returns the new host's player_id if host was transferred, None otherwise.
    Deletes the room from registry if empty after removal.
    """
    if player_id not in room.players:
        return None

    was_host = room.players[player_id].is_host
    del room.players[player_id]

    new_host_id = None

    if was_host and room.players:
        for pid, player in room.players.items():
            if player.connected:
                player.is_host = True
                room.host_id = pid
                new_host_id = pid
                break
        if new_host_id is None:
            first_pid = next(iter(room.players))
            room.players[first_pid].is_host = True
            room.host_id = first_pid
            new_host_id = first_pid

    if not room.players:
        slots_rooms.pop(room.code, None)

    return new_host_id


def get_slots_player_list(room: SlotsRoom) -> list[dict]:
    """Return serializable list of players for broadcasting."""
    return [
        {
            "name": p.name,
            "player_id": p.player_id,
            "is_host": p.is_host,
            "connected": p.connected,
        }
        for p in room.players.values()
    ]


def reset_slots_round_state(player: SlotsPlayerState):
    """Reset per-round state for a new round. Keeps total_score."""
    player.current_spin = None
    player.round_score = 0
    player.has_spun = False
```

- [ ] **Step 4: Update blackjack's generate_room_code to check slots_rooms**

In `server/game_room.py`, modify `generate_room_code()`:

```python
def generate_room_code(length: int = 4) -> str:
    """Generate a unique 4-character room code.

    Checks both blackjack and slots room registries for collisions.
    """
    # Import here to avoid circular import
    from slots_room import slots_rooms

    for _ in range(100):
        code = "".join(secrets.choice(ROOM_CODE_CHARS) for _ in range(length))
        if code not in rooms and code not in slots_rooms:
            return code
    return "".join(secrets.choice(ROOM_CODE_CHARS) for _ in range(length + 1))
```

- [ ] **Step 5: Run all tests to verify they pass**

Run: `cd /Users/sia/Desktop/blackjack/server && python -m pytest test_slots_room.py -v && python -m pytest test_slots.py -v && python -m pytest test_game.py -v`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/sia/Desktop/blackjack && git add server/slots_room.py server/test_slots_room.py server/game_room.py
git commit -m "feat(slots): add slots room CRUD functions with cross-game collision checking"
```

---

### Task 3: SlotsEngine — start_game and handle_spin

**Files:**
- Create: `server/slots_engine.py`
- Create: `server/test_slots_engine.py`

- [ ] **Step 1: Write tests for start_game and handle_spin**

```python
# server/test_slots_engine.py
"""Unit tests for slots_engine module."""

import unittest
from unittest.mock import patch

from slots_constants import SLOT_SYMBOLS, score_reels
from slots_room import (
    SlotsRoom,
    SlotsPlayerState,
    add_player_to_slots_room,
    create_slots_room,
    reset_slots_round_state,
    slots_rooms,
)
from slots_engine import SlotsEngine

CHERRY = SLOT_SYMBOLS[0]
LEMON = SLOT_SYMBOLS[1]
BELL = SLOT_SYMBOLS[3]
JACKPOT = SLOT_SYMBOLS[6]


def make_slots_room(n=2, total_rounds=3, bet_per_round=100):
    """Create a SlotsRoom with n players ready for start_game."""
    room = SlotsRoom(code="TEST", total_rounds=total_rounds, bet_per_round=bet_per_round)
    for i in range(n):
        pid = f"p{i}"
        room.players[pid] = SlotsPlayerState(
            name=f"Player {i}",
            player_id=pid,
            is_host=(i == 0),
        )
    room.host_id = "p0"
    return room


class TestStartGame(unittest.TestCase):
    def setUp(self):
        self.engine = SlotsEngine()

    def test_transitions_to_spinning(self):
        room = make_slots_room(2)
        events = self.engine.start_game(room)
        self.assertEqual(room.phase, "spinning")
        self.assertEqual(room.current_round, 1)

    def test_returns_game_started_event(self):
        room = make_slots_room(2)
        events = self.engine.start_game(room)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "slots_game_started")
        self.assertEqual(events[0]["total_rounds"], room.total_rounds)
        self.assertEqual(events[0]["bet_per_round"], room.bet_per_round)
        self.assertEqual(events[0]["current_round"], 1)

    def test_resets_player_round_state(self):
        room = make_slots_room(2)
        room.players["p0"].has_spun = True
        room.players["p0"].round_score = 99
        self.engine.start_game(room)
        self.assertFalse(room.players["p0"].has_spun)
        self.assertEqual(room.players["p0"].round_score, 0)

    def test_rejects_less_than_two_players(self):
        room = make_slots_room(1)
        with self.assertRaises(ValueError):
            self.engine.start_game(room)

    def test_rejects_more_than_four_players(self):
        room = make_slots_room(2)
        for i in range(3):
            room.players[f"extra{i}"] = SlotsPlayerState(
                name=f"Extra {i}", player_id=f"extra{i}"
            )
        # Now 5 players
        with self.assertRaises(ValueError):
            self.engine.start_game(room)

    def test_rejects_if_not_in_lobby(self):
        room = make_slots_room(2)
        room.phase = "spinning"
        with self.assertRaises(ValueError):
            self.engine.start_game(room)

    def test_calculates_buy_in_and_pot(self):
        room = make_slots_room(2, total_rounds=5, bet_per_round=500)
        events = self.engine.start_game(room)
        # buy_in = rounds * bet_per_round = 5 * 500 = 2500
        # pot = buy_in * player_count = 2500 * 2 = 5000
        self.assertEqual(events[0]["buy_in"], 2500)
        self.assertEqual(events[0]["pot"], 5000)


class TestHandleSpin(unittest.TestCase):
    def setUp(self):
        self.engine = SlotsEngine()
        self.room = make_slots_room(2, total_rounds=3, bet_per_round=100)
        self.engine.start_game(self.room)

    @patch("slots_engine.generate_spin")
    def test_records_spin_result(self, mock_spin):
        mock_spin.return_value = [CHERRY, CHERRY, CHERRY]
        events = self.engine.handle_spin(self.room, "p0")
        self.assertTrue(self.room.players["p0"].has_spun)
        self.assertEqual(self.room.players["p0"].current_spin, [CHERRY, CHERRY, CHERRY])
        score = score_reels([CHERRY, CHERRY, CHERRY])["score"]  # 50
        self.assertEqual(self.room.players["p0"].round_score, score)
        self.assertEqual(self.room.players["p0"].total_score, score)

    @patch("slots_engine.generate_spin")
    def test_returns_spin_result_event(self, mock_spin):
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        events = self.engine.handle_spin(self.room, "p0")
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "slots_spin_result")
        self.assertEqual(events[0]["player_id"], "p0")
        self.assertEqual(events[0]["reels"], [CHERRY, LEMON, BELL])

    @patch("slots_engine.generate_spin")
    def test_rejects_double_spin(self, mock_spin):
        mock_spin.return_value = [CHERRY, CHERRY, CHERRY]
        self.engine.handle_spin(self.room, "p0")
        with self.assertRaises(ValueError):
            self.engine.handle_spin(self.room, "p0")

    @patch("slots_engine.generate_spin")
    def test_rejects_spin_in_wrong_phase(self, mock_spin):
        mock_spin.return_value = [CHERRY, CHERRY, CHERRY]
        self.room.phase = "lobby"
        with self.assertRaises(ValueError):
            self.engine.handle_spin(self.room, "p0")

    @patch("slots_engine.generate_spin")
    def test_auto_resolves_when_all_spun(self, mock_spin):
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.engine.handle_spin(self.room, "p0")
        events = self.engine.handle_spin(self.room, "p1")
        # Should contain spin_result AND round_result
        types = [e["type"] for e in events]
        self.assertIn("slots_spin_result", types)
        self.assertIn("slots_round_result", types)

    @patch("slots_engine.generate_spin")
    def test_disconnected_player_skipped_for_auto_resolve(self, mock_spin):
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.room.players["p1"].connected = False
        events = self.engine.handle_spin(self.room, "p0")
        # Only p0 is connected, so all connected have spun — auto-resolve
        types = [e["type"] for e in events]
        self.assertIn("slots_round_result", types)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/sia/Desktop/blackjack/server && python -m pytest test_slots_engine.py -v`
Expected: FAIL — `slots_engine` module does not exist

- [ ] **Step 3: Implement SlotsEngine with start_game and handle_spin**

```python
# server/slots_engine.py
"""Server-side game engine for multiplayer slots.

The SlotsEngine operates on SlotsRoom/SlotsPlayerState instances, mutating them
in place. Each method returns a list of event dicts for the WebSocket layer to
broadcast.
"""

import math

from slots_constants import HOUSE_EDGE, generate_spin, score_reels
from slots_room import (
    SLOTS_MAX_PLAYERS,
    SLOTS_MIN_PLAYERS,
    SlotsRoom,
    reset_slots_round_state,
)


class SlotsEngine:
    """Server-side slots game logic."""

    def start_game(self, room: SlotsRoom) -> list[dict]:
        """Validate and transition from lobby to first spinning round."""
        if room.phase != "lobby":
            raise ValueError("Game already in progress")

        connected = [p for p in room.players.values() if p.connected]
        if len(connected) < SLOTS_MIN_PLAYERS:
            raise ValueError(f"Need at least {SLOTS_MIN_PLAYERS} players to start")
        if len(connected) > SLOTS_MAX_PLAYERS:
            raise ValueError(f"Maximum {SLOTS_MAX_PLAYERS} players")

        room.current_round = 1
        room.phase = "spinning"

        for player in room.players.values():
            reset_slots_round_state(player)
            player.total_score = 0

        buy_in = room.total_rounds * room.bet_per_round
        pot = buy_in * len(connected)

        return [
            {
                "type": "slots_game_started",
                "total_rounds": room.total_rounds,
                "bet_per_round": room.bet_per_round,
                "current_round": room.current_round,
                "buy_in": buy_in,
                "pot": pot,
                "state": self.get_room_state(room),
            }
        ]

    def handle_spin(self, room: SlotsRoom, player_id: str) -> list[dict]:
        """Generate a spin for a player. Auto-resolves round if all connected have spun."""
        if room.phase != "spinning":
            raise ValueError("Not in spinning phase")

        player = room.players.get(player_id)
        if not player:
            raise ValueError("Player not found")
        if player.has_spun:
            raise ValueError("Already spun this round")

        reels = generate_spin()
        result = score_reels(reels)

        player.current_spin = reels
        player.round_score = result["score"]
        player.total_score += result["score"]
        player.has_spun = True

        events = [
            {
                "type": "slots_spin_result",
                "player_id": player_id,
                "reels": reels,
                "score": result["score"],
                "match_type": result["match_type"],
                "matched_symbol": result["matched_symbol"],
                "total_score": player.total_score,
            }
        ]

        # Check if all connected players have spun
        connected = [p for p in room.players.values() if p.connected]
        if all(p.has_spun for p in connected):
            events.extend(self.resolve_round(room))

        return events

    def auto_spin(self, room: SlotsRoom, player_id: str) -> list[dict]:
        """Same as handle_spin but tags result with auto: true (for AFK)."""
        events = self.handle_spin(room, player_id)
        for event in events:
            if event["type"] == "slots_spin_result" and event["player_id"] == player_id:
                event["auto"] = True
        return events

    def resolve_round(self, room: SlotsRoom) -> list[dict]:
        """Broadcast all player results sorted by total score.

        If final round, calls end_game. Otherwise stays in round_result phase.
        """
        room.phase = "round_result"

        standings = sorted(
            [
                {
                    "player_id": pid,
                    "name": p.name,
                    "round_score": p.round_score,
                    "total_score": p.total_score,
                    "reels": p.current_spin,
                    "match_type": score_reels(p.current_spin)["match_type"] if p.current_spin else "none",
                }
                for pid, p in room.players.items()
                if p.connected
            ],
            key=lambda x: x["total_score"],
            reverse=True,
        )

        events = [
            {
                "type": "slots_round_result",
                "current_round": room.current_round,
                "total_rounds": room.total_rounds,
                "standings": standings,
                "state": self.get_room_state(room),
            }
        ]

        if room.current_round >= room.total_rounds:
            events.extend(self.end_game(room))

        return events

    def get_room_state(self, room: SlotsRoom) -> dict:
        """Serialize full room state for broadcast/reconnection."""
        connected = [p for p in room.players.values() if p.connected]
        buy_in = room.total_rounds * room.bet_per_round
        pot = buy_in * len(connected)

        return {
            "phase": room.phase,
            "current_round": room.current_round,
            "total_rounds": room.total_rounds,
            "bet_per_round": room.bet_per_round,
            "buy_in": buy_in,
            "pot": pot,
            "player_states": {
                pid: {
                    "name": p.name,
                    "player_id": p.player_id,
                    "total_score": p.total_score,
                    "has_spun": p.has_spun,
                    "round_score": p.round_score,
                    "reels": p.current_spin,
                    "match_type": score_reels(p.current_spin)["match_type"] if p.current_spin else None,
                    "connected": p.connected,
                    "is_host": p.is_host,
                }
                for pid, p in room.players.items()
            },
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/sia/Desktop/blackjack/server && python -m pytest test_slots_engine.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/sia/Desktop/blackjack && git add server/slots_engine.py server/test_slots_engine.py
git commit -m "feat(slots): add SlotsEngine with start_game and handle_spin"
```

---

### Task 4: SlotsEngine — advance_round and end_game

**Files:**
- Modify: `server/slots_engine.py`
- Modify: `server/test_slots_engine.py`

- [ ] **Step 1: Write tests for advance_round and end_game**

Append to `server/test_slots_engine.py`:

```python
class TestAdvanceRound(unittest.TestCase):
    def setUp(self):
        self.engine = SlotsEngine()
        self.room = make_slots_room(2, total_rounds=3, bet_per_round=100)
        self.engine.start_game(self.room)

    @patch("slots_engine.generate_spin")
    def test_advance_increments_round(self, mock_spin):
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.engine.handle_spin(self.room, "p0")
        self.engine.handle_spin(self.room, "p1")
        # Now in round_result phase, round 1
        events = self.engine.advance_round(self.room)
        self.assertEqual(self.room.current_round, 2)
        self.assertEqual(self.room.phase, "spinning")

    @patch("slots_engine.generate_spin")
    def test_advance_resets_round_state(self, mock_spin):
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.engine.handle_spin(self.room, "p0")
        self.engine.handle_spin(self.room, "p1")
        self.engine.advance_round(self.room)
        for p in self.room.players.values():
            self.assertFalse(p.has_spun)
            self.assertIsNone(p.current_spin)
            self.assertEqual(p.round_score, 0)
            # total_score preserved
            self.assertGreater(p.total_score, 0)

    @patch("slots_engine.generate_spin")
    def test_advance_returns_round_started_event(self, mock_spin):
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.engine.handle_spin(self.room, "p0")
        self.engine.handle_spin(self.room, "p1")
        events = self.engine.advance_round(self.room)
        self.assertEqual(events[0]["type"], "slots_round_started")
        self.assertEqual(events[0]["current_round"], 2)

    def test_advance_rejects_wrong_phase(self):
        with self.assertRaises(ValueError):
            self.engine.advance_round(self.room)  # still in spinning


class TestEndGame(unittest.TestCase):
    def setUp(self):
        self.engine = SlotsEngine()

    @patch("slots_engine.generate_spin")
    def test_winner_gets_pot_minus_house_edge(self, mock_spin):
        room = make_slots_room(2, total_rounds=1, bet_per_round=100)
        self.engine.start_game(room)
        # p0 gets triple (high score), p1 gets no match (low score)
        mock_spin.return_value = [JACKPOT, JACKPOT, JACKPOT]
        self.engine.handle_spin(room, "p0")
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        events = self.engine.handle_spin(room, "p1")
        # After final round, end_game is auto-called
        game_ended = [e for e in events if e["type"] == "slots_game_ended"]
        self.assertEqual(len(game_ended), 1)
        end_evt = game_ended[0]
        # buy_in = 1 * 100 = 100, pot = 100 * 2 = 200
        # winner_payout = floor(200 * 0.92) = 184
        self.assertEqual(end_evt["pot"], 200)
        self.assertEqual(end_evt["winner_payout"], 184)
        self.assertEqual(end_evt["winner_id"], "p0")
        self.assertEqual(end_evt["payout_type"], "winner")
        self.assertFalse(end_evt["is_tie"])

    @patch("slots_engine.generate_spin")
    def test_tie_refunds_buy_in(self, mock_spin):
        room = make_slots_room(2, total_rounds=1, bet_per_round=100)
        self.engine.start_game(room)
        # Both get identical spins
        mock_spin.return_value = [CHERRY, CHERRY, CHERRY]
        self.engine.handle_spin(room, "p0")
        mock_spin.return_value = [CHERRY, CHERRY, CHERRY]
        events = self.engine.handle_spin(room, "p1")
        game_ended = [e for e in events if e["type"] == "slots_game_ended"]
        end_evt = game_ended[0]
        self.assertTrue(end_evt["is_tie"])
        self.assertEqual(end_evt["payout_type"], "refund")
        # Each player refunded buy_in = 100
        self.assertIsNone(end_evt["winner_id"])

    @patch("slots_engine.generate_spin")
    def test_final_standings_sorted(self, mock_spin):
        room = make_slots_room(3, total_rounds=1, bet_per_round=100)
        self.engine.start_game(room)
        mock_spin.return_value = [CHERRY, LEMON, BELL]  # score 40
        self.engine.handle_spin(room, "p0")
        mock_spin.return_value = [JACKPOT, JACKPOT, JACKPOT]  # score 2500
        self.engine.handle_spin(room, "p1")
        mock_spin.return_value = [BELL, BELL, BELL]  # score 250
        events = self.engine.handle_spin(room, "p2")
        game_ended = [e for e in events if e["type"] == "slots_game_ended"]
        standings = game_ended[0]["final_standings"]
        scores = [s["total_score"] for s in standings]
        self.assertEqual(scores, sorted(scores, reverse=True))

    @patch("slots_engine.generate_spin")
    def test_phase_is_final_result(self, mock_spin):
        room = make_slots_room(2, total_rounds=1, bet_per_round=100)
        self.engine.start_game(room)
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.engine.handle_spin(room, "p0")
        self.engine.handle_spin(room, "p1")
        self.assertEqual(room.phase, "final_result")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/sia/Desktop/blackjack/server && python -m pytest test_slots_engine.py::TestAdvanceRound -v && python -m pytest test_slots_engine.py::TestEndGame -v`
Expected: FAIL — `advance_round` not defined

- [ ] **Step 3: Implement advance_round and end_game**

Add to `SlotsEngine` class in `server/slots_engine.py`:

```python
    def advance_round(self, room: SlotsRoom) -> list[dict]:
        """Increment round counter, reset per-round state, transition to spinning."""
        if room.phase != "round_result":
            raise ValueError("Can only advance from round_result phase")

        room.current_round += 1
        room.phase = "spinning"

        for player in room.players.values():
            if player.connected:
                reset_slots_round_state(player)

        return [
            {
                "type": "slots_round_started",
                "current_round": room.current_round,
                "total_rounds": room.total_rounds,
                "state": self.get_room_state(room),
            }
        ]

    def end_game(self, room: SlotsRoom) -> list[dict]:
        """Determine winner, calculate pot and payout, handle ties."""
        room.phase = "final_result"

        connected = [p for p in room.players.values() if p.connected]
        buy_in = room.total_rounds * room.bet_per_round
        pot = buy_in * len(connected)

        # Sort by total score descending
        sorted_players = sorted(connected, key=lambda p: p.total_score, reverse=True)

        final_standings = [
            {
                "player_id": p.player_id,
                "name": p.name,
                "total_score": p.total_score,
            }
            for p in sorted_players
        ]

        # Check for tie at top
        top_score = sorted_players[0].total_score
        tied_at_top = [p for p in sorted_players if p.total_score == top_score]

        if len(tied_at_top) > 1:
            return [
                {
                    "type": "slots_game_ended",
                    "final_standings": final_standings,
                    "pot": pot,
                    "buy_in": buy_in,
                    "is_tie": True,
                    "payout_type": "refund",
                    "winner_id": None,
                    "winner_payout": buy_in,  # each player gets their buy-in back
                    "house_cut": 0,
                    "state": self.get_room_state(room),
                }
            ]

        winner = sorted_players[0]
        winner_payout = math.floor(pot * (1 - HOUSE_EDGE))
        house_cut = pot - winner_payout

        return [
            {
                "type": "slots_game_ended",
                "final_standings": final_standings,
                "pot": pot,
                "buy_in": buy_in,
                "is_tie": False,
                "payout_type": "winner",
                "winner_id": winner.player_id,
                "winner_payout": winner_payout,
                "house_cut": house_cut,
                "state": self.get_room_state(room),
            }
        ]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/sia/Desktop/blackjack/server && python -m pytest test_slots_engine.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/sia/Desktop/blackjack && git add server/slots_engine.py server/test_slots_engine.py
git commit -m "feat(slots): add advance_round and end_game to SlotsEngine"
```

---

### Task 5: SlotsEngine — return_to_lobby and get_room_state (reconnection)

**Files:**
- Modify: `server/slots_engine.py`
- Modify: `server/test_slots_engine.py`

- [ ] **Step 1: Write tests for return_to_lobby**

Append to `server/test_slots_engine.py`:

```python
class TestReturnToLobby(unittest.TestCase):
    def setUp(self):
        self.engine = SlotsEngine()

    @patch("slots_engine.generate_spin")
    def test_resets_to_lobby(self, mock_spin):
        room = make_slots_room(2, total_rounds=1, bet_per_round=100)
        self.engine.start_game(room)
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.engine.handle_spin(room, "p0")
        self.engine.handle_spin(room, "p1")
        # Now in final_result
        events = self.engine.return_to_lobby(room)
        self.assertEqual(room.phase, "lobby")
        self.assertEqual(room.current_round, 0)
        self.assertEqual(events[0]["type"], "slots_returned_to_lobby")

    @patch("slots_engine.generate_spin")
    def test_resets_player_scores(self, mock_spin):
        room = make_slots_room(2, total_rounds=1, bet_per_round=100)
        self.engine.start_game(room)
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.engine.handle_spin(room, "p0")
        self.engine.handle_spin(room, "p1")
        self.engine.return_to_lobby(room)
        for p in room.players.values():
            self.assertEqual(p.total_score, 0)
            self.assertFalse(p.has_spun)


class TestGetRoomState(unittest.TestCase):
    def setUp(self):
        self.engine = SlotsEngine()

    def test_lobby_state(self):
        room = make_slots_room(2)
        state = self.engine.get_room_state(room)
        self.assertEqual(state["phase"], "lobby")
        self.assertIn("p0", state["player_states"])
        self.assertIn("p1", state["player_states"])

    @patch("slots_engine.generate_spin")
    def test_spinning_state_includes_spin_data(self, mock_spin):
        room = make_slots_room(2, total_rounds=3, bet_per_round=100)
        self.engine.start_game(room)
        mock_spin.return_value = [CHERRY, CHERRY, CHERRY]
        self.engine.handle_spin(room, "p0")
        state = self.engine.get_room_state(room)
        self.assertTrue(state["player_states"]["p0"]["has_spun"])
        self.assertFalse(state["player_states"]["p1"]["has_spun"])
        self.assertEqual(state["current_round"], 1)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/sia/Desktop/blackjack/server && python -m pytest test_slots_engine.py::TestReturnToLobby -v && python -m pytest test_slots_engine.py::TestGetRoomState -v`
Expected: FAIL — `return_to_lobby` not defined

- [ ] **Step 3: Implement return_to_lobby**

Add to `SlotsEngine` class in `server/slots_engine.py`:

```python
    def return_to_lobby(self, room: SlotsRoom) -> list[dict]:
        """Reset all game state and return to lobby for rematch."""
        room.phase = "lobby"
        room.current_round = 0

        for player in room.players.values():
            player.total_score = 0
            reset_slots_round_state(player)

        return [
            {
                "type": "slots_returned_to_lobby",
                "state": self.get_room_state(room),
            }
        ]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/sia/Desktop/blackjack/server && python -m pytest test_slots_engine.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/sia/Desktop/blackjack && git add server/slots_engine.py server/test_slots_engine.py
git commit -m "feat(slots): add return_to_lobby and complete get_room_state"
```

---

### Task 6: WebSocket Handlers — create, join, configure, start

**Files:**
- Modify: `server/main.py`

This task adds the first four slots WebSocket handlers and the supporting infrastructure (player_game_types tracker, slots broadcast helper, slots engine instance).

- [ ] **Step 1: Add imports and infrastructure to main.py**

At the top of `server/main.py`, after the existing imports, add:

```python
from slots_engine import SlotsEngine
from slots_room import (
    SLOTS_MIN_PLAYERS,
    add_player_to_slots_room,
    create_slots_room,
    get_slots_player_list,
    get_slots_room,
    remove_player_from_slots_room,
    slots_rooms,
)
```

After `engine = GameEngine()`, add:

```python
slots_engine = SlotsEngine()

# Track which game type each player is in: player_id -> "blackjack" | "slots"
player_game_types: dict[str, str] = {}
```

After `ROOM_CREATE_COOLDOWN_SECONDS`, add:

```python
# Slots AFK spin timer: room_code -> asyncio.Task
slots_spin_timers: dict[str, asyncio.Task] = {}
SLOTS_SPIN_TIMEOUT = 10  # seconds

# Slots round advancement delay
SLOTS_ROUND_ADVANCE_DELAY = 3  # seconds
```

- [ ] **Step 2: Add slots broadcast helper**

Add after the `manager` and `engine` declarations:

```python
async def _slots_broadcast(room_code: str, message: dict, exclude: str | None = None):
    """Broadcast a message to all connected players in a slots room."""
    room = get_slots_room(room_code)
    if not room:
        return
    msg_text = json.dumps(message)
    for pid, player in room.players.items():
        if pid == exclude or not player.connected:
            continue
        ws = manager.connections.get(pid)
        if ws:
            try:
                await ws.send_text(msg_text)
            except Exception as e:
                logger.warning("Failed to broadcast slots to player %s: %s", pid, e)
```

- [ ] **Step 3: Add handle_create_slots_room handler**

```python
async def handle_create_slots_room(player_id: str, message: dict):
    if len(slots_rooms) >= MAX_ROOMS:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Server is full. Try again later."}
        )
        return

    now = time.monotonic()
    if now - room_create_cooldowns.get(player_id, 0) < ROOM_CREATE_COOLDOWN_SECONDS:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Please wait before creating another room."}
        )
        return
    room_create_cooldowns[player_id] = now

    if player_id in manager.player_rooms:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are already in a room. Leave first."}
        )
        return

    try:
        name = validate_player_name(message.get("player_name"))
    except ValueError as e:
        await manager.send_to_player(player_id, {"type": "error", "message": str(e)})
        return

    room = create_slots_room(name, player_id)
    manager.player_rooms[player_id] = room.code
    player_game_types[player_id] = "slots"

    logger.info(f"Slots room {room.code} created by {name} ({player_id})")

    await manager.send_to_player(
        player_id,
        {
            "type": "slots_room_created",
            "code": room.code,
            "player_id": player_id,
            "session_token": room.players[player_id].session_token,
            "players": get_slots_player_list(room),
        },
    )
```

- [ ] **Step 4: Add handle_join_slots_room handler**

```python
async def handle_join_slots_room(player_id: str, message: dict):
    if player_id in manager.player_rooms:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are already in a room. Leave first."}
        )
        return

    try:
        name = validate_player_name(message.get("player_name"))
    except ValueError as e:
        await manager.send_to_player(player_id, {"type": "error", "message": str(e)})
        return

    code = message.get("code", "").strip().upper()
    if not code:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Room code is required"}
        )
        return

    room = get_slots_room(code)
    if not room:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Room not found"}
        )
        return

    try:
        add_player_to_slots_room(room, name, player_id)
    except ValueError as e:
        await manager.send_to_player(player_id, {"type": "error", "message": str(e)})
        return

    manager.player_rooms[player_id] = room.code
    player_game_types[player_id] = "slots"

    logger.info(f"{name} ({player_id}) joined slots room {room.code}")

    player_list = get_slots_player_list(room)

    await manager.send_to_player(
        player_id,
        {
            "type": "slots_player_joined",
            "player_name": name,
            "player_id": player_id,
            "session_token": room.players[player_id].session_token,
            "code": room.code,
            "players": player_list,
        },
    )

    await _slots_broadcast(
        room.code,
        {
            "type": "slots_player_joined",
            "player_name": name,
            "player_id": player_id,
            "players": player_list,
        },
        exclude=player_id,
    )
```

- [ ] **Step 5: Add handle_configure_slots handler**

```python
async def handle_configure_slots(player_id: str, message: dict):
    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are not in a room"}
        )
        return

    room = get_slots_room(room_code)
    if not room:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Room not found"}
        )
        return

    if room.host_id != player_id:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Only the host can configure the game"}
        )
        return

    if room.phase != "lobby":
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Cannot configure during game"}
        )
        return

    from slots_constants import ROUND_OPTIONS

    total_rounds = message.get("total_rounds")
    if total_rounds is not None:
        if total_rounds not in ROUND_OPTIONS:
            await manager.send_to_player(
                player_id, {"type": "error", "message": f"Rounds must be one of {ROUND_OPTIONS}"}
            )
            return
        room.total_rounds = total_rounds

    bet_per_round = message.get("bet_per_round")
    if bet_per_round is not None:
        if not isinstance(bet_per_round, int) or bet_per_round <= 0:
            await manager.send_to_player(
                player_id, {"type": "error", "message": "Invalid bet amount"}
            )
            return
        room.bet_per_round = bet_per_round

    await _slots_broadcast(
        room.code,
        {
            "type": "slots_configured",
            "total_rounds": room.total_rounds,
            "bet_per_round": room.bet_per_round,
        },
    )
```

- [ ] **Step 6: Add handle_start_slots handler**

```python
async def handle_start_slots(player_id: str):
    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are not in a room"}
        )
        return

    room = get_slots_room(room_code)
    if not room:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Room not found"}
        )
        return

    if room.host_id != player_id:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Only the host can start the game"}
        )
        return

    async with room._lock:
        try:
            events = slots_engine.start_game(room)
        except ValueError as e:
            await manager.send_to_player(player_id, {"type": "error", "message": str(e)})
            return

        logger.info(f"Slots game started in room {room_code}")

        for event in events:
            await _slots_broadcast(room_code, event)

        _start_slots_spin_timer(room_code)
```

- [ ] **Step 7: Commit**

```bash
cd /Users/sia/Desktop/blackjack && git add server/main.py
git commit -m "feat(slots): add create/join/configure/start WebSocket handlers"
```

---

### Task 7: WebSocket Handlers — spin, leave, play_again + AFK timer

**Files:**
- Modify: `server/main.py`

- [ ] **Step 1: Add AFK spin timer functions**

```python
def _cancel_slots_spin_timer(room_code: str):
    """Cancel any active slots spin timer for this room."""
    task = slots_spin_timers.pop(room_code, None)
    if task and not task.done():
        task.cancel()


def _start_slots_spin_timer(room_code: str):
    """Start a timer that auto-spins AFK players after SLOTS_SPIN_TIMEOUT."""
    _cancel_slots_spin_timer(room_code)

    async def _auto_spin_afk():
        await asyncio.sleep(SLOTS_SPIN_TIMEOUT)
        room = get_slots_room(room_code)
        if not room:
            return
        async with room._lock:
            if room.phase != "spinning":
                return

            # Auto-spin all connected players who haven't spun
            all_events = []
            for pid, player in room.players.items():
                if player.connected and not player.has_spun:
                    logger.info(f"Auto-spinning AFK player {pid} in slots room {room_code}")
                    events = slots_engine.auto_spin(room, pid)
                    all_events.extend(events)

            for event in all_events:
                await _slots_broadcast(room_code, event)

            # If round was resolved, schedule advancement
            if room.phase == "round_result":
                _schedule_slots_round_advance(room_code)

    slots_spin_timers[room_code] = asyncio.create_task(_auto_spin_afk())
```

- [ ] **Step 2: Add round advancement scheduler**

```python
def _schedule_slots_round_advance(room_code: str):
    """Schedule round advancement after a delay so clients can display results."""
    async def _advance():
        await asyncio.sleep(SLOTS_ROUND_ADVANCE_DELAY)
        room = get_slots_room(room_code)
        if not room:
            return
        async with room._lock:
            if room.phase != "round_result":
                return
            events = slots_engine.advance_round(room)
            for event in events:
                await _slots_broadcast(room_code, event)
            _start_slots_spin_timer(room_code)

    asyncio.create_task(_advance())
```

- [ ] **Step 3: Add handle_slots_spin handler**

```python
async def handle_slots_spin(player_id: str):
    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are not in a room"}
        )
        return

    room = get_slots_room(room_code)
    if not room:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Room not found"}
        )
        return

    async with room._lock:
        try:
            events = slots_engine.handle_spin(room, player_id)
        except ValueError as e:
            await manager.send_to_player(player_id, {"type": "error", "message": str(e)})
            return

        for event in events:
            await _slots_broadcast(room_code, event)

        # If round resolved, cancel spin timer and schedule advancement
        if room.phase == "round_result":
            _cancel_slots_spin_timer(room_code)
            if room.current_round < room.total_rounds:
                _schedule_slots_round_advance(room_code)
        elif room.phase == "final_result":
            _cancel_slots_spin_timer(room_code)
```

- [ ] **Step 4: Add handle_leave_slots handler**

```python
async def handle_leave_slots(player_id: str):
    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        await manager.send_to_player(player_id, {"type": "left_room"})
        return

    room = get_slots_room(room_code)
    if not room:
        manager.player_rooms.pop(player_id, None)
        player_game_types.pop(player_id, None)
        await manager.send_to_player(player_id, {"type": "left_room"})
        return

    async with room._lock:
        player_name = room.players[player_id].name if player_id in room.players else "Unknown"

        # If mid-game and this player hasn't spun, auto-spin them before removing
        if room.phase == "spinning" and player_id in room.players:
            player = room.players[player_id]
            if not player.has_spun:
                player.connected = False
                # Check if all remaining connected players have spun
                connected = [p for p in room.players.values() if p.connected]
                if connected and all(p.has_spun for p in connected):
                    resolve_events = slots_engine.resolve_round(room)
                    for event in resolve_events:
                        await _slots_broadcast(room_code, event)
                    if room.phase == "round_result":
                        _cancel_slots_spin_timer(room_code)
                        _schedule_slots_round_advance(room_code)

        new_host_id = remove_player_from_slots_room(room, player_id)
        manager.player_rooms.pop(player_id, None)
        player_game_types.pop(player_id, None)
        manager.cancel_disconnect_task(player_id)

        logger.info(f"{player_name} ({player_id}) left slots room {room_code}")

        await manager.send_to_player(player_id, {"type": "left_room"})

        remaining_room = get_slots_room(room_code)
        if remaining_room:
            new_host_name = None
            if new_host_id and new_host_id in remaining_room.players:
                new_host_name = remaining_room.players[new_host_id].name

            await _slots_broadcast(
                room_code,
                {
                    "type": "slots_player_left",
                    "player_name": player_name,
                    "players": get_slots_player_list(remaining_room),
                    "new_host": new_host_name,
                },
            )

            # If fewer than 2 connected players remain mid-game, return to lobby
            connected = [p for p in remaining_room.players.values() if p.connected]
            if remaining_room.phase != "lobby" and len(connected) < SLOTS_MIN_PLAYERS:
                _cancel_slots_spin_timer(room_code)
                events = slots_engine.return_to_lobby(remaining_room)
                for event in events:
                    await _slots_broadcast(room_code, event)
        else:
            _cancel_slots_spin_timer(room_code)
```

- [ ] **Step 5: Add handle_slots_play_again handler**

```python
async def handle_slots_play_again(player_id: str):
    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are not in a room"}
        )
        return

    room = get_slots_room(room_code)
    if not room:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Room not found"}
        )
        return

    if room.host_id != player_id:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Only the host can start a new game"}
        )
        return

    if room.phase != "final_result":
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Game is not finished"}
        )
        return

    async with room._lock:
        events = slots_engine.return_to_lobby(room)
        for event in events:
            await _slots_broadcast(room_code, event)
```

- [ ] **Step 6: Commit**

```bash
cd /Users/sia/Desktop/blackjack && git add server/main.py
git commit -m "feat(slots): add spin/leave/play_again handlers with AFK timer"
```

---

### Task 8: Message Dispatch + Leave/Disconnect Routing

**Files:**
- Modify: `server/main.py`

This task wires the handlers into `handle_message()` and updates `handle_leave`/`handle_disconnect` to route based on `player_game_types`.

- [ ] **Step 1: Add slots message types to handle_message dispatch**

In `handle_message()`, before the final `else` clause, add these branches:

```python
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
```

- [ ] **Step 2: Update handle_leave to route based on game type**

In the existing `handle_leave()` function, add game-type routing at the top:

```python
async def handle_leave(player_id: str):
    # Route to correct game's leave handler
    game_type = player_game_types.get(player_id)
    if game_type == "slots":
        await handle_leave_slots(player_id)
        return

    # ... existing blackjack leave logic unchanged ...
```

- [ ] **Step 3: Update handle_disconnect to handle slots players**

In the existing `handle_disconnect()` function, after the room lookup fails (room not found), add a check for slots rooms. Inside the disconnect handler, add routing:

```python
    # After existing room check, also check slots rooms
    game_type = player_game_types.get(player_id)
    if game_type == "slots":
        # Handle slots disconnect
        slots_room = get_slots_room(manager.player_rooms.get(player_id, ""))
        if not slots_room or player_id not in slots_room.players:
            manager.player_rooms.pop(player_id, None)
            manager.disconnect(player_id)
            player_game_types.pop(player_id, None)
            return

        async with slots_room._lock:
            player = slots_room.players[player_id]
            player.connected = False
            player.disconnected_at = datetime.now(timezone.utc)
            manager.disconnect(player_id)
            player_game_types.pop(player_id, None)

            logger.info(f"{player.name} ({player_id}) disconnected from slots room {slots_room.code}")

            await _slots_broadcast(
                slots_room.code,
                {
                    "type": "slots_player_disconnected",
                    "player_name": player.name,
                    "players": get_slots_player_list(slots_room),
                },
            )

            # If spinning and all remaining connected have spun, resolve
            if slots_room.phase == "spinning":
                connected = [p for p in slots_room.players.values() if p.connected]
                if connected and all(p.has_spun for p in connected):
                    resolve_events = slots_engine.resolve_round(slots_room)
                    for event in resolve_events:
                        await _slots_broadcast(slots_room.code, event)
                    if slots_room.phase == "round_result":
                        _cancel_slots_spin_timer(slots_room.code)
                        _schedule_slots_round_advance(slots_room.code)

            # If fewer than 2 connected remain mid-game, return to lobby
            connected = [p for p in slots_room.players.values() if p.connected]
            if slots_room.phase not in ("lobby", "final_result") and len(connected) < SLOTS_MIN_PLAYERS:
                _cancel_slots_spin_timer(slots_room.code)
                events = slots_engine.return_to_lobby(slots_room)
                for event in events:
                    await _slots_broadcast(slots_room.code, event)

        # Schedule auto-leave after grace period
        async def auto_leave_slots():
            await asyncio.sleep(DISCONNECT_GRACE_PERIOD)
            r = get_slots_room(slots_room.code)
            if r and player_id in r.players and not r.players[player_id].connected:
                logger.info(f"{player.name} ({player_id}) grace period expired, removing from slots room")
                await handle_leave_slots(player_id)

        manager.cancel_disconnect_task(player_id)
        manager.disconnect_tasks[player_id] = asyncio.create_task(auto_leave_slots())
        return
```

- [ ] **Step 4: Track game type in existing blackjack handlers**

In `handle_create_room()`, after `manager.player_rooms[player_id] = room.code`, add:

```python
    player_game_types[player_id] = "blackjack"
```

In `handle_join_room()`, after `manager.player_rooms[player_id] = room.code`, add:

```python
    player_game_types[player_id] = "blackjack"
```

In the existing `handle_leave()` function's cleanup section, after `manager.player_rooms.pop(player_id, None)`, add:

```python
    player_game_types.pop(player_id, None)
```

In the existing `handle_disconnect()` cleanup sections, add `player_game_types.pop(player_id, None)` alongside the other cleanup calls.

- [ ] **Step 5: Update health endpoint to include slots rooms**

```python
@app.get("/health")
async def health():
    return {"status": "ok", "rooms": len(rooms), "slots_rooms": len(slots_rooms)}
```

- [ ] **Step 6: Run all existing tests to verify no regressions**

Run: `cd /Users/sia/Desktop/blackjack/server && python -m pytest test_game.py test_slots.py test_slots_room.py test_slots_engine.py -v`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/sia/Desktop/blackjack && git add server/main.py
git commit -m "feat(slots): wire slots handlers into message dispatch with game-type routing"
```

---

### Task 9: Integration Tests for Slots WebSocket Flow

**Files:**
- Create: `server/test_slots_ws.py`

- [ ] **Step 1: Write WebSocket integration tests**

```python
# server/test_slots_ws.py
"""WebSocket integration tests for multiplayer slots."""

import asyncio
import json
import unittest

from fastapi.testclient import TestClient

from main import app


class TestSlotsWebSocket(unittest.TestCase):
    """Integration tests for the slots WebSocket flow."""

    def _create_client(self):
        return TestClient(app)

    def test_create_slots_room(self):
        client = self._create_client()
        with client.websocket_connect("/ws") as ws:
            ws.send_text(json.dumps({
                "type": "create_slots_room",
                "player_name": "Alice",
            }))
            data = json.loads(ws.receive_text())
            self.assertEqual(data["type"], "slots_room_created")
            self.assertIn("code", data)
            self.assertIn("session_token", data)
            self.assertIn("players", data)

    def test_join_slots_room(self):
        client = self._create_client()
        with client.websocket_connect("/ws") as ws1:
            ws1.send_text(json.dumps({
                "type": "create_slots_room",
                "player_name": "Alice",
            }))
            create_data = json.loads(ws1.receive_text())
            code = create_data["code"]

            with client.websocket_connect("/ws") as ws2:
                ws2.send_text(json.dumps({
                    "type": "join_slots_room",
                    "player_name": "Bob",
                    "code": code,
                }))
                join_data = json.loads(ws2.receive_text())
                self.assertEqual(join_data["type"], "slots_player_joined")
                self.assertEqual(len(join_data["players"]), 2)

                # Alice should also get the join notification
                alice_data = json.loads(ws1.receive_text())
                self.assertEqual(alice_data["type"], "slots_player_joined")

    def test_configure_slots(self):
        client = self._create_client()
        with client.websocket_connect("/ws") as ws:
            ws.send_text(json.dumps({
                "type": "create_slots_room",
                "player_name": "Alice",
            }))
            json.loads(ws.receive_text())  # room_created

            ws.send_text(json.dumps({
                "type": "configure_slots",
                "total_rounds": 15,
                "bet_per_round": 500,
            }))
            data = json.loads(ws.receive_text())
            self.assertEqual(data["type"], "slots_configured")
            self.assertEqual(data["total_rounds"], 15)
            self.assertEqual(data["bet_per_round"], 500)

    def test_full_game_flow(self):
        """Test: create room → join → start → both spin → round resolves."""
        client = self._create_client()
        with client.websocket_connect("/ws") as ws1:
            ws1.send_text(json.dumps({
                "type": "create_slots_room",
                "player_name": "Alice",
            }))
            create_data = json.loads(ws1.receive_text())
            code = create_data["code"]

            with client.websocket_connect("/ws") as ws2:
                ws2.send_text(json.dumps({
                    "type": "join_slots_room",
                    "player_name": "Bob",
                    "code": code,
                }))
                json.loads(ws2.receive_text())  # join for Bob
                json.loads(ws1.receive_text())  # join notification for Alice

                # Configure 1 round for quick test
                ws1.send_text(json.dumps({
                    "type": "configure_slots",
                    "total_rounds": 1,
                    "bet_per_round": 100,
                }))
                json.loads(ws1.receive_text())  # configured for Alice
                json.loads(ws2.receive_text())  # configured for Bob

                # Start game
                ws1.send_text(json.dumps({"type": "start_slots"}))
                game_started_1 = json.loads(ws1.receive_text())
                game_started_2 = json.loads(ws2.receive_text())
                self.assertEqual(game_started_1["type"], "slots_game_started")
                self.assertEqual(game_started_2["type"], "slots_game_started")

                # Both spin
                ws1.send_text(json.dumps({"type": "slots_spin"}))
                # Alice gets her spin result
                spin1 = json.loads(ws1.receive_text())
                self.assertEqual(spin1["type"], "slots_spin_result")
                # Bob also gets Alice's spin result
                spin1_bob = json.loads(ws2.receive_text())
                self.assertEqual(spin1_bob["type"], "slots_spin_result")

                ws2.send_text(json.dumps({"type": "slots_spin"}))
                # Both should get Bob's spin result + round result + game ended
                # (since total_rounds=1)
                messages_alice = []
                messages_bob = []
                # Collect remaining messages
                for _ in range(3):  # spin_result + round_result + game_ended
                    try:
                        messages_alice.append(json.loads(ws1.receive_text()))
                    except Exception:
                        break
                for _ in range(3):
                    try:
                        messages_bob.append(json.loads(ws2.receive_text()))
                    except Exception:
                        break

                alice_types = [m["type"] for m in messages_alice]
                self.assertIn("slots_spin_result", alice_types)
                self.assertIn("slots_round_result", alice_types)
                self.assertIn("slots_game_ended", alice_types)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the integration tests**

Run: `cd /Users/sia/Desktop/blackjack/server && python -m pytest test_slots_ws.py -v`
Expected: ALL PASS

If any test fails, debug and fix the handlers.

- [ ] **Step 3: Run the full test suite to verify no regressions**

Run: `cd /Users/sia/Desktop/blackjack/server && python -m pytest -v`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/sia/Desktop/blackjack && git add server/test_slots_ws.py
git commit -m "test(slots): add WebSocket integration tests for PvP slots flow"
```

---

### Task 10: Slots Room Cleanup + Final Verification

**Files:**
- Modify: `server/main.py`

- [ ] **Step 1: Add slots room cleanup to the cleanup loop**

In `room_cleanup_loop()`, add slots room cleanup:

```python
async def room_cleanup_loop():
    """Periodically prune rooms where all players disconnected > 5 min ago."""
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL)
        removed = cleanup_empty_rooms(max_age_seconds=300)
        if removed > 0:
            logger.info(f"Cleaned up {removed} empty room(s). Active rooms: {len(rooms)}")

        # Clean up empty slots rooms
        slots_to_remove = []
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        for code, room in slots_rooms.items():
            if not room.players:
                if (now - room.created_at).total_seconds() > 300:
                    slots_to_remove.append(code)
                continue
            all_disconnected = all(not p.connected for p in room.players.values())
            if not all_disconnected:
                continue
            disconnect_times = [
                p.disconnected_at for p in room.players.values()
                if p.disconnected_at is not None
            ]
            if not disconnect_times:
                continue
            if (now - max(disconnect_times)).total_seconds() > 300:
                slots_to_remove.append(code)

        for code in slots_to_remove:
            _cancel_slots_spin_timer(code)
            del slots_rooms[code]
        if slots_to_remove:
            logger.info(f"Cleaned up {len(slots_to_remove)} empty slots room(s). Active: {len(slots_rooms)}")
```

- [ ] **Step 2: Run the full test suite**

Run: `cd /Users/sia/Desktop/blackjack/server && python -m pytest -v`
Expected: ALL PASS

- [ ] **Step 3: Verify the server starts cleanly**

Run: `cd /Users/sia/Desktop/blackjack/server && timeout 5 python -c "from main import app; print('Server imports OK')" || true`
Expected: "Server imports OK" (no import errors)

- [ ] **Step 4: Commit**

```bash
cd /Users/sia/Desktop/blackjack && git add server/main.py
git commit -m "feat(slots): add slots room cleanup to background loop"
```
