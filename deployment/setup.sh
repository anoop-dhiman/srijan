#!/usr/bin/env bash
# Srijan — one-command setup script
# Usage: curl -sL https://raw.githubusercontent.com/anoop-dhiman/srijan/refs/heads/master/deployment/setup.sh | bash
set -euo pipefail

# ── Colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[srijan]${RESET} $*"; }
success() { echo -e "${GREEN}[srijan]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[srijan]${RESET} $*"; }
error()   { echo -e "${RED}[srijan] ERROR:${RESET} $*" >&2; exit 1; }

# ── Trap ───────────────────────────────────────────────────────────────────────
trap 'echo; error "Setup interrupted."' INT TERM

IMAGE_NAME="ghcr.io/anoop-dhiman/srijan-platform:latest"

# ── Interactive prompts ────────────────────────────────────────────────────────
# Read from /dev/tty so prompts work when script is piped via curl | bash
ask() {
  local label="$1" default="${2:-}" value
  if [[ -n "$default" ]]; then
    printf "${CYAN}[srijan]${RESET} %s [%s]: " "$label" "$default" >/dev/tty
  else
    printf "${CYAN}[srijan]${RESET} %s: " "$label" >/dev/tty
  fi
  read -r value </dev/tty
  echo "${value:-$default}"
}

ask_secret() {
  local label="$1" value confirm
  while true; do
    printf "${CYAN}[srijan]${RESET} %s: " "$label" >/dev/tty
    read -rs value </dev/tty
    echo >/dev/tty
    printf "${CYAN}[srijan]${RESET} Confirm %s: " "$label" >/dev/tty
    read -rs confirm </dev/tty
    echo >/dev/tty
    if [[ "$value" == "$confirm" ]]; then
      break
    fi
    warn "Values do not match. Try again." >/dev/tty
  done
  echo "$value"
}

echo
echo -e "${BOLD}Srijan — Cloud AI Development Environment${RESET}"
echo

# ── Dependency checks ──────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  error "Docker is not installed. Install it from https://docs.docker.com/engine/install/ and re-run."
fi

if ! docker compose version &>/dev/null 2>&1; then
  error "Docker Compose plugin not found. Install it from https://docs.docker.com/compose/install/ and re-run."
fi

if ! command -v openssl &>/dev/null; then
  error "openssl is not installed. Install it (e.g. apt install openssl / dnf install openssl) and re-run."
fi

info "Docker: $(docker --version)"
info "Docker Compose: $(docker compose version --short)"
echo

DOMAIN=$(ask "Domain (e.g. dev.example.com)")
TLS_MODE=$(ask "TLS termination — caddy (auto HTTPS) or external (LB handles TLS)" "caddy")
[[ "$TLS_MODE" != "caddy" && "$TLS_MODE" != "external" ]] && error "TLS mode must be 'caddy' or 'external'."
if [[ "$TLS_MODE" == "caddy" ]]; then
  EMAIL=$(ask "Email for Let's Encrypt TLS certificate")
else
  EMAIL=""
fi
PASSWORD=$(ask_secret "Admin password")
INSTALL_DIR=$(ask "Install directory" "$(pwd)/srijan")
echo

