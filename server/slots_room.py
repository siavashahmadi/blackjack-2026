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
