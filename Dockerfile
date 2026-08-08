# Build from repo root: docker build -t dii-client .
# Stage 1: build the Vite/React app
# Pinned by digest (audit #26): a floating tag can silently change under us on
# rebuild; re-pin deliberately (see docs/deploy/VPS_DOCKER_DEPLOY.md) rather than
# letting the base image drift. Tag kept alongside the digest for readability.
FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS builder
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
# Non-root by design (audit #27): the official unprivileged variant already
# runs its master+worker processes as the `nginx` user and listens on 8080
# (an unprivileged port a non-root process can actually bind), instead of
# hand-patching the regular nginx:alpine image's root-owned cache/pid dirs
# and permissions ourselves with no way to test the result before deploy.
FROM nginxinc/nginx-unprivileged:alpine@sha256:59ccf0943b0b8e8d9e6ea9039a39555730f544701a655c596f7df7d096c593f5
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
