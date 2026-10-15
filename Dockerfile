# syntax=docker/dockerfile:1.10
# The Blockout server with every app built into it. Three stages:
#   build   everything installed, then npm run build (apps/*/dist)
#   deps    only the server's production dependencies (mongodb, redis) and
#           the workspace links to @blockout/engine and @blockout/progress
#   runtime those, the server, and the built apps; no compilers, no npm cache
ARG NODE=node:26.12.0-trixie-slim@sha256:0d1e33586362bb9e608c4e751e7a9e7edb55c9ac11461ed5666af696cc461dd4

FROM ${NODE} AS build
WORKDIR /src
# package files first, so the install layer is reused until dependencies change
COPY package.json package-lock.json ./
COPY apps/ apps/
COPY packages/ packages/
RUN find apps packages -mindepth 2 -maxdepth 2 ! -name package.json -exec rm -rf {} + \
 && npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM ${NODE} AS deps
WORKDIR /app
COPY --from=build /src/package.json /src/package-lock.json ./
# (every workspace's package.json: npm ci checks them against the lock file)
COPY --from=build /src/apps/ /tmp/apps/
COPY --from=build /src/packages/ /tmp/packages/
RUN cd /tmp && find apps packages -name package.json -not -path '*/node_modules/*' -exec install -D {} /app/{} \; \
 && cd /app && npm ci --omit=dev --workspace @blockout/server --no-audit --no-fund \
 && rm -rf /tmp/apps /tmp/packages /root/.npm

FROM ${NODE} AS runtime
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Blockout" \
      org.opencontainers.image.description="Multiplication as area, for 3rd graders: the games, live classes and accounts" \
      org.opencontainers.image.source="https://github.com/DeepSpaceCartel/blockout" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.licenses="UNLICENSED"
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=deps --chown=root:root /app/ ./
COPY --from=build --chown=root:root /src/apps/server/src/ apps/server/src/
COPY --from=build --chown=root:root /src/packages/engine/src/ packages/engine/src/
COPY --from=build --chown=root:root /src/packages/progress/src/ packages/progress/src/
# the built games (apps/<name>/dist), served by the server
COPY --from=build --chown=root:root /src/apps/ /tmp/apps/
RUN cd /tmp/apps && for d in */dist; do install -d "/app/apps/$d" && cp -r "$d/." "/app/apps/$d/"; done && rm -rf /tmp/apps
# Owned by root, run as node: the server can't change its own code
USER node
EXPOSE 8080
CMD ["node", "apps/server/src/index.js"]
