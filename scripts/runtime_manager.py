#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
import venv
from pathlib import Path
from typing import Any

import httpx
import psutil


REPO_ROOT = Path(__file__).resolve().parents[1]
PID_FILE = REPO_ROOT / ".app.pid"
FRONTEND_DYNAMIC_CONFIG = REPO_ROOT / "frontend" / "vite.config.dynamic.json"
VENV_DIR = REPO_ROOT / ".venv"
REGISTRY_URL = "http://127.0.0.1:11999"
APP_ID = "context-vault-studio"
APP_DESCRIPTION = "Context Vault Studio — Obsidian-inspired curated AI workspace builder"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Context Vault Studio runtime manager")
    parser.add_argument("command", choices=("start", "stop"))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "start":
        return start_runtime()
    return stop_runtime()


def start_runtime() -> int:
    registry = ensure_registry_assignment()
    cleanup_runtime(registry)
    ensure_backend_dependencies()
    ensure_frontend_dependencies()
    write_frontend_dynamic_config(registry)

    backend_cmd = [
        str(venv_python()),
        "-m",
        "uvicorn",
        "context_vault_studio.api.app:app",
        "--app-dir",
        str(REPO_ROOT / "backend"),
        "--host",
        "127.0.0.1",
        "--port",
        str(registry["backend_port"]),
    ]
    frontend_cmd = ["npm", "run", "dev"]

    env = os.environ.copy()
    env["CONTEXT_VAULT_BACKEND_PORT"] = str(registry["backend_port"])
    env["CONTEXT_VAULT_FRONTEND_PORT"] = str(registry["frontend_port"])

    backend_proc = subprocess.Popen(backend_cmd, cwd=REPO_ROOT, env=env)
    frontend_proc = subprocess.Popen(frontend_cmd, cwd=REPO_ROOT / "frontend", env=env)
    write_pid_file(
        [
            {"pid": backend_proc.pid, "kind": "backend", "cmd": backend_cmd},
            {"pid": frontend_proc.pid, "kind": "frontend", "cmd": frontend_cmd},
        ]
    )

    def handle_signal(signum: int, _frame: Any) -> None:
        del signum
        shutdown_processes()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    start, end = normalized_port_block(registry)
    print(f"Context Vault Studio backend: http://127.0.0.1:{registry['backend_port']}")
    print(f"Context Vault Studio frontend: http://127.0.0.1:{registry['frontend_port']}")
    print(f"Reserved ports: {start + 2}-{end}")

    try:
        while True:
            if backend_proc.poll() is not None or frontend_proc.poll() is not None:
                break
            time.sleep(1)
    finally:
        shutdown_processes()
    return 0


def stop_runtime() -> int:
    registry = ensure_registry_assignment()
    cleanup_runtime(registry)
    return 0


def ensure_registry_assignment() -> dict[str, Any]:
    payload = {
        "app_id": APP_ID,
        "path": str(REPO_ROOT),
        "description": APP_DESCRIPTION,
    }
    response = httpx.post(f"{REGISTRY_URL}/v1/ensure", json=payload, timeout=10.0)
    response.raise_for_status()
    return response.json()


def ensure_backend_dependencies() -> None:
    if not VENV_DIR.exists():
        venv.EnvBuilder(with_pip=True).create(VENV_DIR)
    python_bin = venv_python()
    try:
        subprocess.run(
            [
                str(python_bin),
                "-c",
                "import fastapi, httpx, psutil, pydantic, uvicorn",
            ],
            cwd=REPO_ROOT,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        subprocess.run(
            [
                str(python_bin),
                "-m",
                "pip",
                "install",
                "-r",
                "requirements.txt",
                "-r",
                "requirements-dev.txt",
            ],
            cwd=REPO_ROOT,
            check=True,
        )


def ensure_frontend_dependencies() -> None:
    node_modules = REPO_ROOT / "frontend" / "node_modules"
    if not node_modules.exists():
        subprocess.run(["npm", "install"], cwd=REPO_ROOT / "frontend", check=True)


def write_frontend_dynamic_config(registry: dict[str, Any]) -> None:
    payload = {
        "host": "127.0.0.1",
        "frontendPort": registry["frontend_port"],
        "strictPort": True,
        "apiTarget": f"http://127.0.0.1:{registry['backend_port']}",
    }
    FRONTEND_DYNAMIC_CONFIG.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def cleanup_runtime(registry: dict[str, Any]) -> None:
    kill_from_pid_file()
    start, end = normalized_port_block(registry)
    kill_ports(list(range(start, end + 1)))
    kill_orphans()
    cleanup_runtime_files()


def kill_from_pid_file() -> None:
    if not PID_FILE.exists():
        return
    try:
        payload = json.loads(PID_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return
    for entry in payload:
        pid = int(entry.get("pid", 0) or 0)
        if pid > 0:
            kill_if_owned(pid)


def kill_ports(port_range: list[int]) -> None:
    target_ports = set(port_range)
    try:
        connections = psutil.net_connections(kind="inet")
    except psutil.Error:
        return
    for connection in connections:
        local = connection.laddr
        if not local:
            continue
        if getattr(local, "port", None) not in target_ports:
            continue
        if connection.pid:
            kill_if_owned(connection.pid, allow_any=True)


def kill_orphans() -> None:
    markers = (
        "context_vault_studio.api.app:app",
        "npm run dev",
        "vite",
        "context-vault-studio",
    )
    for proc in psutil.process_iter(["pid", "cmdline", "cwd"]):
        try:
            cmdline = " ".join(proc.info.get("cmdline") or [])
            cwd = proc.info.get("cwd") or ""
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        if str(REPO_ROOT) in cmdline or str(REPO_ROOT) in cwd:
            if any(marker in cmdline for marker in markers):
                kill_if_owned(proc.pid)


def kill_if_owned(pid: int, *, allow_any: bool = False) -> None:
    try:
        proc = psutil.Process(pid)
        cmdline = " ".join(proc.cmdline())
        cwd = proc.cwd()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return
    if not allow_any and str(REPO_ROOT) not in cmdline and str(REPO_ROOT) not in cwd:
        return
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except psutil.TimeoutExpired:
        proc.kill()


def shutdown_processes() -> None:
    kill_from_pid_file()
    cleanup_runtime_files()


def cleanup_runtime_files() -> None:
    if PID_FILE.exists():
        PID_FILE.unlink()
    if FRONTEND_DYNAMIC_CONFIG.exists():
        FRONTEND_DYNAMIC_CONFIG.unlink()


def write_pid_file(entries: list[dict[str, Any]]) -> None:
    PID_FILE.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")


def venv_python() -> Path:
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def normalized_port_block(registry: dict[str, Any]) -> tuple[int, int]:
    start, end = registry["range"]
    return int(start), int(end)


if __name__ == "__main__":
    raise SystemExit(main())
