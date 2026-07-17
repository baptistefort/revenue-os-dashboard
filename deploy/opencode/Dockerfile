# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /workspace/ops
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM ${NODE_IMAGE} AS runner
WORKDIR /workspace/ops

ENV NODE_ENV=production \
    HOME=/home/opencode

RUN groupadd --system --gid 1002 opencode \
    && useradd --system --uid 1002 --gid opencode \
      --create-home --home-dir /home/opencode opencode \
    && mkdir -p \
      /home/opencode/.cache/opencode \
      /home/opencode/.config/opencode \
      /home/opencode/.local/share/opencode \
      /home/opencode/.local/state/opencode \
    && chown -R opencode:opencode /home/opencode

COPY --from=dependencies /workspace/ops/node_modules ./node_modules
COPY --chown=opencode:opencode package.json package-lock.json opencode.json tsconfig.json ./
COPY --chown=opencode:opencode .opencode ./.opencode
COPY --chown=opencode:opencode lib ./lib
COPY --chown=opencode:opencode scripts/start-opencode.mjs ./scripts/start-opencode.mjs
COPY --chown=opencode:opencode scripts/seed-obsidian.mjs ./scripts/seed-obsidian.mjs
COPY --chown=opencode:opencode scripts/seed-central-memory.ts ./scripts/seed-central-memory.ts
COPY --chown=opencode:opencode scripts/project-central-memory.ts ./scripts/project-central-memory.ts

USER opencode
EXPOSE 4096

CMD ["node", "scripts/start-opencode.mjs"]
