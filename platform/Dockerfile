FROM node:22-alpine AS builder

# node-pty requires native compilation
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install backend dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Build backend
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc && cp src/db/schema.sql dist/db/schema.sql

# Install and build frontend
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci

COPY web/ ./web/
RUN cd web && npx vite build

# Production image
FROM node:22-alpine

RUN apk add --no-cache curl docker-cli git

WORKDIR /app

COPY package.json package-lock.json ./
# Reuse compiled native modules from builder (same base image — binaries are compatible)
COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/server.js"]
