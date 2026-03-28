#!/usr/bin/env bash
# SAPscope agent installer
#
# Usage:
#   curl -sSL https://app.sapscope.io/install.sh | bash -s -- --token <token>
#
# Options:
#   --token      TOKEN    SAPscope backend token (required)
#   --backend    URL      Backend URL (default: https://app.sapscope.io)
#   --mode       MODE     "mission" or "permanent" (prompted if omitted)
#   --sap-user   USER     SAP username (prompted if omitted)
#   --sap-pass   PASS     SAP password (prompted if omitted)
#   --sap-client CLIENT   SAP client number (default: prompted)
#   --nwrfc      PATH     Path to extracted nwrfcsdk directory
#   --install-dir DIR     Install directory (default: /opt/sapscope)
#   --uninstall           Remove SAPscope agent

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────

BACKEND_URL="https://app.sapscope.io"
TOKEN=""
MODE=""            # mission | permanent
SAP_USER=""
SAP_PASS=""
SAP_CLIENT=""
NWRFC_PATH=""
INSTALL_DIR="/opt/sapscope"
UNINSTALL=false

SERVICE_NAME="sapscope-agent"
TIMER_NAME="sapscope-agent.timer"
PYTHON_MIN="3.10"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${CYAN}[sapscope]${NC} $*"; }
ok()    { echo -e "${GREEN}[sapscope]${NC} $*"; }
warn()  { echo -e "${YELLOW}[sapscope]${NC} $*"; }
die()   { echo -e "${RED}[sapscope] ERROR:${NC} $*" >&2; exit 1; }
ask()   { echo -e "${BOLD}$*${NC}"; }

# ── Argument parsing ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)       TOKEN="$2";        shift 2 ;;
    --backend)     BACKEND_URL="$2";  shift 2 ;;
    --mode)        MODE="$2";         shift 2 ;;
    --sap-user)    SAP_USER="$2";     shift 2 ;;
    --sap-pass)    SAP_PASS="$2";     shift 2 ;;
    --sap-client)  SAP_CLIENT="$2";   shift 2 ;;
    --nwrfc)       NWRFC_PATH="$2";   shift 2 ;;
    --install-dir) INSTALL_DIR="$2";  shift 2 ;;
    --uninstall)   UNINSTALL=true;    shift ;;
    *) die "Unknown option: $1" ;;
  esac
done

# ── Uninstall ─────────────────────────────────────────────────────────────────

if $UNINSTALL; then
  info "Uninstalling SAPscope agent..."
  systemctl stop    "$TIMER_NAME"   2>/dev/null || true
  systemctl stop    "$SERVICE_NAME" 2>/dev/null || true
  systemctl disable "$TIMER_NAME"   2>/dev/null || true
  rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  rm -f "/etc/systemd/system/${TIMER_NAME}"
  systemctl daemon-reload
  rm -rf "$INSTALL_DIR"
  rm -rf /etc/sapscope
  ok "SAPscope agent removed."
  exit 0
fi

# ── Preflight ─────────────────────────────────────────────────────────────────

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash install.sh ..."
[[ -n "$TOKEN" ]] || die "--token is required"

echo
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  SAPscope agent installer${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ── Mode selection ────────────────────────────────────────────────────────────

select_mode() {
  echo
  ask "Installation mode:"
  echo "  1) Mission    — use your own SAP credentials (no Basis action required)"
  echo "                  agent runs for the duration of your engagement"
  echo "  2) Permanent  — dedicated SAPSCOPE user (requires Basis to run setup script)"
  echo "                  agent runs indefinitely, survives consultant changeover"
  echo
  while true; do
    read -rp "Choice [1/2]: " choice
    case "$choice" in
      1) MODE="mission";   break ;;
      2) MODE="permanent"; break ;;
      *) echo "Enter 1 or 2." ;;
    esac
  done
}

if [[ -z "$MODE" ]]; then
  select_mode
fi

case "$MODE" in
  mission)   ok "Mode: Mission (consultant credentials)" ;;
  permanent) ok "Mode: Permanent (dedicated SAPSCOPE user)" ;;
  *) die "Invalid mode '$MODE' — use 'mission' or 'permanent'" ;;
esac

# ── SAP credentials ───────────────────────────────────────────────────────────

prompt_credentials() {
  echo

  if [[ "$MODE" == "mission" ]]; then
    ask "Your SAP username (the one you use daily on this system):"
    [[ -n "$SAP_USER" ]] || { read -rp "  SAP user: " SAP_USER; }
  else
    SAP_USER="SAPSCOPE"
    info "User: SAPSCOPE (must be created by Basis before continuing)"
    echo
    ask "Has the Basis team already run the ZSAPSCOPE_SETUP script? [y/N]"
    read -rp "  " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
      echo
      warn "Action required before continuing:"
      warn "Send docs/ZSAPSCOPE_SETUP.abap to the Basis team."
      warn "They run it via SE38 on each SAP system — takes 5 minutes."
      warn "Then re-run this installer."
      exit 0
    fi
  fi

  if [[ -z "$SAP_PASS" ]]; then
    read -rsp "  Password: " SAP_PASS
    echo
  fi

  if [[ -z "$SAP_CLIENT" ]]; then
    read -rp "  SAP client [000]: " SAP_CLIENT
    SAP_CLIENT="${SAP_CLIENT:-000}"
  fi
}

