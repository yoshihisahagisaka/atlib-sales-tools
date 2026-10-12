FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Dedicated deploy job/CI step; never run migrations at service startup.
FROM node:20-bookworm-slim AS migration
WORKDIR /app
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
ENV NODE_ENV=production
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations/*.sql ./migrations/
USER node
CMD ["node", "dist/db/migrateCli.js"]

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=production-deps /app/node_modules ./node_modules
RUN mkdir -p /ms-playwright \
    && apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && node ./node_modules/playwright/cli.js install --with-deps chromium \
    && fc-cache -f \
    && chmod -R a+rX /ms-playwright
COPY --from=build /app/dist ./dist
COPY public ./public
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
