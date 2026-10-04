# syntax=docker/dockerfile:1

# Stage 1: Build standalone Linux crawler node binary
FROM oven/bun:1.4.2-alpine AS builder
WORKDIR /workspace

# Build context is src-crawler. Dependencies must be distributed artifacts.
COPY package.json ./
# CI supplies compiled, verified dependency tarballs, never sibling sources.
COPY .ci-artifacts/*.tgz ./.ci-artifacts/
RUN set -- ./.ci-artifacts/vrc-package*-api*.tgz; \
    [ "$#" -eq 1 ] && [ -f "$1" ] && \
    bun install --no-save "vrc-packages-api@file:$1" ./.ci-artifacts/vrc-packages-network-*.tgz
COPY . ./
RUN bun run build:node:musl

# Stage 2: Minimal hardened runtime image
FROM alpine:3.20 AS runner
RUN apk add --no-cache ca-certificates tzdata libstdc++ libgcc

# Create unprivileged runner user
RUN addgroup -S vrcpgroup && adduser -S vrcpuser -G vrcpgroup

WORKDIR /app
COPY --from=builder /workspace/dist/dev/vrcp-crawler-node-linux /app/vrcp-crawler-node
RUN chmod +x /app/vrcp-crawler-node && chown -R vrcpuser:vrcpgroup /app

# Volume directory for persistent SQLite database and node configuration
RUN mkdir -p /app/data && chown -R vrcpuser:vrcpgroup /app/data
VOLUME ["/app/data"]
WORKDIR /app/data

USER vrcpuser

ENTRYPOINT ["/app/vrcp-crawler-node"]
