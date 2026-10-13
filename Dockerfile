# One image for both AWS services: the API (+ built UI) and the scraping worker.
#   API:    docker run … image                       (WORKER_MODE=off)
#   Worker: docker run … image node src/apps/worker/main.js
# Base image already contains Chromium, its system libraries and Xvfb, matching playwright@1.64.0.
# Both stages use the same Microsoft (MCR) image: one download, and no Docker Hub rate limits in CI.

FROM mcr.microsoft.com/playwright:v1.64.0-noble AS client
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --workspace client --include-workspace-root=false
COPY client client
RUN npm run build --workspace client

FROM mcr.microsoft.com/playwright:v1.64.0-noble AS runtime
ENV NODE_ENV=production \
    HEADLESS=true \
    WORKER_MODE=off \
    PORT=4000 \
    SERVE_CLIENT_DIR=/app/client/dist \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server --include-workspace-root=false && npm cache clean --force
COPY server server
COPY --from=client /app/client/dist client/dist
COPY docker/entrypoint.sh /usr/local/bin/rip-entrypoint
WORKDIR /app/server
RUN chmod 755 /usr/local/bin/rip-entrypoint \
 && mkdir -p data .browser-profile /tmp/.X11-unix \
 && chmod 1777 /tmp/.X11-unix \
 && chown -R pwuser:pwuser data .browser-profile
USER pwuser
EXPOSE 4000
# USE_XVFB=1 (set on the worker) runs Chromium headed inside a virtual display.
ENTRYPOINT ["rip-entrypoint"]
CMD ["node", "src/apps/api/server.js"]
