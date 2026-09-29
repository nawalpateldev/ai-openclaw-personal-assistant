# ==============================================================================
# OpenClaw Multi-Stage Production Dockerfile
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json tsconfig.json ./

# Install all dependencies
RUN npm ci

# Copy application source
COPY src/ ./src/
COPY public/ ./public/

# Compile TypeScript
RUN npm run build

# ------------------------------------------------------------------------------
# Production Runtime Image
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Install production-only dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled build and public assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY config/ ./config/

# Persistent data directory
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]
