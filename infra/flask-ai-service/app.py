#!/usr/bin/env python3
"""
BBCare Local AI Gateway
=======================
A secure, authenticated, and resource-bounded Flask gateway connecting BBCare
to the local Ollama inference service on the Ubuntu AI server.

Complies with:
- BBCare FlaskAiProvider (packages/ai/src/flask.ts)
- Integration Plan (docs/integration/flask-ai-service.md)
- ADR 0005: Local AI Provider Interface
"""

import hmac
import json
import logging
import os
import sys
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests
from flask import Flask, Response, jsonify, request

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SERVICE_NAME = "bbcare-ai-gateway"
SERVICE_VERSION = "1.0.0"

# Host & Port (defaults strictly to loopback 127.0.0.1)
GATEWAY_HOST = os.environ.get("AI_GATEWAY_HOST", "127.0.0.1")
GATEWAY_PORT = int(os.environ.get("AI_GATEWAY_PORT", "5001"))

# Ollama Private Endpoint
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")

# Models
DEFAULT_MODEL = os.environ.get("DEFAULT_MODEL", "qwen2.5:7b")
FALLBACK_MODEL = os.environ.get("FALLBACK_MODEL", "qwen2.5:3b")
ALLOWED_MODELS = [
    m.strip()
    for m in os.environ.get("ALLOWED_MODELS", f"{DEFAULT_MODEL},{FALLBACK_MODEL}").split(",")
    if m.strip()
]

# Security
BEARER_TOKEN = os.environ.get("AI_GATEWAY_BEARER_TOKEN", "").strip()

# Resource Limits
MAX_CONCURRENCY = int(os.environ.get("MAX_CONCURRENCY", "2"))
QUEUE_TIMEOUT_SECONDS = float(os.environ.get("QUEUE_TIMEOUT_SECONDS", "5.0"))
REQUEST_TIMEOUT_SECONDS = float(os.environ.get("REQUEST_TIMEOUT_SECONDS", "90.0"))
MAX_CONTENT_LENGTH = int(os.environ.get("MAX_CONTENT_LENGTH", 256 * 1024))  # 256 KB

# ---------------------------------------------------------------------------
# Safe Structured Logging
# ---------------------------------------------------------------------------
# Never logs customer questions, prompts, model responses, or Bearer tokens.

class SafeFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if hasattr(record, "extra_fields") and isinstance(record.extra_fields, dict):
            data.update(record.extra_fields)
        return json.dumps(data)


handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(SafeFormatter())
logger = logging.getLogger(SERVICE_NAME)
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO").upper())
logger.handlers = [handler]
logger.propagate = False

# ---------------------------------------------------------------------------
# Concurrency Limiter
# ---------------------------------------------------------------------------
# CPU inference on 6-core Intel i5 needs protection against concurrent thrashing.
_concurrency_semaphore = threading.Semaphore(MAX_CONCURRENCY)
_active_requests_lock = threading.Lock()
_active_requests_count = 0

# ---------------------------------------------------------------------------
# Flask App Setup
# ---------------------------------------------------------------------------

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH


def log_audit(event: str, status_code: int, duration_ms: float, extra: Optional[Dict[str, Any]] = None):
    fields = {
        "event": event,
        "status_code": status_code,
        "duration_ms": round(duration_ms, 2),
        "client_ip": request.remote_addr,
        "path": request.path,
        "method": request.method,
    }
    if extra:
        fields.update(extra)
    record = logger.makeRecord(logger.name, logging.INFO, "", 0, event, (), None)
    record.extra_fields = fields
    logger.handle(record)


# ---------------------------------------------------------------------------
# Authentication & Validation Helpers
# ---------------------------------------------------------------------------

def check_bearer_auth() -> Tuple[bool, Optional[Response]]:
    """Validate incoming Authorization: Bearer <token> in constant time."""
    if not BEARER_TOKEN:
        # If no token is configured on the server, refuse all requests for safety
        logger.error("AI_GATEWAY_BEARER_TOKEN is not configured on this server")
        return False, jsonify({"error": "Gateway authentication is not configured"}), 500

    auth_header = request.headers.get("Authorization", "")
    if not auth_header:
        return False, jsonify({"error": "Missing Authorization header"}), 401

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return False, jsonify({"error": "Invalid Authorization header format. Expected Bearer <token>"}), 401

    token = parts[1]
    if not hmac.compare_digest(token, BEARER_TOKEN):
        return False, jsonify({"error": "Invalid bearer token"}), 401

    return True, None, 200


