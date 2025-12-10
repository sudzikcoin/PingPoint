# ==============================================================================
# Stage 1: Build
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including dev deps for building)
RUN npm ci

# Copy source code
COPY . .

# Build the application (compiles server to dist/index.cjs and client to dist/public)
RUN npm run build

# ==============================================================================
# Stage 2: Production Runtime
# ==============================================================================
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
# Note: Some dependencies are bundled into dist/index.cjs by esbuild,
# but externals (like pg, drizzle, etc.) still need to be in node_modules
RUN npm ci --omit=dev && npm cache clean --force

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist

# Copy drizzle config and shared types (needed for db:push if running migrations)
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Create uploads directory for file storage
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Use non-root user for security
USER node

# Expose the port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

# Run the application
CMD ["node", "dist/index.cjs"]