prompt_credentials

# ── OS detection ──────────────────────────────────────────────────────────────

detect_os() {
  [[ -f /etc/os-release ]] || die "Cannot detect OS — /etc/os-release not found"
  . /etc/os-release
  echo "$ID"
}

OS=$(detect_os)
info "OS detected: $OS"

install_pkg() {
  case "$OS" in
    rhel|centos|rocky|almalinux) dnf install -y "$@" ;;
    sles|opensuse*)               zypper install -y "$@" ;;
    ubuntu|debian)                apt-get install -y -q "$@" ;;
    *) die "Unsupported OS: $OS" ;;
  esac
}

# ── Python ────────────────────────────────────────────────────────────────────

find_python() {
  for cmd in python3.12 python3.11 python3.10 python3; do
    if command -v "$cmd" &>/dev/null; then
      ver=$("$cmd" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
      major=${ver%%.*}; minor=${ver##*.}
      [[ $major -ge 3 && $minor -ge 10 ]] && echo "$cmd" && return
    fi
  done
}

PYTHON=$(find_python || true)

if [[ -z "$PYTHON" ]]; then
  info "Python >= $PYTHON_MIN not found — installing..."
  case "$OS" in
    rhel|centos|rocky|almalinux)
      dnf install -y python3.11 python3.11-pip 2>/dev/null \
        || dnf install -y python3 python3-pip ;;
    sles|opensuse*)
      zypper install -y python311 python311-pip 2>/dev/null \
        || zypper install -y python3 python3-pip ;;
    ubuntu|debian)
      apt-get update -q
      apt-get install -y -q python3.11 python3.11-venv 2>/dev/null \
        || apt-get install -y -q python3 python3-venv ;;
  esac
  PYTHON=$(find_python || true)
  [[ -n "$PYTHON" ]] || die "Could not install Python >= $PYTHON_MIN"
fi

ok "Python: $($PYTHON --version)"

# ── nwrfcsdk ─────────────────────────────────────────────────────────────────

NWRFC_SYSTEM_PATH="/usr/local/sap/nwrfcsdk"

install_nwrfc() {
  local src
  src=$(realpath "$1" 2>/dev/null) || die "Invalid nwrfc path: $1"
  [[ -d "$src" ]]                    || die "nwrfcsdk directory not found: $src"
  [[ -f "$src/lib/libsapnwrfc.so" ]] || die "libsapnwrfc.so not found in $src/lib/"
  case "$src" in
    /proc/*|/sys/*|/etc/*|/boot/*|/bin/*|/sbin/*|/usr/bin/*|/usr/sbin/*)
      die "Refusing to install from system path: $src" ;;
  esac
  info "Installing nwrfcsdk to $NWRFC_SYSTEM_PATH..."
  mkdir -p "$(dirname "$NWRFC_SYSTEM_PATH")"
  cp -r "$src" "$NWRFC_SYSTEM_PATH"
  chmod 755 "$NWRFC_SYSTEM_PATH/lib"/*.so 2>/dev/null || true
  echo "$NWRFC_SYSTEM_PATH/lib" > /etc/ld.so.conf.d/nwrfcsdk.conf
  ldconfig
  ok "nwrfcsdk installed."
}

if [[ -f "$NWRFC_SYSTEM_PATH/lib/libsapnwrfc.so" ]]; then
  ok "nwrfcsdk already installed."
elif [[ -n "$NWRFC_PATH" ]]; then
  install_nwrfc "$NWRFC_PATH"
else
  warn "nwrfcsdk not found. RFC connections will fail until the SDK is installed."
  warn "Download: https://support.sap.com → SAP NW RFC SDK 7.50"
  warn "Then re-run: sudo bash install.sh --token $TOKEN --nwrfc /path/to/nwrfcsdk"
fi

# ── Virtual environment + dependencies ───────────────────────────────────────

info "Creating virtualenv at $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
$PYTHON -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --quiet --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install --quiet pyrfc httpx python-dotenv
ok "Dependencies installed."

# ── Agent source ──────────────────────────────────────────────────────────────

AGENT_DIR="$INSTALL_DIR/agent"
mkdir -p "$AGENT_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/agent/agent.py" ]]; then
  cp -r "$SCRIPT_DIR/agent/"* "$AGENT_DIR/"
else
  info "Downloading agent source..."
  local tarball; tarball=$(mktemp)
  curl -sSfL "$BACKEND_URL/dist/agent.tar.gz"        -o "$tarball"
  curl -sSfL "$BACKEND_URL/dist/agent.tar.gz.sha256" -o "${tarball}.sha256"
  echo "$(cat "${tarball}.sha256")  $tarball" | sha256sum --check \
    || die "Checksum verification failed — aborting"
  tar xz -C "$AGENT_DIR" --strip-components=1 < "$tarball"
  rm -f "$tarball" "${tarball}.sha256"
fi
ok "Agent source installed."

# ── SAP auto-discovery ────────────────────────────────────────────────────────

info "Discovering SAP systems in /usr/sap/..."

discover_systems() {
  [[ -d /usr/sap ]] || return
  for sid_dir in /usr/sap/*/; do
    local sid; sid=$(basename "$sid_dir")
    [[ "$sid" =~ ^[A-Z][A-Z0-9]{2}$ ]] || continue
    local sysnr="" inst candidate
    for inst_dir in "$sid_dir"*/; do
      inst=$(basename "$inst_dir")
      [[ "$inst" =~ ([0-9]{2})$ ]] || continue
      candidate="${BASH_REMATCH[1]}"
      if [[ "$inst" =~ ^(DVEBMGS|ASCS) ]]; then
        sysnr="$candidate"; break
      elif [[ -z "$sysnr" ]]; then
        sysnr="$candidate"
      fi
    done
    [[ -n "$sysnr" ]] && echo "$sid:$sysnr"
  done
}

