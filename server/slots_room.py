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
