FROM node:22-alpine AS build

WORKDIR /app
ARG VITE_API_BASE_URL=http://localhost:3000
ARG VITE_EXTENSION_ID=nadlcboffmafknogdcgohdcledaomppo
ARG LEETSYNC_ALLOW_LOCAL_API_URL=false
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_EXTENSION_ID=${VITE_EXTENSION_ID}
ENV LEETSYNC_ALLOW_LOCAL_API_URL=${LEETSYNC_ALLOW_LOCAL_API_URL}

COPY package.json package-lock.json .npmrc ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --ignore-scripts

COPY tsconfig.base.json ./
COPY shared shared
COPY frontend frontend
RUN npm run build -w shared \
  && npm run build -w frontend \
  && node frontend/configure-nginx.mjs

FROM nginx:alpine
COPY --from=build /app/frontend/nginx.conf.generated /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
