# syntax=docker/dockerfile:1

# Stage 1: Build standalone Linux crawler node binary
FROM oven/bun:1-alpine AS builder
WORKDIR /workspace

# Copy dependencies and source trees
COPY src-package/ ./src-package/
COPY src-crawler/ ./src-crawler/

WORKDIR /workspace/src-crawler
RUN bun install
RUN bun run build:node:linux

# Stage 2: Minimal hardened runtime image
FROM alpine:3.20 AS runner
RUN apk add --no-cache ca-certificates tzdata

# Create unprivileged runner user
RUN addgroup -S vrcgroup && adduser -S vrcuser -G vrcgroup

WORKDIR /app
COPY --from=builder /workspace/src-crawler/dist/local-node/vrc-node-linux /app/vrc-node
RUN chmod +x /app/vrc-node && chown -R vrcuser:vrcgroup /app

# Volume directory for persistent SQLite database and node configuration
RUN mkdir -p /app/data && chown -R vrcuser:vrcgroup /app/data
VOLUME ["/app/data"]
WORKDIR /app/data

USER vrcuser

ENTRYPOINT ["/app/vrc-node"]
