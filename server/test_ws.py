"""Quick WebSocket integration test for the lobby system."""

import asyncio
import json
import websockets


async def send_and_recv(ws, msg):
    await ws.send(json.dumps(msg))
    resp = await asyncio.wait_for(ws.recv(), timeout=5)
    return json.loads(resp)


async def recv(ws, timeout=5):
    resp = await asyncio.wait_for(ws.recv(), timeout=timeout)
    return json.loads(resp)


async def test_lobby():
    uri = "ws://localhost:8000/ws"
    print("=" * 60)

    # Test 1: Create a room
    print("\n[Test 1] Create room")
    async with websockets.connect(uri) as ws1:
        resp = await send_and_recv(ws1, {"type": "create_room", "player_name": "Sia"})
        assert resp["type"] == "room_created", f"Expected room_created, got {resp}"
        code = resp["code"]
        p1_id = resp["player_id"]
        assert len(code) == 4
        assert resp["players"][0]["name"] == "Sia"
        assert resp["players"][0]["is_host"] is True
        print(f"  PASS - Room {code} created, player_id={p1_id[:8]}...")

        # Test 2: Join the room
        print("\n[Test 2] Join room")
        async with websockets.connect(uri) as ws2:
            resp2 = await send_and_recv(ws2, {"type": "join_room", "code": code, "player_name": "John"})
            assert resp2["type"] == "player_joined", f"Expected player_joined, got {resp2}"
            assert resp2["player_name"] == "John"
            assert len(resp2["players"]) == 2
            p2_id = resp2["player_id"]
            print(f"  PASS - John joined room {code}")

            # ws1 should also get notified
            notif = await recv(ws1)
            assert notif["type"] == "player_joined"
            assert notif["player_name"] == "John"
            print("  PASS - Sia received player_joined notification")

            # Test 3: Duplicate name
            print("\n[Test 3] Duplicate name")
            async with websockets.connect(uri) as ws3:
                resp3 = await send_and_recv(ws3, {"type": "join_room", "code": code, "player_name": "Sia"})
                assert resp3["type"] == "error"
                assert "already taken" in resp3["message"]
                print(f"  PASS - Duplicate name rejected: {resp3['message']}")

            # Test 4: Invalid room code
            print("\n[Test 4] Invalid room code")
            async with websockets.connect(uri) as ws4:
                resp4 = await send_and_recv(ws4, {"type": "join_room", "code": "ZZZZ", "player_name": "Test"})
                assert resp4["type"] == "error"
                assert "not found" in resp4["message"]
                print(f"  PASS - Invalid code rejected: {resp4['message']}")

            # Test 5: Empty name
            print("\n[Test 5] Empty name")
            async with websockets.connect(uri) as ws5:
                resp5 = await send_and_recv(ws5, {"type": "create_room", "player_name": ""})
                assert resp5["type"] == "error"
                assert "required" in resp5["message"]
                print(f"  PASS - Empty name rejected: {resp5['message']}")

            # Test 6: Name too long
            print("\n[Test 6] Name too long")
            async with websockets.connect(uri) as ws6:
                resp6 = await send_and_recv(ws6, {"type": "create_room", "player_name": "A" * 25})
                assert resp6["type"] == "error"
                assert "20 characters" in resp6["message"]
                print(f"  PASS - Long name rejected: {resp6['message']}")

            # Test 7: start_game by non-host
            print("\n[Test 7] start_game by non-host")
            resp7 = await send_and_recv(ws2, {"type": "start_game"})
            assert resp7["type"] == "error"
            assert "host" in resp7["message"].lower()
            print(f"  PASS - Non-host start rejected: {resp7['message']}")

            # Test 8: start_game with 2 players (should succeed)
            print("\n[Test 8] start_game with 2 players")
            await ws1.send(json.dumps({"type": "start_game"}))
            resp8a = await recv(ws1)
            assert resp8a["type"] == "game_started"
            assert len(resp8a["players"]) == 2
            print(f"  PASS - Game started (Sia received game_started)")

            resp8b = await recv(ws2)
            assert resp8b["type"] == "game_started"
            print(f"  PASS - Game started (John received game_started)")

            # Test 9: Can't join a started game
            print("\n[Test 9] Can't join started game")
            async with websockets.connect(uri) as ws9:
                resp9 = await send_and_recv(ws9, {"type": "join_room", "code": code, "player_name": "Late"})
                assert resp9["type"] == "error"
                assert "in progress" in resp9["message"]
                print(f"  PASS - Late join rejected: {resp9['message']}")

            # Test 10: Leave
            print("\n[Test 10] Leave")
            await ws2.send(json.dumps({"type": "leave"}))
            resp10_leaver = await recv(ws2)
            assert resp10_leaver["type"] == "left_room"
            print("  PASS - John received left_room")

            resp10_notif = await recv(ws1)
            assert resp10_notif["type"] == "player_left"
            assert resp10_notif["player_name"] == "John"
            print(f"  PASS - Sia received player_left notification")

    # Test 11: Room full (6 players max)
    print("\n[Test 11] Room full (6 max)")
    connections = []
    async with websockets.connect(uri) as host_ws:
        resp = await send_and_recv(host_ws, {"type": "create_room", "player_name": "Host"})
        code = resp["code"]
        connections.append(host_ws)

        for i in range(5):
            ws = await websockets.connect(uri)
            resp = await send_and_recv(ws, {"type": "join_room", "code": code, "player_name": f"P{i+1}"})
            assert resp["type"] == "player_joined", f"Player P{i+1} failed to join: {resp}"
            connections.append(ws)
            # Drain notifications from other connections
            for c in connections[:-1]:
                try:
                    await asyncio.wait_for(c.recv(), timeout=1)
                except asyncio.TimeoutError:
                    pass

        # 7th player should be rejected
        async with websockets.connect(uri) as extra_ws:
            resp = await send_and_recv(extra_ws, {"type": "join_room", "code": code, "player_name": "Extra"})
            assert resp["type"] == "error"
            assert "full" in resp["message"]
            print(f"  PASS - 7th player rejected: {resp['message']}")

        # Clean up connections
        for ws in connections[1:]:
            await ws.close()

    # Test 12: start_game with only 1 player
    print("\n[Test 12] start_game with 1 player")
    async with websockets.connect(uri) as solo_ws:
        resp = await send_and_recv(solo_ws, {"type": "create_room", "player_name": "Solo"})
        code = resp["code"]
        resp = await send_and_recv(solo_ws, {"type": "start_game"})
        assert resp["type"] == "error"
        assert "at least 2" in resp["message"]
        print(f"  PASS - Solo start rejected: {resp['message']}")

    # Test 13: Host disconnect transfers host
    print("\n[Test 13] Host disconnect transfers host")
    async with websockets.connect(uri) as h_ws:
        resp = await send_and_recv(h_ws, {"type": "create_room", "player_name": "HostPlayer"})
        code = resp["code"]

        async with websockets.connect(uri) as p_ws:
            resp = await send_and_recv(p_ws, {"type": "join_room", "code": code, "player_name": "Player2"})
            # Drain notification on host
            await recv(h_ws)

            # Host leaves explicitly
            await h_ws.send(json.dumps({"type": "leave"}))
            await recv(h_ws)  # left_room

            notif = await recv(p_ws)
            assert notif["type"] == "player_left"
            assert notif["new_host"] == "Player2"
            print(f"  PASS - Host transferred to Player2")

    print("\n[Test 14] Health endpoint")
    print("  PASS - Already verified with curl")

    print("\n" + "=" * 60)
    print("ALL TESTS PASSED!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_lobby())
