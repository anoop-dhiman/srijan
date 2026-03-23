#!/usr/bin/env bash
# Srijan — one-command setup script
# Usage: curl -sL https://raw.githubusercontent.com/anoop-dhiman/srijan/refs/heads/master/deployment/setup.sh | bash -s -- --domain dev.example.com --email me@example.com --password mypass
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
INSTALL_DIR="${HOME}/srijan"
IMAGE_NAME="ghcr.io/anoop-dhiman/srijan-platform:latest"

# ── Argument parsing ───────────────────────────────────────────────────────────
usage() {
  echo "Usage: $0 --domain <domain> --email <email> --password <password> [--dir <install-dir>]"
  echo
  echo "Options:"
  echo "  --domain    Domain name for the Srijan UI (e.g. dev.example.com)"
  echo "  --email     Email for Let's Encrypt TLS certificate"
  echo "  --password  Admin login password"
  echo "  --dir       Install directory (default: ~/srijan)"
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
info "Docker Compose: $(docker compose version)"

# ── Write deployment files ─────────────────────────────────────────────────────
info "Writing deployment files to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR/deployment/caddy"

cat > "$INSTALL_DIR/deployment/docker-compose.yml" <<'EOF'
version: "3.8"

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
      - caddy_data:/data
      - caddy_config:/config
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
      - srijan_workspaces:/workspaces
      - srijan_data:/data
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

volumes:
  caddy_data:
  caddy_config:
  srijan_workspaces:
  srijan_data:

networks:
  srijan:
    driver: bridge
EOF

cat > "$INSTALL_DIR/deployment/caddy/Caddyfile" <<'EOF'
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
EOF

success "Deployment files written."

# ── Pull platform image ────────────────────────────────────────────────────────
info "Pulling platform image..."
docker pull "$IMAGE_NAME"
success "Platform image pulled."

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
echo -e "  Update:   ${YELLOW}docker pull ${IMAGE_NAME} && docker compose -f ${INSTALL_DIR}/deployment/docker-compose.yml --env-file ${ENV_FILE} up -d${RESET}"
echo
warn "Configure your LLM provider at: https://${DOMAIN}/forge (Settings)"
echo
