# syntax=docker/dockerfile:1

# Stage 1: Build standalone Linux crawler node binary
FROM oven/bun:1.4.2-alpine AS builder
WORKDIR /workspace
ARG VRCP_BUILD_CHANNEL
ARG VRCP_SDK_VERSION
ARG VRCP_NETWORK_VERSION

# Build context is src-crawler. Dependencies must be distributed artifacts.
COPY package.json ./
# CI supplies compiled, verified dependency tarballs, never sibling sources.
COPY .ci-artifacts/*.tgz ./.ci-artifacts/
RUN set -- ./.ci-artifacts/vrc-package*-api*.tgz; \
    [ "$#" -eq 1 ] && [ -f "$1" ] && \
    sdk_artifact="$1" && \
    set -- ./.ci-artifacts/vrc-packages-network-*.tgz && \
    [ "$#" -eq 1 ] && [ -f "$1" ] && \
    bun install --no-save "vrc-packages-api@file:$sdk_artifact" "vrc-packages-network@file:$1"
COPY . ./
RUN bun scripts/check_container_dependencies.mjs
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
ENV CRAWLER_LOGS_DIR=/app/data/logs

USER vrcpuser

ENTRYPOINT ["/app/vrcp-crawler-node"]
