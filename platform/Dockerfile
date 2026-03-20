FROM node:22-alpine AS builder

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
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/server.js"]