def require_auth(f):
    """Decorator to require Bearer authentication."""
    def wrapper(*args, **kwargs):
        ok, err_resp, status = check_bearer_auth()
        if not ok:
            return err_resp, status
        return f(*args, **kwargs)
    wrapper.__name__ = f.__name__
    return wrapper


# ---------------------------------------------------------------------------
# Health Check Endpoint
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
@require_auth
def health():
    """
    Gateway and upstream Ollama health check.
    Supports both authenticated calls (BBCare FlaskAiProvider) and probe calls.
    """
    start_time = time.time()
    ollama_ok = False
    ollama_version = "unknown"
    installed_models = []

    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3.0)
        if r.status_code == 200:
            ollama_ok = True
            data = r.json()
            installed_models = [m.get("name") for m in data.get("models", []) if m.get("name")]
    except Exception as e:
        logger.warning(f"Ollama health probe failed: {str(e)[:120]}")

    try:
        vr = requests.get(f"{OLLAMA_BASE_URL}/api/version", timeout=3.0)
        if vr.status_code == 200:
            ollama_version = vr.json().get("version", "unknown")
    except Exception:
        pass

    duration_ms = (time.time() - start_time) * 1000
    status_code = 200 if ollama_ok else 503

    response_payload = {
        "status": "healthy" if ollama_ok else "degraded",
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "ollama": {
            "status": "connected" if ollama_ok else "unreachable",
            "version": ollama_version,
            "endpoint": OLLAMA_BASE_URL,
        },
        "models": {
            "primary": DEFAULT_MODEL,
            "fallback": FALLBACK_MODEL,
            "allowed": ALLOWED_MODELS,
            "installed": installed_models,
        },
        "concurrency": {
            "max": MAX_CONCURRENCY,
            "active": _active_requests_count,
        },
    }

    log_audit("health_check", status_code, duration_ms, {"ollama_status": "ok" if ollama_ok else "unreachable"})
    return jsonify(response_payload), status_code


# ---------------------------------------------------------------------------
# Chat Generation Endpoint
# ---------------------------------------------------------------------------

@app.route("/api/chat", methods=["POST"])
@require_auth
def chat():
    """
    Chat completion endpoint proxying to Ollama /api/chat.
    Accepts:
      {
        "model": "qwen2.5:7b",
        "messages": [{"role": "system|user|assistant", "content": "..."}],
        "format": "json" (optional),
        "stream": false,
        "temperature": 0.2 (optional),
        "max_tokens": 800 (optional),
        "options": { ... } (optional)
      }
    """
    start_time = time.time()

    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON payload"}), 400

    messages = data.get("messages")
    if not isinstance(messages, list) or len(messages) == 0:
        return jsonify({"error": "Missing or empty 'messages' list"}), 400

    # Model resolution and validation
    requested_model = data.get("model") or DEFAULT_MODEL
    if requested_model not in ALLOWED_MODELS:
        return jsonify({
            "error": f"Model '{requested_model}' not allowed",
            "allowed_models": ALLOWED_MODELS
        }), 400

    # Build Ollama payload
    ollama_options = {}
    if isinstance(data.get("options"), dict):
        ollama_options.update(data["options"])
    if "temperature" in data and "temperature" not in ollama_options:
        ollama_options["temperature"] = float(data["temperature"])
    if "max_tokens" in data and "num_predict" not in ollama_options:
        ollama_options["num_predict"] = int(data["max_tokens"])

    ollama_payload = {
        "model": requested_model,
        "messages": messages,
        "stream": False,
        "options": ollama_options,
    }
    if data.get("format"):
        ollama_payload["format"] = data["format"]

    # Concurrency control
    acquired = _concurrency_semaphore.acquire(timeout=QUEUE_TIMEOUT_SECONDS)
    if not acquired:
        duration_ms = (time.time() - start_time) * 1000
        log_audit("concurrency_rejected", 429, duration_ms, {"model": requested_model})
        return jsonify({
            "error": "Server busy: AI generation concurrency limit reached. Please retry shortly.",
            "code": "concurrency_limit"
        }), 429

    global _active_requests_count
    with _active_requests_lock:
        _active_requests_count += 1

    try:
        ollama_res = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=ollama_payload,
            timeout=REQUEST_TIMEOUT_SECONDS,
            headers={"Content-Type": "application/json"}
        )
    except requests.exceptions.Timeout:
        duration_ms = (time.time() - start_time) * 1000
        log_audit("ollama_timeout", 504, duration_ms, {"model": requested_model})
        return jsonify({"error": "Inference request timed out on the local AI server"}), 504
    except requests.exceptions.ConnectionError:
        duration_ms = (time.time() - start_time) * 1000
        log_audit("ollama_connection_error", 502, duration_ms, {"model": requested_model})
        return jsonify({"error": "Failed to connect to local Ollama service"}), 502
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        log_audit("ollama_request_error", 500, duration_ms, {"model": requested_model})
        return jsonify({"error": f"Ollama request error: {str(e)[:100]}"}), 500
    finally:
        with _active_requests_lock:
            _active_requests_count -= 1
        _concurrency_semaphore.release()

    duration_ms = (time.time() - start_time) * 1000

    if ollama_res.status_code != 200:
        log_audit("ollama_error", ollama_res.status_code, duration_ms, {"model": requested_model})
        return jsonify({
            "error": "Ollama service returned an error",
            "status_code": ollama_res.status_code,
            "detail": ollama_res.text[:200]
        }), 502

    res_json = ollama_res.json()
    msg = res_json.get("message", {})
    content = msg.get("content", "")

    # Top-level text/response fields for maximal adapter compatibility
    response_data = {
        "model": res_json.get("model", requested_model),
        "created_at": res_json.get("created_at"),
        "message": msg,
        "response": content,
        "text": content,
        "done": res_json.get("done", True),
        "total_duration": res_json.get("total_duration"),
        "eval_count": res_json.get("eval_count"),
        "prompt_eval_count": res_json.get("prompt_eval_count"),
    }

    log_audit("chat_success", 200, duration_ms, {
        "model": requested_model,
        "prompt_eval_count": res_json.get("prompt_eval_count", 0),
        "eval_count": res_json.get("eval_count", 0),
    })

    return jsonify(response_data), 200


