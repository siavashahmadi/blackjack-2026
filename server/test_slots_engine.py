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
        types = [e["type"] for e in events]
        self.assertIn("slots_spin_result", types)
        self.assertIn("slots_round_result", types)

    @patch("slots_engine.generate_spin")
    def test_disconnected_player_skipped_for_auto_resolve(self, mock_spin):
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.room.players["p1"].connected = False
        events = self.engine.handle_spin(self.room, "p0")
        types = [e["type"] for e in events]
        self.assertIn("slots_round_result", types)
