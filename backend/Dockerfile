FROM node:22-alpine

WORKDIR /app

# Copy workspace manifests and lockfile first for reproducible dependency installation.
COPY package.json package-lock.json .npmrc ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json

# The root package has a postinstall hook that builds the shared package.
# During the image dependency layer, the shared source/config has not been copied yet,
# so skip lifecycle scripts and run the build explicitly after copying the source.
RUN npm ci --ignore-scripts

COPY tsconfig.base.json eslint.config.js .prettierrc.json ./
COPY backend backend
COPY shared shared

RUN npm run build -w shared

# Prisma generate only needs a syntactically valid PostgreSQL URL during image build.
# Runtime DATABASE_URL is supplied by docker-compose.
ENV DATABASE_URL=postgresql://leetsync:leetsync@postgres:5432/leetsync?schema=public

RUN npm run db:generate -w backend

CMD ["npm", "run", "dev:api"]
