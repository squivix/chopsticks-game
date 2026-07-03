#!/usr/bin/env python3
"""Example external CPU for the Chopsticks web app.

Run it as a separate process:

    python3 remote_cpu_server.py [port] [name]   # defaults: port 8765

Then in the web app set a player to "CPU: remote" and enter this port. Run two
copies on different ports (and names) to watch two engines play each other.

Protocol (POST /move, JSON):

    request : { "hands": [[l, r], [l, r]], "turn": 0|1, "names": [...],
                "rules": {...}, "moves": [ ...legal move objects... ] }
    response: { "move": <index into moves>, "name": "<engine name>" }

The browser sends the full list of legal moves, so a client only has to return
the *index* of the one it wants — it never needs its own copy of the rules
engine. The "name" is optional; the app shows it in game. Swap out
choose_move() to plug in a real engine, a search, or a bot.
"""

import json
import random
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

# How this engine introduces itself to the web app (overridable via argv[2]).
ENGINE_NAME = "GreedyBot"


def log(msg):
    """Timestamped line to stderr, tagged with the engine name."""
    ts = time.strftime("%H:%M:%S")
    sys.stderr.write(f"{ts} [{ENGINE_NAME}] {msg}\n")
    sys.stderr.flush()


def choose_move(state):
    """Pick a move index from the legal moves the browser sent.

    This demo prefers capturing the opponent's largest living hand, and
    otherwise plays a random legal move. Replace with anything smarter."""
    moves = state["moves"]
    if not moves:
        raise ValueError("no legal moves supplied")
    me = state["turn"]
    opp = 1 - me
    hands = state["hands"]

    attacks = [
        i for i, m in enumerate(moves)
        if m.get("kind") == "attack" and hands[opp][m["to"]["h"]] > 0
    ]
    if attacks:
        return max(attacks, key=lambda i: hands[opp][moves[i]["to"]["h"]])
    return random.randrange(len(moves))


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        # allow the browser (served from a different origin/port) to call us
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):  # CORS preflight
        self._send(204, {})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            state = json.loads(self.rfile.read(length) or "{}")
            turn = state.get("turn", 0)
            hands = state.get("hands", [[0, 0], [0, 0]])
            moves = state.get("moves", [])
            log(f"move request: turn=P{turn} me={hands[turn]} "
                f"opp={hands[1 - turn]} ({len(moves)} legal moves)")
            idx = choose_move(state)
            label = moves[idx].get("label", "?") if 0 <= idx < len(moves) else "?"
            log(f"  -> chose #{idx}: {label}")
            self._send(200, {"move": idx, "name": ENGINE_NAME})
        except Exception as e:  # noqa: BLE001 - report any failure to the client
            log(f"  !! error: {e}")
            self._send(400, {"error": str(e)})

    def log_message(self, fmt, *args):  # keep the console quiet
        pass


def main():
    global ENGINE_NAME
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    if len(sys.argv) > 2:
        ENGINE_NAME = sys.argv[2]
    server = HTTPServer(("127.0.0.1", port), Handler)
    log(f"listening on http://localhost:{port}/move")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    main()
