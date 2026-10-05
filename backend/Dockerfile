FROM node:22-alpine

WORKDIR /app

# Copy workspace manifests and lockfile first for reproducible dependency installation.
COPY package.json package-lock.json .npmrc ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json

# Skip lifecycle scripts until the shared workspace sources/config are present.
RUN npm ci --ignore-scripts

COPY tsconfig.base.json eslint.config.js .prettierrc.json ./
COPY backend backend
COPY shared shared

RUN npm run build -w shared

# Prisma generate only needs a syntactically valid PostgreSQL URL during image build.
# Runtime DATABASE_URL is supplied by docker-compose.
ENV DATABASE_URL=postgresql://leetsync:leetsync@postgres:5432/leetsync?schema=public

RUN npm run prisma:generate -w backend

CMD ["npm", "run", "dev:api"]
