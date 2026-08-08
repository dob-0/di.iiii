# Build from repo root: docker build -f serverXR/Dockerfile -t dii-server .
# Pinned by digest (audit #26): a floating tag can silently change under us on
# rebuild; re-pin deliberately (see docs/deploy/VPS_DOCKER_DEPLOY.md) rather than
# letting the base image drift. Tag kept alongside the digest for readability.
FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43

# Run as non-root user
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Install production deps first — cached unless package files change
COPY serverXR/package.json serverXR/package-lock.json ./
RUN npm ci --omit=dev

# Copy server source
COPY serverXR/src/ ./src/
COPY serverXR/public/ ./public/

# Bake in shared schema files (sceneSchema.cjs, projectSchema.cjs)
# sharedRuntime.js resolves these at /shared — no mount needed
COPY shared/ /shared/

# Release metadata for GET /api/health -- lets a deployed host self-report
# what commit is actually running (releaseInfo.js reads this from the
# WORKDIR). Defaults are placeholders for local `docker build` without
# --build-arg; the CI workflows pass the real values.
ARG GIT_COMMIT=unknown
ARG GIT_REF=unknown
ARG DEPLOY_ENV=unknown
ARG BUILD_TIME=unknown
RUN printf '{"deployEnv":"%s","sourceRef":"%s","gitCommit":"%s","releaseId":"%s","generatedAt":"%s"}\n' \
    "${DEPLOY_ENV}" "${GIT_REF}" "${GIT_COMMIT}" "${GIT_COMMIT}" "${BUILD_TIME}" > release.json

ENV NODE_ENV=production
ENV PORT=4000
ENV APP_BASE_PATH=/serverXR
ENV DATA_ROOT=/data

# /data is the only runtime-mutable path: SQLite DB + uploaded assets
VOLUME ["/data"]

RUN mkdir -p /data && chown app:app /data

USER app

EXPOSE 4000

CMD ["node", "src/index.js"]
