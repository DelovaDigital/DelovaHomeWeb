# DelovaHome Relay Server - Zero-Knowledge Relay
FROM node:18-alpine

# Metadata
LABEL maintainer="DelovaHome <support@delovahome.com>"
LABEL description="Zero-knowledge relay server for DelovaHome remote access"
LABEL version="1.0.0"

# Working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --only=production

# Copy relay server code
COPY relayServer.js .

# Expose relay port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Run as non-root user
RUN addgroup -g 1001 -S relay && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G relay relay && \
    chown -R relay:relay /app

USER relay

# Start server
CMD ["node", "relayServer.js"]
