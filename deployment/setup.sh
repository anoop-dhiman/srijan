#!/usr/bin/env bash
# Srijan — one-command setup script
# Usage: curl -sL https://get.srijan.dev | bash -s -- --domain dev.example.com --email me@example.com --password mypass
set -euo pipefail

# ── Colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[srijan]${RESET} $*"; }
success() { echo -e "${GREEN}[srijan]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[srijan]${RESET} $*"; }
error()   { echo -e "${RED}[srijan] ERROR:${RESET} $*" >&2; exit 1; }

# ── Defaults ───────────────────────────────────────────────────────────────────
DOMAIN=""
EMAIL=""
PASSWORD=""
INSTALL_DIR="/opt/srijan"
REPO_URL="https://github.com/anoopdhiman/srijan.git"
IMAGE_NAME="srijan/platform:latest"

# ── Argument parsing ───────────────────────────────────────────────────────────
usage() {
  echo "Usage: $0 --domain <domain> --email <email> --password <password> [--dir <install-dir>]"
  echo
  echo "Options:"
  echo "  --domain    Domain name for the Srijan UI (e.g. dev.example.com)"
  echo "  --email     Email for Let's Encrypt TLS certificate"
  echo "  --password  Admin login password"
  echo "  --dir       Install directory (default: /opt/srijan)"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)   DOMAIN="$2";   shift 2 ;;
    --email)    EMAIL="$2";    shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    --dir)      INSTALL_DIR="$2"; shift 2 ;;
    -h|--help)  usage ;;
    *)          error "Unknown option: $1" ;;
  esac
done

[[ -z "$DOMAIN"   ]] && error "--domain is required"
[[ -z "$EMAIL"    ]] && error "--email is required"
[[ -z "$PASSWORD" ]] && error "--password is required"

echo
echo -e "${BOLD}Srijan — Cloud AI Development Environment${RESET}"
echo -e "Domain: ${CYAN}${DOMAIN}${RESET}  Install dir: ${CYAN}${INSTALL_DIR}${RESET}"
echo

# ── Root check ─────────────────────────────────────────────────────────────────
if [[ "$EUID" -ne 0 ]]; then
  error "Please run as root or with sudo."
fi

# ── OS detection ───────────────────────────────────────────────────────────────
detect_os() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck source=/dev/null
    . /etc/os-release
    echo "$ID"
  elif command -v uname &>/dev/null; then
    uname -s | tr '[:upper:]' '[:lower:]'
  else
    echo "unknown"
  fi
}

OS=$(detect_os)
info "Detected OS: $OS"

# ── Docker install ─────────────────────────────────────────────────────────────
install_docker() {
  info "Installing Docker..."
  case "$OS" in
    ubuntu|debian)
      apt-get update -qq
      apt-get install -y -qq ca-certificates curl gnupg lsb-release
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/"$OS"/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/${OS} $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list
      apt-get update -qq
      apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
      ;;
    amzn|fedora|rhel|centos)
      dnf install -y docker docker-compose-plugin
      ;;
    *)
      warn "Unsupported OS: $OS. Attempting generic Docker install via get.docker.com..."
      curl -fsSL https://get.docker.com | sh
      ;;
  esac
  systemctl enable --now docker
  success "Docker installed."
}

if ! command -v docker &>/dev/null; then
  install_docker
else
  info "Docker already installed: $(docker --version)"
fi

# Ensure Docker Compose plugin is available
if ! docker compose version &>/dev/null 2>&1; then
  error "Docker Compose plugin not found. Install it and re-run this script."
fi

# ── Prerequisites ──────────────────────────────────────────────────────────────
for cmd in git curl openssl; do
  if ! command -v "$cmd" &>/dev/null; then
    info "Installing $cmd..."
    case "$OS" in
      ubuntu|debian) apt-get install -y -qq "$cmd" ;;
      amzn|fedora|rhel|centos) dnf install -y "$cmd" ;;
    esac
  fi