# ── Validation ─────────────────────────────────────────────────────────────────
[[ -z "$DOMAIN"   ]] && error "Domain is required."
[[ -z "$PASSWORD" ]] && error "Password is required."
[[ ${#PASSWORD} -lt 8 ]] && error "Password must be at least 8 characters."
[[ "$TLS_MODE" == "caddy" && -z "$EMAIL" ]] && error "Email is required for Caddy-managed TLS."

info "Domain: ${DOMAIN}  TLS: ${TLS_MODE}  Install dir: ${INSTALL_DIR}"
echo

# ── Write deployment files ─────────────────────────────────────────────────────
info "Writing deployment files to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR/caddy"

cat > "$INSTALL_DIR/docker-compose.yml" <<'COMPOSE'
services:
  caddy:
    image: caddy:2-alpine
    container_name: srijan-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./caddy/data:/data
      - ./caddy/config:/config
    environment:
      - SRIJAN_DOMAIN=${SRIJAN_DOMAIN:-localhost}
      - ACME_EMAIL=${ACME_EMAIL:-}
    networks:
      - srijan
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 128M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  platform:
    image: ghcr.io/anoop-dhiman/srijan-platform:latest
    container_name: srijan-platform
    restart: unless-stopped
    expose:
      - "8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./workspaces:/workspaces
      - ./data:/data
    environment:
      - PORT=8080
      - SRIJAN_ADMIN_PASSWORD=${SRIJAN_ADMIN_PASSWORD:?SRIJAN_ADMIN_PASSWORD is required}
      - SRIJAN_JWT_SECRET=${SRIJAN_JWT_SECRET:?SRIJAN_JWT_SECRET is required}
      - SRIJAN_SECRETS_KEY=${SRIJAN_SECRETS_KEY:?SRIJAN_SECRETS_KEY is required}
      - SRIJAN_DATA_DIR=/data
      - WORKSPACE_ROOT=/workspaces
      - SRIJAN_DOMAIN=${SRIJAN_DOMAIN:-localhost}
      - SRIJAN_ORIGIN=${SRIJAN_ORIGIN:-}
      - CADDY_ADMIN_URL=http://caddy:2019
    depends_on:
      - caddy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - srijan
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 1G
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"

networks:
  srijan:
    driver: bridge
COMPOSE

if [[ "$TLS_MODE" == "caddy" ]]; then
  cat > "$INSTALL_DIR/caddy/Caddyfile" <<'CADDYFILE'
# Caddy-managed TLS — auto HTTPS via Let's Encrypt
{
	email {$ACME_EMAIL:}
}

http://{$SRIJAN_DOMAIN:localhost} {
	redir https://{host}{uri} permanent
}

{$SRIJAN_DOMAIN:localhost} {
	header {
		X-Frame-Options "DENY"
		X-Content-Type-Options "nosniff"
		X-XSS-Protection "1; mode=block"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
		Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; font-src 'self' data:"
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		-Server
	}

	handle /forge/* {
		reverse_proxy srijan-platform:8080
	}

	handle /forge {
		reverse_proxy srijan-platform:8080
	}

	handle /api/* {
		reverse_proxy srijan-platform:8080
	}

	handle /health {
		reverse_proxy srijan-platform:8080
	}

	handle {
		reverse_proxy srijan-platform:8080
	}
}
CADDYFILE
else
  cat > "$INSTALL_DIR/caddy/Caddyfile" <<'CADDYFILE'
# External TLS termination — TLS handled by upstream load balancer.
# Caddy receives plain HTTP on port 80. No cert management.
{
	auto_https off
	servers {
		# Trust X-Forwarded-* headers from the upstream LB
		trusted_proxies static private_ranges
	}
}

http://{$SRIJAN_DOMAIN:localhost} {
	header {
		X-Frame-Options "DENY"
		X-Content-Type-Options "nosniff"
		X-XSS-Protection "1; mode=block"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
		Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; font-src 'self' data:"
		-Server
	}

	handle /forge/* {
		reverse_proxy srijan-platform:8080
	}

	handle /forge {
		reverse_proxy srijan-platform:8080
	}

	handle /api/* {
		reverse_proxy srijan-platform:8080
	}

	handle /health {
		reverse_proxy srijan-platform:8080
	}

	handle {
		reverse_proxy srijan-platform:8080
	}
}
CADDYFILE
fi

success "Deployment files written."

# ── Pull platform image ────────────────────────────────────────────────────────
info "Pulling platform image..."
docker pull "$IMAGE_NAME"
success "Platform image pulled."
echo

# ── Generate / preserve secrets ────────────────────────────────────────────────
ENV_FILE="$INSTALL_DIR/.env"

gen_secret() {
  openssl rand -base64 48 | tr -d '\n/+=' | head -c 64
}

gen_key32() {
  openssl rand -base64 32 | tr -d '\n/+=' | head -c 32
}

write_env() {
  cat > "$ENV_FILE" <<EOF
# Srijan — generated by setup.sh on $(date -u '+%Y-%m-%d %H:%M UTC')
SRIJAN_DOMAIN=${DOMAIN}
SRIJAN_ADMIN_PASSWORD=${PASSWORD}
SRIJAN_JWT_SECRET=${JWT_SECRET}
SRIJAN_SECRETS_KEY=${SECRETS_KEY}
SRIJAN_DATA_DIR=/data
WORKSPACE_ROOT=/workspaces
CADDY_ADMIN_URL=http://caddy:2019
ACME_EMAIL=${EMAIL}
TLS_MODE=${TLS_MODE}
EOF
  chmod 600 "$ENV_FILE"
}

if [[ -f "$ENV_FILE" ]]; then
  warn ".env already exists — preserving existing secrets, updating domain/email/password."
  JWT_SECRET=$(grep '^SRIJAN_JWT_SECRET=' "$ENV_FILE" | cut -d= -f2- || true)
  SECRETS_KEY=$(grep '^SRIJAN_SECRETS_KEY=' "$ENV_FILE" | cut -d= -f2- || true)
  if [[ -z "$JWT_SECRET" || -z "$SECRETS_KEY" ]]; then
    error "Could not read existing secrets from $ENV_FILE. Delete it to regenerate, or fix it manually."
  fi
  write_env
  success "Secrets preserved. Domain/email/password updated."
else
  info "Generating secrets..."
  JWT_SECRET=$(gen_secret)
  SECRETS_KEY=$(gen_key32)
  write_env
  success "Secrets written to $ENV_FILE"
fi
echo

# ── Start services ─────────────────────────────────────────────────────────────
info "Starting Srijan services..."
docker compose -f "$INSTALL_DIR/docker-compose.yml" \
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
  printf '.' >&2
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
echo -e "  Stop:     ${YELLOW}docker compose -f ${INSTALL_DIR}/docker-compose.yml down${RESET}"
echo -e "  Update:   ${YELLOW}docker pull ${IMAGE_NAME} && docker compose -f ${INSTALL_DIR}/docker-compose.yml --env-file ${ENV_FILE} up -d${RESET}"
echo
warn "Configure your LLM provider at: https://${DOMAIN}/forge (Settings)"
echo
