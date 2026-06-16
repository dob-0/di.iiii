# Build from repo root: docker build -f serverXR/Dockerfile -t dii-server .
FROM node:22-alpine

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