# ---------------------------------------------------------------------------
# Embeddings Endpoint
# ---------------------------------------------------------------------------

@app.route("/api/embed", methods=["POST"])
@require_auth
def embed():
    """
    Embedding generation endpoint proxying to Ollama.
    Accepts:
      {
        "model": "...",
        "input": ["text1", "text2"]
      }
    """
    start_time = time.time()

    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 400

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON payload"}), 400

    inputs = data.get("input")
    if inputs is None:
        return jsonify({"error": "Missing 'input' field"}), 400
    if isinstance(inputs, str):
        inputs = [inputs]
    elif not isinstance(inputs, list):
        return jsonify({"error": "'input' must be a string or list of strings"}), 400

    model = data.get("model") or DEFAULT_MODEL

    try:
        ollama_res = requests.post(
            f"{OLLAMA_BASE_URL}/api/embed",
            json={"model": model, "input": inputs},
            timeout=20.0
        )
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        log_audit("embed_error", 502, duration_ms, {"model": model})
        return jsonify({"error": f"Failed to connect to Ollama embed: {str(e)[:100]}"}), 502

    duration_ms = (time.time() - start_time) * 1000

    if ollama_res.status_code != 200:
        err_msg = ollama_res.text
        log_audit("embed_unsupported", ollama_res.status_code, duration_ms, {"model": model})
        return jsonify({
            "error": "Embedding currently unsupported or disabled on local inference backend",
            "detail": err_msg[:200],
            "fallback": "BBCare lexical search fallback is active"
        }), 501

    res_json = ollama_res.json()
    embeddings = res_json.get("embeddings", [])

    log_audit("embed_success", 200, duration_ms, {"model": model, "count": len(embeddings)})
    return jsonify({
        "model": model,
        "embeddings": embeddings,
        "data": [{"embedding": e} for e in embeddings]
    }), 200


# ---------------------------------------------------------------------------
# Models Inspection Endpoint
# ---------------------------------------------------------------------------

@app.route("/api/models", methods=["GET"])
@require_auth
def list_models():
    """List allowed and installed models."""
    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3.0)
        installed = r.json().get("models", []) if r.status_code == 200 else []
    except Exception:
        installed = []

    return jsonify({
        "primary": DEFAULT_MODEL,
        "fallback": FALLBACK_MODEL,
        "allowed": ALLOWED_MODELS,
        "installed": installed
    }), 200


# ---------------------------------------------------------------------------
# Main Execution
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logger.info(f"Starting {SERVICE_NAME} on {GATEWAY_HOST}:{GATEWAY_PORT} (Ollama: {OLLAMA_BASE_URL})")
    app.run(host=GATEWAY_HOST, port=GATEWAY_PORT, threaded=True)
