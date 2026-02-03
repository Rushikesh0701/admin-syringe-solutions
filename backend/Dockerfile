# Stage 1: Build dependencies
FROM node:18-slim AS builder

WORKDIR /app

# Copy package files and install all dependencies (including dev)
COPY package*.json ./
RUN npm ci

# Stage 2: Production image
FROM node:18-slim

# Create non-root user for security
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY --chown=nodejs:nodejs . .

# Create data directory if needed
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

# Switch to non-root user
USER nodejs

# Expose backend port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Start the server
CMD ["node", "server.js"]
