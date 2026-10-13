FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --ignore-scripts

COPY tsconfig.base.json eslint.config.js .prettierrc.json ./
COPY backend backend
COPY shared shared

# Prisma generation only needs a syntactically valid database URL.
ENV DATABASE_URL=postgresql://leetsync:leetsync@postgres:5432/leetsync?schema=public
RUN npm run prisma:generate -w backend
RUN npm run build -w shared && npm run build -w backend

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --omit=optional --ignore-scripts \
  && test ! -d node_modules/prisma \
  && npm cache clean --force

COPY --from=build --chown=node:node /app/backend/dist backend/dist
COPY --from=build --chown=node:node /app/shared/dist shared/dist

USER node
EXPOSE 3000
CMD ["node", "backend/dist/server.js"]
