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
RUN npm run db:generate -w backend
CMD ["npm", "run", "dev:api"]
