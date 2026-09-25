"""Local HTTP service that connects the userscript to Pikafish."""

from __future__ import annotations

import ctypes
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from pikafish_bridge import EngineCancelled, EngineError, EnginePositionError, PikafishBridge


HOST = "127.0.0.1"
PORT = 8765
GLYPH = {
    "K": "帅", "A": "仕", "B": "相", "N": "马", "R": "车", "C": "炮", "P": "兵",
    "k": "将", "a": "士", "b": "象", "n": "马", "r": "车", "c": "炮", "p": "卒",
}
CN = "一二三四五六七八九"
Move = tuple[int, int, str, str]


def side(piece: str) -> str:
    return "r" if piece.isupper() else "b"


def parse_fen(fen: str) -> tuple[list[str], str]:
    parts = fen.strip().split()
    if len(parts) < 2 or parts[1] not in ("w", "b"):
        raise ValueError("FEN 需要棋盘和行棋方（w 或 b）。")
    rows = parts[0].split("/")
    if len(rows) != 10:
        raise ValueError("FEN 必须有 10 行。")
    board: list[str] = []
    for row in rows:
        expanded: list[str] = []
        for char in row:
            if char in "123456789":
                expanded.extend("." * int(char))
            elif char in GLYPH:
                expanded.append(char)
            else:
                raise ValueError(f"FEN 含未知字符：{char}")
        if len(expanded) != 9:
            raise ValueError("FEN 每行必须对应 9 列。")
        board.extend(expanded)
    if board.count("K") != 1 or board.count("k") != 1:
        raise ValueError("棋盘必须各有一枚帅和将。")
    return board, "r" if parts[1] == "w" else "b"


def notation(move: Move) -> str:
    origin, destination, piece, _captured = move
    team, kind = side(piece), piece.upper()
    start_row, start_col = divmod(origin, 9)
    end_row, end_col = divmod(destination, 9)
    file_name = lambda col: CN[8 - col if team == "r" else col]
    if start_row == end_row:
        action, amount = "平", file_name(end_col)
    else:
        forward = end_row < start_row if team == "r" else end_row > start_row
        action = "进" if forward else "退"
        amount = file_name(end_col) if kind in ("N", "B", "A") else CN[min(8, abs(end_row - start_row) - 1)]
    return f"{GLYPH[piece]}{file_name(start_col)}{action}{amount}"


def uci_square(square: str) -> int:
    if len(square) != 2 or square[0] not in "abcdefghi" or square[1] not in "0123456789":
        raise EngineError(f"Pikafish 返回了无效坐标：{square}")
    return (9 - int(square[1])) * 9 + ord(square[0]) - ord("a")


def analyze_position(fen: str, time_ms: int, stop: threading.Event, engine: PikafishBridge) -> dict:
    board, team = parse_fen(fen)
    parts = fen.strip().split()
    full_fen = f"{parts[0]} {parts[1]} - - 0 1"
    result = engine.analyze(full_fen, time_ms, stop)
    move_text = result.pop("move")
    if move_text in ("(none)", "0000"):
        return {"best": None, **result}
    if len(move_text) != 4:
        raise EngineError(f"Pikafish 返回了无效走法：{move_text}")
    origin, destination = uci_square(move_text[:2]), uci_square(move_text[2:])
    piece, captured = board[origin], board[destination]
    if origin == destination or piece == "." or side(piece) != team or (captured != "." and side(captured) == team):
        raise EngineError(f"Pikafish 的走法与当前棋盘不匹配：{move_text}")
    move = (origin, destination, piece, captured)
    return {
        "best": {"from": origin, "to": destination, "piece": piece, "notation": notation(move), "score": result["score"]},
        **result,
    }


class AdvisorServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address: tuple[str, int], engine: PikafishBridge):
        super().__init__(address, AdvisorHandler)
        self.engine = engine
        self.search_lock = threading.Lock()
        self.active_stop: threading.Event | None = None


class AdvisorHandler(BaseHTTPRequestHandler):
    server: AdvisorServer

    def log_message(self, _format: str, *_args: object) -> None:
        pass

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "https://h5login.qqchess.qq.com")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            self.wfile.write(body)
        except (ConnectionError, TimeoutError):
            # 网页切换局面时会主动取消旧请求；此时连接关闭是预期行为。
            pass

    def do_OPTIONS(self) -> None:
        self.send_json(200, {"ok": True})

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(200, {"ok": True, "service": "xiangqi-advisor"})
        else:
            self.send_json(404, {"error": "未知接口。"})

    def do_POST(self) -> None:
        if self.path != "/analyze":
            self.send_json(404, {"error": "未知接口。"})
            return
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            self.send_json(415, {"error": "请求必须使用 JSON。"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 2048:
                raise ValueError("请求长度无效。")
            data = json.loads(self.rfile.read(length))
            fen = data["fen"]
            depth = int(data.get("depth", 3))
            time_ms = int(data.get("time_ms", 3000))
            if not isinstance(fen, str) or depth not in (2, 3, 4) or not 500 <= time_ms <= 15000:
                raise ValueError("分析参数无效。")
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})
            return
        stop = threading.Event()
        with self.server.search_lock:
            if self.server.active_stop is not None:
                self.server.active_stop.set()
            self.server.active_stop = stop
        try:
            result = analyze_position(fen, time_ms, stop, self.server.engine)
            self.send_json(200, result)
        except EngineCancelled:
            self.send_json(409, {"error": "分析已被新局面替代。"})
        except EnginePositionError as error:
            self.send_json(400, {"error": str(error)})
        except EngineError as error:
            self.send_json(503, {"error": str(error)})
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
        finally:
            with self.server.search_lock:
                if self.server.active_stop is stop:
                    self.server.active_stop = None


def main() -> None:
    if os.name == "nt":
        try:
            ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), 0x00004000)
        except (AttributeError, OSError):
            pass
    engine = PikafishBridge()
    try:
        server = AdvisorServer((HOST, PORT), engine)
    except Exception:
        engine.close()
        raise
    print(f"Pikafish 象棋分析服务已启动：http://{HOST}:{PORT}", flush=True)
    print("保持此窗口打开；按 Ctrl+C 停止。", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        engine.close()


if __name__ == "__main__":
    main()
