ARG BASE_APP_IMAGE=node:22.19.0-alpine3.22
FROM ${BASE_APP_IMAGE}

WORKDIR /app
RUN if [ -d node_modules ] && [ -f package-lock.json ]; then sha256sum package-lock.json | cut -d " " -f 1 > /tmp/guidance-dependency-lock.sha; fi
COPY package.json package-lock.json ./
COPY onchain/package.json onchain/package.json
COPY offchain/package.json offchain/package.json
COPY ui/package.json ui/package.json
RUN if [ -d node_modules ] && [ -f /tmp/guidance-dependency-lock.sha ] && [ "$(sha256sum package-lock.json | cut -d " " -f 1)" = "$(cat /tmp/guidance-dependency-lock.sha)" ]; then echo "Reusing dependencies verified against the exact lockfile"; else npm ci --no-audit --no-fund --fetch-retries=5; fi

COPY onchain onchain
COPY offchain offchain
COPY ui ui
COPY docs/protocol docs/protocol
ENV DEYE_LOCAL_SOLC=1
RUN npm run build --workspace onchain && npm run build --workspace offchain && npm run build --workspace ui

EXPOSE 4174
CMD ["npm", "run", "dev:revenue", "--workspace", "ui"]
