FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
# The approved WSC engine is retained as an ES module, unchanged.
RUN npm run build \
    && mkdir -p dist/wsc/vendor/tools \
    && cp -R src/wsc/vendor/tools/wsc-vs1 dist/wsc/vendor/tools/ \
    && cp -R src/wsc/vendor/tools/wsc-phase2a dist/wsc/vendor/tools/ \
    && cp -R src/wsc/vendor/tools/wsc-phase2b dist/wsc/vendor/tools/ \
    && cp -R src/wsc/vendor/tools/wsc-phase2c dist/wsc/vendor/tools/

FROM node:24-trixie-slim AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Migrations are a separate, manually approved job; never run at startup.
FROM node:24-trixie-slim AS migration
WORKDIR /app
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
ENV NODE_ENV=production
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations/*.sql ./migrations/
USER node
CMD ["node", "dist/db/migrateCli.js"]

FROM node:24-trixie-slim AS runtime
WORKDIR /app
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=production-deps /app/node_modules ./node_modules
# The WSC and existing reports use chromium.launch({ headless: true }) without a channel.
# Playwright --with-deps also installs Xvfb (used by headed tests), which is not
# needed for the headless-only PDF renderer. Remove the X server, retain native libs.
# Preserve Japanese PDF fonts; test the actual headless PDF before release.
RUN mkdir -p /ms-playwright \
    && apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends fonts-noto-cjk fontconfig \
    && node ./node_modules/playwright/cli.js install --with-deps --only-shell chromium \
    && apt-get purge -y xvfb xserver-common \
    && apt-get autoremove -y --purge \
    && test ! -x /usr/bin/Xvfb \
    && fc-cache -f \
    && chmod -R a+rX /ms-playwright \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/dist ./dist
COPY public ./public
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
