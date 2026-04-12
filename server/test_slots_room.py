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
        from game_room import rooms as bj_rooms
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
        self.assertEqual(p.total_score, 500)


if __name__ == "__main__":
    unittest.main()
