FROM node:22-alpine AS build

WORKDIR /app
ARG VITE_API_BASE_URL=http://localhost:3000
ARG VITE_EXTENSION_ID=nadlcboffmafknogdcgohdcledaomppo
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_EXTENSION_ID=${VITE_EXTENSION_ID}

COPY package.json package-lock.json .npmrc ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --ignore-scripts

COPY tsconfig.base.json ./
COPY shared shared
COPY frontend frontend
RUN npm run build -w shared && npm run build -w frontend

FROM nginx:alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
