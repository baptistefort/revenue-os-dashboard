# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM ${NODE_IMAGE} AS builder
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS runner
WORKDIR /workspace

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    HOME=/tmp

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /tmp nextjs

COPY --from=builder --chown=nextjs:nodejs /workspace/public ./public
COPY --from=builder --chown=nextjs:nodejs /workspace/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
