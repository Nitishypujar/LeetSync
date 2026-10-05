FROM node:22-alpine

WORKDIR /app

COPY package.json .npmrc ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json

RUN npm install

COPY tsconfig.base.json eslint.config.js .prettierrc.json ./
COPY backend backend
COPY shared shared

RUN npm run build -w shared

# Prisma generate only needs a syntactically valid PostgreSQL URL during image build.
# Runtime DATABASE_URL is supplied by docker-compose.
ENV DATABASE_URL=postgresql://leetsync:leetsync@postgres:5432/leetsync?schema=public

RUN npm run db:generate -w backend

CMD ["npm", "run", "dev:api"]
