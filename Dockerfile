FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS final
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Bootstrap static game content (leagues, squads, logos, kits) into the image
RUN cp -R src/example_data/. src/Data/

ENV NODE_ENV=production
ENV PORT=3000

# Runtime-writable state (game saves + auth DB) lives here, separate from the
# static content above. Mount a PERSISTENT volume at this path in production
# (e.g. in Dokploy) so saves and logins survive redeploys.
ENV RUNTIME_DATA_DIR=/app/persistent
RUN mkdir -p /app/persistent
VOLUME ["/app/persistent"]

EXPOSE 3000

CMD ["bun", "src/index.ts"]
