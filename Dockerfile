# ---- build stage -------------------------------------------------------------
FROM node:22-bookworm-slim AS build
RUN npm install -g pnpm@10.33.0
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/* \
 && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build \
 && pnpm --filter @avrmusic/api --prod deploy --legacy /out/api \
 && cp -r apps/web/dist /out/web

# ---- runtime stage -----------------------------------------------------------
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 DATA_DIR=/data WEB_DIST=/app/web \
    PIP_BREAK_SYSTEM_PACKAGES=1
# ffmpeg: audio extraction/merge for URL imports; yt-dlp: YouTube/SoundCloud/… importer
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates tini \
 && pip3 install --no-cache-dir yt-dlp \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out/api /app/api
COPY --from=build /out/web /app/web
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/app/api/dist/server.js"]
