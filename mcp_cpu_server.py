#!/usr/bin/env python3
"""MCP server that lets *Claude* play as a remote CPU in the Chopsticks web app.

It wears two hats in one process:

  1. An HTTP server on a localhost port that speaks the game's remote-CPU
     protocol (POST /move -> {"move": <index>, "name": ...}). This is the same
     protocol remote_cpu_server.py implements.
  2. An MCP server on stdio (newline-delimited JSON-RPC) exposing tools that let
     Claude read the current position and submit a move.

The twist vs. remote_cpu_server.py: instead of an algorithm choosing the move,
each incoming /move request *parks* on a condition variable until Claude calls
the `chopsticks_play` tool. So the human plays in the browser, the browser's
fetch blocks, Claude reads the position over MCP, thinks, and submits an index,
which unblocks the browser. Because a human-in-the-loop (well, an AI-in-the-loop)
takes far longer than 8 s, set the web app's ChopsticksCPU.config.timeoutMs high
enough to wait (the repo default is bumped to 10 minutes for this reason).

MCP config (project .mcp.json):

    { "mcpServers": { "chopsticks-cpu": {
        "command": "python3",
        "args": ["/abs/path/mcp_cpu_server.py", "--port", "8765"] } } }

Run standalone for a quick sanity check:  python3 mcp_cpu_server.py --port 8765
(then POST to http://localhost:8765/move and watch it wait).
"""

import argparse
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERVER_NAME = "chopsticks-cpu"
SERVER_VERSION = "1.0.0"
DEFAULT_ENGINE_NAME = "Claude"
# How long a parked /move request will wait for Claude before giving up.
HTTP_WAIT_SECONDS = 900


def log(msg):
    """Timestamped line to stderr (stdout is reserved for the MCP protocol)."""
    ts = time.strftime("%H:%M:%S")
    sys.stderr.write(f"{ts} [{SERVER_NAME}] {msg}\n")
    sys.stderr.flush()


# --------------------------------------------------------------------------
# Shared state between the HTTP thread(s) and the MCP (stdio) thread.
# --------------------------------------------------------------------------
class Table:
    """Holds at most one pending move request awaiting Claude's decision."""

    def __init__(self, engine_name):
        self.cond = threading.Condition()
        self.engine_name = engine_name
        self.request = None      # the position dict the browser POSTed
        self.response = None     # {"move": idx, "name": ...} Claude supplied
        self.seq = 0             # bumped each time a new request arrives
        self.history = []        # (seq, played_index) for a little context

    # ---- called from the HTTP thread ----
    def submit_request(self, position):
        """Park a browser request until Claude answers or we time out."""
        with self.cond:
            self.request = position
            self.response = None
            self.seq += 1
            my_seq = self.seq
            turn = position.get("turn", 0)
            hands = position.get("hands", [[0, 0], [0, 0]])
            nmoves = len(position.get("moves") or [])
            log(f"move request #{my_seq}: turn=P{turn} me={hands[turn]} "
                f"opp={hands[1 - turn]} ({nmoves} legal moves) — waiting for Claude…")
            self.cond.notify_all()
            deadline = time.monotonic() + HTTP_WAIT_SECONDS
            while self.response is None and self.seq == my_seq:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                self.cond.wait(timeout=remaining)
            resp = self.response
            if self.seq == my_seq:
                self.request = None
                self.response = None
            if resp is None:
                log(f"move request #{my_seq}: timed out after "
                    f"{HTTP_WAIT_SECONDS}s with no reply")
            return resp

    # ---- called from the MCP thread ----
    def peek(self):
        with self.cond:
            return self.request, self.seq

    def wait_for_request(self, timeout):
        with self.cond:
            deadline = time.monotonic() + timeout
            while self.request is None:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None, self.seq
                self.cond.wait(timeout=remaining)
            return self.request, self.seq

    def play(self, index, name):
        with self.cond:
            if self.request is None:
                return False, "No pending move: it is not the CPU's turn right now."
            moves = self.request.get("moves") or []
            if not isinstance(index, int) or index < 0 or index >= len(moves):
                return False, (f"Move index {index} is out of range "
                               f"(there are {len(moves)} legal moves, 0..{len(moves) - 1}).")
            self.response = {"move": index, "name": name or self.engine_name}
            self.history.append((self.seq, index))
            self.history[:] = self.history[-20:]
            label = moves[index].get("label", "?")
            self.cond.notify_all()
            log(f"Claude played move #{index}: {label}")
            return True, f"Played move #{index}: {label}"


