FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libreoffice \
        libreoffice-l10n-ko \
        fonts-nanum \
        fonts-noto-cjk \
        ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# package-lock.json 있으면 npm ci (재현 빌드), 없으면 install로 폴백
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --no-audit --no-fund; \
    else \
      npm install --omit=dev --no-audit --no-fund; \
    fi

COPY server.js ./

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Render는 자체 healthCheckPath로 띄우는데, 도커 단독 실행 디버깅용 healthcheck도 박아둠
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