mapfile -t DISCOVERED < <(discover_systems)

if [[ ${#DISCOVERED[@]} -eq 0 ]]; then
  warn "No SAP systems found in /usr/sap/ — edit /etc/sapscope/agent.env manually."
else
  ok "Found ${#DISCOVERED[@]} system(s): ${DISCOVERED[*]}"
fi

# ── Mission mode expiry warning ───────────────────────────────────────────────

EXPIRY_NOTE=""
if [[ "$MODE" == "mission" ]]; then
  EXPIRY_NOTE="# MODE: mission — uses consultant credentials
# Agent will stop working if password changes or user is locked.
# Switch to permanent mode when the engagement ends:
#   sudo bash install.sh --token $TOKEN --mode permanent"
else
  EXPIRY_NOTE="# MODE: permanent — dedicated SAPSCOPE user"
fi

# ── Configuration ─────────────────────────────────────────────────────────────

mkdir -p /etc/sapscope
chmod 700 /etc/sapscope

cat > /etc/sapscope/agent.env <<EOF
# SAPscope agent configuration
# Generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
${EXPIRY_NOTE}

SAPSCOPE_BACKEND_URL=${BACKEND_URL}
SAPSCOPE_TOKEN=${TOKEN}

SAP_USER=${SAP_USER}
SAP_PASSWD=${SAP_PASS}
SAP_CLIENT=${SAP_CLIENT}
SAP_LANG=EN

SAPSCOPE_SYSTEMS="${DISCOVERED[*]}"
EOF

chmod 600 /etc/sapscope/agent.env
ok "Configuration written to /etc/sapscope/agent.env"

# ── systemd units ─────────────────────────────────────────────────────────────

# Timer interval: mission = 1h (short engagement), permanent = 6h
if [[ "$MODE" == "mission" ]]; then
  TIMER_INTERVAL="1h"
else
  TIMER_INTERVAL="6h"
fi

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=SAPscope collection agent
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/sapscope/agent.env
ExecStart=${INSTALL_DIR}/venv/bin/python -m agent
WorkingDirectory=${AGENT_DIR}
StandardOutput=journal
StandardError=journal
SyslogIdentifier=sapscope-agent
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/tmp

[Install]
WantedBy=multi-user.target
EOF

cat > "/etc/systemd/system/${TIMER_NAME}" <<EOF
[Unit]
Description=SAPscope collection — every ${TIMER_INTERVAL}
Requires=${SERVICE_NAME}.service

[Timer]
OnBootSec=2min
OnUnitActiveSec=${TIMER_INTERVAL}
AccuracySec=5min
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now "$TIMER_NAME"
ok "Timer enabled — collection every ${TIMER_INTERVAL}."

# ── First run ─────────────────────────────────────────────────────────────────

info "Running first collection..."
if systemctl start "$SERVICE_NAME"; then
  ok "First collection successful."
else
  warn "First collection failed."
  warn "Check logs: journalctl -u $SERVICE_NAME -n 50"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  SAPscope agent installed${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo
printf "  %-12s %s\n" "Mode:"     "$MODE"
printf "  %-12s %s\n" "User:"     "$SAP_USER"
printf "  %-12s %s\n" "Systems:"  "${DISCOVERED[*]:-none — edit /etc/sapscope/agent.env}"
printf "  %-12s %s\n" "Schedule:" "every $TIMER_INTERVAL"
echo
echo "  Logs      : journalctl -u $SERVICE_NAME -f"
echo "  Config    : /etc/sapscope/agent.env"
echo "  Uninstall : sudo bash $0 --uninstall"

if [[ "$MODE" == "mission" ]]; then
  echo
  warn "Mission mode: update /etc/sapscope/agent.env if your password changes."
  warn "Switch to permanent mode before leaving the engagement."
  warn "  sudo bash install.sh --token *** --mode permanent"
fi
echo