done

# ── Clone or update repo ───────────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Srijan already cloned at $INSTALL_DIR — pulling latest..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning Srijan to $INSTALL_DIR..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

# ── Build platform image ───────────────────────────────────────────────────────
info "Building platform Docker image (this takes a few minutes)..."
docker build -t "$IMAGE_NAME" "$INSTALL_DIR/platform"
success "Platform image built."

# ── Generate secrets (idempotent — don't overwrite existing) ───────────────────
ENV_FILE="$INSTALL_DIR/deployment/.env"

gen_secret() {
  openssl rand -base64 48 | tr -d '\n/+=' | head -c 64
}

gen_key32() {
  openssl rand -base64 32 | tr -d '\n/+=' | head -c 32
}

if [[ -f "$ENV_FILE" ]]; then
  warn ".env already exists at $ENV_FILE — keeping existing secrets."
  # Update domain, email and password if they changed
  sed -i "s|^SRIJAN_DOMAIN=.*|SRIJAN_DOMAIN=${DOMAIN}|" "$ENV_FILE"
  sed -i "s|^SRIJAN_ADMIN_PASSWORD=.*|SRIJAN_ADMIN_PASSWORD=${PASSWORD}|" "$ENV_FILE"
  sed -i "s|^ACME_EMAIL=.*|ACME_EMAIL=${EMAIL}|" "$ENV_FILE"
else
  info "Generating secrets..."
  JWT_SECRET=$(gen_secret)
  SECRETS_KEY=$(gen_key32)

  cat > "$ENV_FILE" <<EOF
# Srijan — generated by setup.sh
SRIJAN_DOMAIN=${DOMAIN}
SRIJAN_ADMIN_PASSWORD=${PASSWORD}
SRIJAN_JWT_SECRET=${JWT_SECRET}
SRIJAN_SECRETS_KEY=${SECRETS_KEY}
SRIJAN_DATA_DIR=/data
WORKSPACE_ROOT=/workspaces
CADDY_ADMIN_URL=http://caddy:2019
ACME_EMAIL=${EMAIL}
EOF
  chmod 600 "$ENV_FILE"
  success "Secrets generated and written to $ENV_FILE"
fi

# ── Start services ─────────────────────────────────────────────────────────────
info "Starting Srijan services..."
docker compose -f "$INSTALL_DIR/deployment/docker-compose.yml" \
  --env-file "$ENV_FILE" \
  up -d --remove-orphans

# ── Health check ───────────────────────────────────────────────────────────────
info "Waiting for platform to be ready..."
MAX_WAIT=90
WAITED=0
until [[ "$(docker inspect --format='{{.State.Health.Status}}' srijan-platform 2>/dev/null)" == "healthy" ]]; do
  if [[ $WAITED -ge $MAX_WAIT ]]; then
    echo
    error "Platform did not become healthy after ${MAX_WAIT}s. Check logs: docker logs srijan-platform"
  fi
  printf '.'
  sleep 3
  WAITED=$((WAITED + 3))
done
echo

success "Platform is healthy."

# ── Done ───────────────────────────────────────────────────────────────────────
echo
echo -e "${BOLD}${GREEN}Srijan is running!${RESET}"
echo
echo -e "  UI:       ${CYAN}https://${DOMAIN}/forge${RESET}"
echo -e "  Login:    admin / <your password>"
echo
echo -e "  Logs:     ${YELLOW}docker logs -f srijan-platform${RESET}"
echo -e "  Stop:     ${YELLOW}docker compose -f ${INSTALL_DIR}/deployment/docker-compose.yml down${RESET}"
echo -e "  Update:   ${YELLOW}curl -sL https://get.srijan.dev | sudo bash -s -- --domain ${DOMAIN} --email ${EMAIL} --password <password>${RESET}"
echo
warn "Configure your LLM provider at: https://${DOMAIN}/forge (Settings)"
echo
