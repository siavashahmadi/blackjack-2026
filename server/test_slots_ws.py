"""WebSocket integration tests for multiplayer slots."""

import json
import time
import unittest

from fastapi.testclient import TestClient

from main import app
from slots_room import slots_rooms

# Server enforces a 0.2s rate limit per player. Tests must wait between
# consecutive sends from the same player to avoid "Too fast" errors.
_RATE = 0.25


class TestSlotsWebSocket(unittest.TestCase):
    """Integration tests for the slots WebSocket flow."""

    def setUp(self):
        slots_rooms.clear()

    def tearDown(self):
        slots_rooms.clear()

    # ------------------------------------------------------------------
    # Room creation
    # ------------------------------------------------------------------

    def test_create_slots_room(self):
        client = TestClient(app)
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
            self.assertEqual(len(data["players"]), 1)

    def test_room_code_is_four_chars(self):
        client = TestClient(app)
        with client.websocket_connect("/ws") as ws:
            ws.send_text(json.dumps({
                "type": "create_slots_room",
                "player_name": "Alice",
            }))
            data = json.loads(ws.receive_text())
            self.assertEqual(len(data["code"]), 4)

    # ------------------------------------------------------------------
    # Joining
    # ------------------------------------------------------------------

    def test_join_slots_room(self):
        client = TestClient(app)
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

    def test_join_nonexistent_room(self):
        client = TestClient(app)
        with client.websocket_connect("/ws") as ws:
            ws.send_text(json.dumps({
                "type": "join_slots_room",
                "player_name": "Bob",
                "code": "ZZZZ",
            }))
            data = json.loads(ws.receive_text())
            self.assertEqual(data["type"], "error")

    # ------------------------------------------------------------------
    # Configuration
    # ------------------------------------------------------------------

    def test_configure_slots(self):
        client = TestClient(app)
        with client.websocket_connect("/ws") as ws:
            ws.send_text(json.dumps({
                "type": "create_slots_room",
                "player_name": "Alice",
            }))
            json.loads(ws.receive_text())  # room_created

            time.sleep(_RATE)
            ws.send_text(json.dumps({
                "type": "configure_slots",
                "total_rounds": 15,
                "bet_per_round": 500,
            }))
            data = json.loads(ws.receive_text())
            self.assertEqual(data["type"], "slots_configured")
            self.assertEqual(data["total_rounds"], 15)
            self.assertEqual(data["bet_per_round"], 500)

    def test_configure_invalid_rounds(self):
        """total_rounds must be one of [5, 10, 15]."""
        client = TestClient(app)
        with client.websocket_connect("/ws") as ws:
            ws.send_text(json.dumps({
                "type": "create_slots_room",
                "player_name": "Alice",
            }))
            json.loads(ws.receive_text())  # room_created

            time.sleep(_RATE)
            ws.send_text(json.dumps({
                "type": "configure_slots",
                "total_rounds": 99,
            }))
            data = json.loads(ws.receive_text())
            self.assertEqual(data["type"], "error")

    def test_configure_broadcasts_to_all_players(self):
        """configure_slots should broadcast to all players including non-host."""
        client = TestClient(app)
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

                time.sleep(_RATE)
                ws1.send_text(json.dumps({
                    "type": "configure_slots",
                    "total_rounds": 10,
                    "bet_per_round": 500,
                }))
                alice_cfg = json.loads(ws1.receive_text())
                self.assertEqual(alice_cfg["type"], "slots_configured")
                bob_cfg = json.loads(ws2.receive_text())
                self.assertEqual(bob_cfg["type"], "slots_configured")
                self.assertEqual(bob_cfg["total_rounds"], 10)
                self.assertEqual(bob_cfg["bet_per_round"], 500)

    # ------------------------------------------------------------------
    # Starting the game
    # ------------------------------------------------------------------

    def test_start_game_requires_two_players(self):
        client = TestClient(app)
        with client.websocket_connect("/ws") as ws:
            ws.send_text(json.dumps({
                "type": "create_slots_room",
                "player_name": "Alice",
            }))
            json.loads(ws.receive_text())  # room_created

            time.sleep(_RATE)
            ws.send_text(json.dumps({"type": "start_slots"}))
            data = json.loads(ws.receive_text())
            self.assertEqual(data["type"], "error")

    def test_non_host_cannot_start(self):
        client = TestClient(app)
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

                # Bob (non-host) tries to start — no need to sleep, Bob's first msg
                time.sleep(_RATE)
                ws2.send_text(json.dumps({"type": "start_slots"}))
                data = json.loads(ws2.receive_text())
                self.assertEqual(data["type"], "error")

    def test_start_game_broadcasts_to_all(self):
        """Both players should receive slots_game_started after host starts."""
        client = TestClient(app)
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

                time.sleep(_RATE)
                ws1.send_text(json.dumps({"type": "start_slots"}))
                game_started_1 = json.loads(ws1.receive_text())
                game_started_2 = json.loads(ws2.receive_text())
                self.assertEqual(game_started_1["type"], "slots_game_started")
                self.assertEqual(game_started_2["type"], "slots_game_started")
                self.assertIn("total_rounds", game_started_1)
                self.assertIn("current_round", game_started_1)

    # ------------------------------------------------------------------
    # Spinning
    # ------------------------------------------------------------------

    def test_spin_result_broadcast(self):
        """After a spin, both players receive slots_spin_result."""
        client = TestClient(app)
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

                time.sleep(_RATE)
                ws1.send_text(json.dumps({"type": "start_slots"}))
                json.loads(ws1.receive_text())  # game_started for Alice
                json.loads(ws2.receive_text())  # game_started for Bob

                time.sleep(_RATE)
                ws1.send_text(json.dumps({"type": "slots_spin"}))
                spin_alice = json.loads(ws1.receive_text())
                self.assertEqual(spin_alice["type"], "slots_spin_result")
                self.assertIn("reels", spin_alice)
                self.assertIn("score", spin_alice)
                self.assertIn("match_type", spin_alice)

                spin_bob = json.loads(ws2.receive_text())
                self.assertEqual(spin_bob["type"], "slots_spin_result")

    def test_cannot_spin_twice(self):
        """A player who already spun should get an error on second spin attempt."""
        client = TestClient(app)
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
                json.loads(ws2.receive_text())
                json.loads(ws1.receive_text())

                time.sleep(_RATE)
                ws1.send_text(json.dumps({"type": "start_slots"}))
                json.loads(ws1.receive_text())
                json.loads(ws2.receive_text())

                # Alice spins once — valid
                time.sleep(_RATE)
                ws1.send_text(json.dumps({"type": "slots_spin"}))
                json.loads(ws1.receive_text())  # Alice spin_result
                json.loads(ws2.receive_text())  # Bob sees it

                # Alice tries to spin again — should get error (already spun)
                time.sleep(_RATE)
                ws1.send_text(json.dumps({"type": "slots_spin"}))
                data = json.loads(ws1.receive_text())
                self.assertEqual(data["type"], "error")

    def test_round_result_after_all_spin(self):
        """After all players spin, both should receive slots_round_result."""
        client = TestClient(app)
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
                json.loads(ws2.receive_text())
                json.loads(ws1.receive_text())

                time.sleep(_RATE)
                ws1.send_text(json.dumps({"type": "start_slots"}))
                json.loads(ws1.receive_text())
                json.loads(ws2.receive_text())

                # Alice spins
                time.sleep(_RATE)
                ws1.send_text(json.dumps({"type": "slots_spin"}))
                json.loads(ws1.receive_text())  # Alice: spin_result
                json.loads(ws2.receive_text())  # Bob: sees Alice's spin

                # Bob spins — triggers round_result (10 rounds total, not last round)
                time.sleep(_RATE)
                ws2.send_text(json.dumps({"type": "slots_spin"}))
                bob_spin = json.loads(ws2.receive_text())
                self.assertEqual(bob_spin["type"], "slots_spin_result")

                alice_sees_bob = json.loads(ws1.receive_text())
                self.assertEqual(alice_sees_bob["type"], "slots_spin_result")

                # Both should now receive round_result
                round_result_alice = json.loads(ws1.receive_text())
                self.assertEqual(round_result_alice["type"], "slots_round_result")
                self.assertIn("standings", round_result_alice)

                round_result_bob = json.loads(ws2.receive_text())
                self.assertEqual(round_result_bob["type"], "slots_round_result")

    # ------------------------------------------------------------------
    # Leaving
    # ------------------------------------------------------------------

    def test_leave_slots_room(self):
        client = TestClient(app)
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

                # Bob leaves
                time.sleep(_RATE)
                ws2.send_text(json.dumps({"type": "leave_slots"}))
                left_data = json.loads(ws2.receive_text())
                self.assertEqual(left_data["type"], "left_room")

                # Alice gets player_left
                alice_data = json.loads(ws1.receive_text())
                self.assertEqual(alice_data["type"], "slots_player_left")
                self.assertEqual(len(alice_data["players"]), 1)

    def test_leave_via_generic_leave_message(self):
        """Sending 'leave' (not 'leave_slots') should also work for slots players."""
        client = TestClient(app)
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
                json.loads(ws2.receive_text())
                json.loads(ws1.receive_text())

                time.sleep(_RATE)
                ws2.send_text(json.dumps({"type": "leave"}))
                left_data = json.loads(ws2.receive_text())
                self.assertEqual(left_data["type"], "left_room")


if __name__ == "__main__":
    unittest.main()
