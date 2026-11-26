FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
# WSC is vendored unchanged from its completed main branch.  It remains an
# ES module because the approved engine is shared verbatim; only the Sales
# Tools adapter is TypeScript.
RUN npm run build \
    && mkdir -p dist/wsc/vendor/tools \
    && cp -R src/wsc/vendor/tools/wsc-vs1 dist/wsc/vendor/tools/ \
    && cp -R src/wsc/vendor/tools/wsc-phase2a dist/wsc/vendor/tools/ \
    && cp -R src/wsc/vendor/tools/wsc-phase2b dist/wsc/vendor/tools/ \
    && cp -R src/wsc/vendor/tools/wsc-phase2c dist/wsc/vendor/tools/

FROM node:24-bookworm-slim AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Dedicated deploy job/CI step; never run migrations at service startup.
FROM node:24-bookworm-slim AS migration
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
# Debian 13: only installed runtime packages (DSA-6657-1 libzstd; DSA-6661-1 shadow).
RUN mkdir -p /ms-playwright \
    && apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk fontconfig \
    && apt-get install -y --only-upgrade --no-install-recommends libzstd1 \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' libzstd1)" ge '1.5.7+dfsg-1+deb13u1' \
    && shadow_installed=0 \
    && for pkg in passwd uidmap libsubid5 login.defs; do \
         status="$(dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null || true)"; \
         if [ "$status" = 'install ok installed' ]; then \
           shadow_installed=$((shadow_installed + 1)); \
           apt-get install -y --only-upgrade --no-install-recommends "$pkg" || exit 1; \
           dpkg --compare-versions "$(dpkg-query -W -f='${Version}' "$pkg")" ge '1:4.17.4-2+deb13u1' || exit 1; \
         fi; \
       done \
    && test "$shadow_installed" -gt 0 \
    && rm -rf /var/lib/apt/lists/* \
    && node ./node_modules/playwright/cli.js install --with-deps --only-shell chromium \
    && fc-cache -f \
    && chmod -R a+rX /ms-playwright
# npm/npx are needed only during image assembly, not to run the Node server.
# Fail closed if the upstream Node image no longer uses the known npm path.
RUN test -d /usr/local/lib/node_modules/npm \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /app/dist ./dist
COPY public ./public
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