TABLE = Table(DEFAULT_ENGINE_NAME)


# --------------------------------------------------------------------------
# HTTP side: the game's remote-CPU protocol.
# --------------------------------------------------------------------------
class MoveHandler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self._send(204, {})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            position = json.loads(self.rfile.read(length) or "{}")
        except Exception as e:  # noqa: BLE001
            self._send(400, {"error": f"bad request: {e}"})
            return
        resp = TABLE.submit_request(position)
        if resp is None:
            self._send(504, {"error": "Claude did not respond in time."})
        else:
            self._send(200, resp)

    def log_message(self, fmt, *args):  # keep stderr quiet
        pass


def start_http(host, port):
    server = ThreadingHTTPServer((host, port), MoveHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server


# --------------------------------------------------------------------------
# Helpers to render a position for Claude.
# --------------------------------------------------------------------------
def describe_position(position):
    if not position:
        return "No position."
    hands = position.get("hands", [[0, 0], [0, 0]])
    turn = position.get("turn", 0)
    names = position.get("names", ["Player 1", "Player 2"])
    moves = position.get("moves", [])
    me, opp = turn, 1 - turn

    lines = []
    lines.append(f"It is {names[me]}'s turn (you are player {me}).")
    lines.append(f"  Your hands (P{me}, {names[me]}): {hands[me]}")
    lines.append(f"  Opponent  (P{opp}, {names[opp]}): {hands[opp]}")
    rules = position.get("rules") or {}
    if rules:
        cap = rules.get("cap") or rules.get("fingers")
        roll = rules.get("rollover")
        bits = []
        if cap is not None:
            bits.append(f"cap={cap}")
        if roll is not None:
            bits.append(f"rollover={roll}")
        if bits:
            lines.append("  Rules: " + ", ".join(bits))
    lines.append(f"Legal moves ({len(moves)}):")
    for i, m in enumerate(moves):
        label = m.get("label") or m.get("kind", "move")
        lines.append(f"  [{i}] {label}")
    lines.append("")
    lines.append("Call chopsticks_play with the index you choose.")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# MCP tools.
# --------------------------------------------------------------------------
def tool_get_position(args):
    request, _ = TABLE.peek()
    if request is None:
        return ("No move is pending. It is not the CPU's turn yet — make your "
                "move in the browser, then check again (or use "
                "chopsticks_wait_for_turn to block until it's your turn).")
    return describe_position(request)


def tool_wait_for_turn(args):
    timeout = args.get("timeout_seconds", 55)
    try:
        timeout = float(timeout)
    except (TypeError, ValueError):
        timeout = 55
    timeout = max(1, min(timeout, 280))
    request, _ = TABLE.wait_for_request(timeout)
    if request is None:
        return (f"Still waiting — no move request arrived within {int(timeout)}s. "
                "The human hasn't moved yet; call chopsticks_wait_for_turn again.")
    return describe_position(request)


def tool_play(args):
    index = args.get("index")
    name = args.get("name")
    if isinstance(index, str) and index.strip().lstrip("-").isdigit():
        index = int(index)
    ok, msg = TABLE.play(index, name)
    return msg if ok else "ERROR: " + msg


def tool_status(args):
    request, seq = TABLE.peek()
    pending = "yes" if request is not None else "no"
    hist = ", ".join(f"#{idx}" for _, idx in TABLE.history[-5:]) or "none"
    return (f"Engine name: {TABLE.engine_name}\n"
            f"Pending move request: {pending}\n"
            f"Requests seen this session: {seq}\n"
            f"Recent moves played: {hist}")


TOOLS = [
    {
        "name": "chopsticks_get_position",
        "description": ("Return the current position the game is waiting on you to "
                        "move in, including your hands, the opponent's hands, and the "
                        "numbered list of legal moves. Returns a 'not your turn' notice "
                        "if nothing is pending."),
        "inputSchema": {"type": "object", "properties": {}},
        "handler": tool_get_position,
    },
    {
        "name": "chopsticks_wait_for_turn",
        "description": ("Block until it's the CPU's turn (a move request arrives from "
                        "the game) or the timeout elapses, then return the position. "
                        "Use this after the human has moved to grab the position as "
                        "soon as it's your turn."),
        "inputSchema": {
            "type": "object",
            "properties": {
                "timeout_seconds": {
                    "type": "number",
                    "description": "How long to wait, 1-280 seconds (default 55).",
                }
            },
        },
        "handler": tool_wait_for_turn,
    },
    {
        "name": "chopsticks_play",
        "description": ("Submit your chosen move by its index from the legal-moves "
                        "list shown in the position. Unblocks the browser and plays "
                        "the move. Optionally set a display name for yourself."),
        "inputSchema": {
            "type": "object",
            "properties": {
                "index": {
                    "type": "integer",
                    "description": "Index of the chosen move from the legal-moves list.",
                },
                "name": {
                    "type": "string",
                    "description": "Optional display name shown in the game (default 'Claude').",
                },
            },
            "required": ["index"],
        },
        "handler": tool_play,
    },
    {
        "name": "chopsticks_status",
        "description": "Report whether a move is pending and recent activity.",
        "inputSchema": {"type": "object", "properties": {}},
        "handler": tool_status,
    },
]
TOOLS_BY_NAME = {t["name"]: t for t in TOOLS}


# --------------------------------------------------------------------------
# Minimal MCP (JSON-RPC 2.0 over stdio, newline-delimited).
# --------------------------------------------------------------------------
def send_message(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def make_result(req_id, result):
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def make_error(req_id, code, message):
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


def handle_request(msg):
    method = msg.get("method")
    req_id = msg.get("id")
    params = msg.get("params") or {}
    is_request = "id" in msg

    if method == "initialize":
        proto = params.get("protocolVersion", "2025-06-18")
        result = {
            "protocolVersion": proto,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
        }
        send_message(make_result(req_id, result))
        return

    if method == "notifications/initialized":
        return  # notification, no reply

    if method == "ping":
        send_message(make_result(req_id, {}))
        return

    if method == "tools/list":
        listing = [{k: t[k] for k in ("name", "description", "inputSchema")} for t in TOOLS]
        send_message(make_result(req_id, {"tools": listing}))
        return

    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        tool = TOOLS_BY_NAME.get(name)
        if tool is None:
            log(f"tool call: unknown tool {name!r}")
            send_message(make_error(req_id, -32602, f"Unknown tool: {name}"))
            return
        log(f"tool call: {name} {args if args else ''}".rstrip())
        try:
            text = tool["handler"](args)
        except Exception as e:  # noqa: BLE001
            text = f"Tool error: {e}"
        send_message(make_result(req_id, {"content": [{"type": "text", "text": text}]}))
        return

    # Unknown method: error for requests, ignore notifications.
    if is_request:
        send_message(make_error(req_id, -32601, f"Method not found: {method}"))


def mcp_loop():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        try:
            handle_request(msg)
        except Exception as e:  # noqa: BLE001 - never let the loop die
            log(f"handler error: {e}")


def main():
    ap = argparse.ArgumentParser(description="Chopsticks remote-CPU MCP server")
    ap.add_argument("--port", type=int, default=8765,
                    help="localhost port for the game's /move requests (default 8765)")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--name", default=DEFAULT_ENGINE_NAME,
                    help="display name reported to the game (default 'Claude')")
    args = ap.parse_args()

    TABLE.engine_name = args.name
    start_http(args.host, args.port)
    log(f"HTTP /move on http://localhost:{args.port} as '{args.name}'; MCP on stdio.")
    try:
        mcp_loop()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
