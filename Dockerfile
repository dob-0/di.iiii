# Build from repo root: docker build -t dii-client .
# Stage 1: build the Vite/React app
# Pinned by digest (audit #26): a floating tag can silently change under us on
# rebuild; re-pin deliberately (see docs/deploy/VPS_DOCKER_DEPLOY.md) rather than
# letting the base image drift. Tag kept alongside the digest for readability.
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_API_BASE_URL is empty by default so all API calls use relative paths.
# nginx (stage 2) then proxies /serverXR/* to the backend container.
# Override only if you are serving client and server on different origins.
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# Stage 2: serve with nginx
FROM nginx:alpine@sha256:7068961d45b07b2af510ac002e9daa63a1d3eba2111202d6768798690800fffd
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
