"""Persistent UCI bridge to the official Pikafish Xiangqi engine."""

from __future__ import annotations

import queue
import re
import subprocess
import threading
import time
from contextlib import suppress
from pathlib import Path


ENGINE_DIR = Path(__file__).resolve().parent / "third_party" / "pikafish"
ENGINE_PATH = ENGINE_DIR / "Pikafish-Windows-x86-64-universal.exe"
NET_PATH = ENGINE_DIR / "pikafish.nnue"
MATE = 1_000_000
_EOF = object()
_DEPTH = re.compile(r"\bdepth\s+(\d+)")
_SCORE = re.compile(r"\bscore\s+(cp|mate)\s+(-?\d+)")
_NODES = re.compile(r"\bnodes\s+(\d+)")
_TIME = re.compile(r"\btime\s+(\d+)")


class EngineError(Exception):
    pass


class EnginePositionError(EngineError):
    pass


class EngineCancelled(Exception):
    pass


class PikafishBridge:
    def __init__(self) -> None:
        if not ENGINE_PATH.is_file() or not NET_PATH.is_file():
            raise EngineError(f"缺少 Pikafish 引擎或 NNUE 文件：{ENGINE_DIR}")
        self.lock = threading.Lock()
        self.process: subprocess.Popen[str] | None = None
        self.lines: queue.Queue[object] = queue.Queue()
        with self.lock:
            self._start()

    def _start(self) -> None:
        flags = 0
        if hasattr(subprocess, "CREATE_NO_WINDOW"):
            flags |= subprocess.CREATE_NO_WINDOW
            flags |= getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0)
        try:
            process = subprocess.Popen(
                [str(ENGINE_PATH)], cwd=ENGINE_DIR,
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace", bufsize=1,
                creationflags=flags,
            )
        except OSError as error:
            raise EngineError(f"无法启动 Pikafish：{error}") from error
        self.process = process
        self.lines = queue.Queue()
        lines = self.lines

        def read_output() -> None:
            try:
                assert process.stdout is not None
                for line in process.stdout:
                    lines.put(line.rstrip("\r\n"))
            except (OSError, ValueError):
                pass
            finally:
                lines.put(_EOF)

        threading.Thread(target=read_output, name="pikafish-output", daemon=True).start()
        try:
            self._send("uci")
            self._wait_for("uciok", 8)
            self._send("setoption name Threads value 2")
            self._send("setoption name Hash value 64")
            self._send("setoption name MultiPV value 1")
            self._send(f"setoption name EvalFile value {NET_PATH}")
            self._send("isready")
            self._wait_for("readyok", 15)
        except Exception:
            self._close_process()
            raise

    def _send(self, command: str) -> None:
        process = self.process
        if process is None or process.poll() is not None or process.stdin is None:
            raise EngineError("Pikafish 已退出。")
        try:
            process.stdin.write(command + "\n")
            process.stdin.flush()
        except (BrokenPipeError, OSError) as error:
            raise EngineError("无法向 Pikafish 发送命令。") from error

    def _next_line(self, timeout: float) -> str | None:
        try:
            line = self.lines.get(timeout=timeout)
        except queue.Empty:
            return None
        if line is _EOF:
            raise EngineError("Pikafish 意外退出；请检查局面和网络文件。")
        assert isinstance(line, str)
        if "CRITICAL ERROR" in line:
            raise EnginePositionError(line)
        return line

    def _wait_for(self, token: str, seconds: float) -> None:
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            line = self._next_line(min(0.2, max(0.01, deadline - time.monotonic())))
            if line == token:
                return
        raise EngineError(f"Pikafish 未返回 {token}。")

    def _close_process(self) -> None:
        process = self.process
        self.process = None
        if process is None:
            return
        try:
            if process.poll() is None and process.stdin is not None:
                process.stdin.write("quit\n")
                process.stdin.flush()
            process.wait(timeout=1)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            if process.poll() is None:
                with suppress(OSError):
                    process.kill()
                with suppress(OSError, subprocess.TimeoutExpired):
                    process.wait(timeout=2)
        finally:
            if process.stdin is not None:
                with suppress(OSError, ValueError):
                    process.stdin.close()
            if process.stdout is not None:
                with suppress(OSError, ValueError):
                    process.stdout.close()

    def close(self) -> None:
        with self.lock:
            self._close_process()

    def analyze(self, fen: str, time_ms: int, stop: threading.Event) -> dict:
        with self.lock:
            if stop.is_set():
                raise EngineCancelled
            if self.process is None or self.process.poll() is not None:
                self._close_process()
                self._start()
            self._send(f"position fen {fen}")
            self._send(f"go movetime {time_ms}")
            started = time.monotonic()
            deadline = started + time_ms / 1000 + 2
            hard_deadline = deadline + 2
            stop_sent = False
            latest = {"score": 0, "depth_reached": 0, "nodes": 0, "elapsed_ms": 0}
            try:
                while time.monotonic() < hard_deadline:
                    if (stop.is_set() or time.monotonic() >= deadline) and not stop_sent:
                        self._send("stop")
                        stop_sent = True
                        hard_deadline = min(hard_deadline, time.monotonic() + 2)
                    line = self._next_line(0.1)
                    if line is None:
                        continue
                    if line.startswith("info ") and " score " in line:
                        depth = _DEPTH.search(line)
                        score = _SCORE.search(line)
                        nodes = _NODES.search(line)
                        elapsed = _TIME.search(line)
                        if depth and score:
                            score_value = int(score.group(2))
                            if score.group(1) == "mate":
                                score_value = (MATE - abs(score_value)) * (1 if score_value >= 0 else -1)
                            latest = {
                                "score": score_value,
                                "depth_reached": int(depth.group(1)),
                                "nodes": int(nodes.group(1)) if nodes else latest["nodes"],
                                "elapsed_ms": int(elapsed.group(1)) if elapsed else latest["elapsed_ms"],
                            }
                    elif line.startswith("bestmove "):
                        if stop.is_set():
                            raise EngineCancelled
                        latest["move"] = line.split()[1]
                        latest["elapsed_ms"] = round((time.monotonic() - started) * 1000)
                        return latest
                raise EngineError("Pikafish 分析超时，已重启引擎。")
            except EngineCancelled:
                raise
            except EngineError:
                self._close_process()
                raise
