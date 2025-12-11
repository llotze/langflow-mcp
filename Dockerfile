FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install ALL dependencies (including dev) for build
RUN npm ci

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

# ✅ Don't hardcode port - Railway provides it via $PORT
# Expose port (Railway ignores this, uses $PORT)
EXPOSE 3001

# ✅ Railway will set $PORT automatically
CMD ["node", "dist/api/server.js"]
