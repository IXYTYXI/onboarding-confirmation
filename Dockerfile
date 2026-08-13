FROM docker.1panel.live/library/node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    HOST=0.0.0.0 \
    PORT=8787 \
    DRY_RUN=0 \
    LARK_HOME=/data/lark

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# 安装飞书官方 CLI（postinstall 会拉取平台二进制；优先走 npmmirror）
RUN npm config set registry https://registry.npmmirror.com \
  && npm install -g @larksuite/cli@1.0.86 \
  && lark-cli --version

WORKDIR /app
COPY local-bridge.mjs onboarding-preview.html onion-background.png ./

RUN mkdir -p /data/lark \
  && useradd --create-home --shell /bin/bash app \
  && chown -R app:app /app /data/lark

USER app
EXPOSE 8787

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/healthz" || exit 1

CMD ["node", "local-bridge.mjs"]
