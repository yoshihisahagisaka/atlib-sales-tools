FROM node:20-bookworm-slim AS build
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
RUN apt-get update \
    && apt-get install -y \
       --no-install-recommends \
       --only-upgrade \
       apt=2.6.2 \
       libapt-pkg6.0=2.6.2 \
       dpkg=1.21.23 \
       perl-base=5.36.0-7+deb12u4 \
       libc6:amd64=2.36-9+deb12u14 \
       libc-bin=2.36-9+deb12u14 \
       libcap2:amd64=1:2.66-4+deb12u3+b1 \
       libgnutls30:amd64=3.7.9-2+deb12u7 \
       libpcre2-8-0:amd64=10.42-1+deb12u2 \
    && rm -rf /var/lib/apt/lists/*
RUN rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm \
             /usr/local/bin/npx \
    && test ! -e /usr/local/lib/node_modules/npm \
    && ! command -v npm \
    && ! command -v npx
COPY --from=build /app/dist ./dist
COPY public ./public
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
