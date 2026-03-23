# ── Node.js Production Dockerfile ──────────────────────────────
# Stage 1: deps only (cached layer)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: final image
FROM node:20-alpine
WORKDIR /app

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy production deps and source
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Remove dev files that don't belong in production
RUN rm -f .env nodemon.json

USER appuser

EXPOSE 8000

ENV NODE_ENV=production

CMD ["node", "server.js"]
