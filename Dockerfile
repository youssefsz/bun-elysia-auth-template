# ============================================
# Backend - Dockerfile
# Uses Bun runtime for blazing fast performance
# ============================================

FROM oven/bun:1-slim AS base

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source files
COPY . .

# Expose the port
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production

# Start the server
CMD ["bun", "run", "src/index.ts"]
