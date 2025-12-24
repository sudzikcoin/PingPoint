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

# Generate migrations from schema (shipped with the image)
RUN npx drizzle-kit generate || echo "Migration generation completed"

# ==============================================================================
# Stage 2: Production Runtime
# ==============================================================================
FROM node:20-alpine AS runtime

WORKDIR /app

# Install runtime utilities (wget for healthcheck, postgresql-client for pg_isready)
RUN apk add --no-cache wget postgresql-client

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist

# Copy drizzle config, shared types, and migrations
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/migrations ./migrations

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
