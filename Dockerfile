FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Dedicated deploy job/CI step; never run migrations at service startup.
FROM node:22-alpine AS migration
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations/*.sql ./migrations/
USER node
CMD ["node", "dist/db/migrateCli.js"]

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY public ./public
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
