# server/test_slots_room.py
"""Unit tests for slots_room module."""

import asyncio
import unittest

from slots_room import (
    SlotsPlayerState,
    SlotsRoom,
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
