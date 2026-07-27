# syntax=docker/dockerfile:1
# Build context = REPO ROOT (needs packages/shared, the pnpm workspace).
# Railway: set Dockerfile Path = apps/api/Dockerfile, leave Root Directory blank.

FROM node:22-slim AS build
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /app

COPY . .
# Flat node_modules inside the image → robust Prisma resolution + simple copy.
RUN echo "node-linker=hoisted" > .npmrc
# Install only the API + its workspace deps (@yachtway/shared); skips apps/web.
RUN pnpm install --frozen-lockfile --filter @yachtway/api...

RUN pnpm --filter @yachtway/shared build
RUN pnpm --filter @yachtway/api exec prisma generate
RUN pnpm --filter @yachtway/api build

# --- Runtime ---
FROM node:22-slim AS runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
# Railway injects PORT; the app reads process.env.PORT (defaults to 4000).
CMD ["node", "dist/index.js"]
