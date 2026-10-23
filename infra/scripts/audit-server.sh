#!/usr/bin/env bash
# BBCare read-only server audit.
#
# Purpose: describe the owner's existing server (hardware, runtimes, AI/Flask service, ports,
# network exposure) so BBCare can integrate without disturbing current workloads.
#
# Guarantees:
#   - READ-ONLY: no package installs, no service restarts, no file writes outside the report file.
#   - NO SECRETS: environment variable VALUES are never printed (names only); lines that look like
#     credentials are redacted; file contents are never dumped (only route/decorator lines).
#   - No network calls except optional local health probes to 127.0.0.1.
#
# Usage (run as a normal user; sudo is NOT required, sections needing root are reported as skipped):
#   bash audit-server.sh [path-to-flask-project ...] > bbcare-audit.txt
# Then review the output yourself before sharing it. Share it as a file, not in chat if it is long.

set -u
export LC_ALL=C
SECTION() { printf '\n===== %s =====\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }
redact() { sed -E 's/((pass(word)?|secret|token|api[_-]?key|authorization|bearer|private[_-]?key|cookie)[^=:]*[=:][[:space:]]*)[^[:space:]"'"'"',]+/\1[REDACTED]/Ig'; }
run() { "$@" 2>&1 | redact | head -n 200; }

SECTION "audit metadata"
echo "date_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "script_version: 1.0"
echo "user: $(id -un) (uid $(id -u))"
echo "hostname_hash: $(hostname | sha256sum | cut -c1-12)  (hostname itself not printed)"

SECTION "operating system"
run cat /etc/os-release
run uname -srm
have uptime && run uptime

SECTION "cpu and memory"
have lscpu && run lscpu | grep -E 'Model name|Socket|Core|Thread|^CPU\(s\)|Flags' | sed -E 's/(Flags:).*(avx512[^ ]*|avx2).*/\1 ... includes \2 .../'
have free && run free -h
run cat /proc/loadavg

SECTION "storage"
have df && run df -hT -x tmpfs -x devtmpfs -x squashfs -x overlay

SECTION "gpu"
if have nvidia-smi; then
  run nvidia-smi --query-gpu=name,memory.total,memory.used,driver_version,temperature.gpu,power.draw,utilization.gpu --format=csv
  run nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv
else
  echo "nvidia-smi not found"
fi
have rocm-smi && run rocm-smi --showproductname --showmeminfo vram
have lspci && run lspci | grep -iE 'vga|3d|display'

SECTION "runtimes"
for c in python3 pip3 node npm docker podman nginx caddy gunicorn uwsgi psql redis-server ollama; do
  if have "$c"; then printf '%-14s %s\n' "$c" "$("$c" --version 2>&1 | head -n1 | redact)"; else printf '%-14s %s\n' "$c" "not installed"; fi
done

SECTION "ollama (if present)"
if have ollama; then
  run ollama list
  run ollama ps
  echo "--- ollama environment variable NAMES set for the service (values hidden):"
  if have systemctl; then systemctl show ollama --property=Environment 2>/dev/null | tr ' ' '\n' | sed -E 's/=.*//' | grep -v '^$' | head -50; fi
fi
if have curl; then
  printf 'ollama local API (127.0.0.1:11434/api/version): '
  curl -s -m 3 http://127.0.0.1:11434/api/version 2>/dev/null || echo "not reachable"
  echo
fi

SECTION "listening ports (exposure check)"
if have ss; then
  run ss -tlnp | awk 'NR==1 || /LISTEN/' | sed -E 's/users:\(\("([^"]+)".*/process=\1/'
  echo "--- review: anything bound to 0.0.0.0 or [::] is reachable from other machines unless a firewall blocks it"
else
  run netstat -tln
fi

SECTION "firewall"
if have ufw; then run ufw status verbose || true; fi
if have firewall-cmd; then run firewall-cmd --list-all || true; fi
have nft && { nft list ruleset >/dev/null 2>&1 && echo "nftables ruleset present (not printed)" || echo "nftables: needs root to inspect (skipped)"; }

SECTION "services (python, flask, ai related)"
if have systemctl; then
  systemctl list-units --type=service --state=running --no-pager --plain 2>/dev/null | awk '{print $1}' | grep -iE 'flask|gunicorn|uwsgi|python|ollama|ai|llm|vllm|nginx|caddy|postgres|redis|docker|cloudflared|tailscale|wireguard|wg-quick' | head -50
fi
echo "--- processes (command names and arguments with secrets redacted):"
ps -eo pid,user,%cpu,%mem,etime,args --sort=-%mem 2>/dev/null | grep -iE 'flask|gunicorn|uwsgi|python|ollama|vllm|llama|node' | grep -v grep | redact | cut -c1-220 | head -30

SECTION "containers"
if have docker; then
  if docker ps >/dev/null 2>&1; then run docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'; else echo "docker present but current user cannot query it (skipped)"; fi
fi

SECTION "tunnels and private networking"
have cloudflared && echo "cloudflared installed: $(cloudflared --version 2>&1 | head -n1)"
have tailscale && { tailscale status --peers=false 2>/dev/null | head -5 | sed -E 's/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/x.x.x.x/g' || echo "tailscale present (status needs permission)"; }
have wg && { wg show interfaces 2>/dev/null || echo "wireguard present (needs root to inspect)"; }

SECTION "flask application discovery"
if [ "$#" -eq 0 ]; then
  echo "No project path given. Re-run with the Flask project directory, e.g.: bash audit-server.sh /srv/my-flask-app"
fi
for dir in "$@"; do
  echo "--- project: $dir"
  [ -d "$dir" ] || { echo "not a directory"; continue; }
  echo "python files: $(find "$dir" -name '*.py' -not -path '*/venv/*' -not -path '*/.venv/*' -not -path '*/site-packages/*' 2>/dev/null | wc -l)"
  echo "--- dependency names (requirements*.txt / pyproject, versions shown, no URLs or tokens):"
  find "$dir" -maxdepth 2 \( -name 'requirements*.txt' -o -name 'pyproject.toml' -o -name 'Pipfile' \) 2>/dev/null | while read -r f; do
    echo "[$f]"; grep -vE '^\s*#|https?://|git\+' "$f" | redact | head -60
  done
  echo "--- Flask app objects and blueprints:"
  grep -rnE --include='*.py' --exclude-dir={venv,.venv,site-packages,__pycache__} '(Flask\(|Blueprint\()' "$dir" 2>/dev/null | cut -c1-200 | head -30
  echo "--- routes (decorator lines only):"
  grep -rnE --include='*.py' --exclude-dir={venv,.venv,site-packages,__pycache__} '@[A-Za-z0-9_]+\.(route|get|post|put|delete|patch)\(' "$dir" 2>/dev/null | cut -c1-200 | head -100
  echo "--- authentication hints (decorators, header checks; values never shown):"
  grep -rnE --include='*.py' --exclude-dir={venv,.venv,site-packages,__pycache__} '(login_required|jwt_required|auth_required|Authorization|X-API-Key|api_key|bearer|HTTPBasicAuth|before_request)' "$dir" 2>/dev/null | redact | cut -c1-160 | head -40
  echo "--- model/provider hints:"
  grep -rnoE --include='*.py' --exclude-dir={venv,.venv,site-packages,__pycache__} '(ollama|transformers|vllm|llama_cpp|sentence_transformers|openai|anthropic|AutoModel[A-Za-z]*|SentenceTransformer|chromadb|faiss|pgvector)' "$dir" 2>/dev/null | sort | uniq -c | sort -rn | head -30
  echo "--- bind address / port hints:"
  grep -rnE --include='*.py' --include='*.ini' --include='*.service' --include='*.conf' --exclude-dir={venv,.venv,site-packages} '(app\.run\(|host=|bind *=|--bind|PORT)' "$dir" 2>/dev/null | redact | cut -c1-160 | head -20
  echo "--- environment variable NAMES referenced (values not read):"
  grep -rhoE --include='*.py' --exclude-dir={venv,.venv,site-packages} "(os\.environ(\.get)?\(?\[?['\"][A-Z0-9_]+|getenv\(['\"][A-Z0-9_]+)" "$dir" 2>/dev/null | grep -oE '[A-Z0-9_]{3,}' | sort -u | head -60
done

SECTION "end"
echo "Audit complete. No changes were made. Review the output before sharing."
