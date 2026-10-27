FROM node:22.19.0-alpine3.22

WORKDIR /app
COPY package.json package-lock.json ./
COPY onchain/package.json onchain/package.json
COPY offchain/package.json offchain/package.json
COPY ui/package.json ui/package.json
RUN npm ci

COPY onchain onchain
COPY offchain offchain
COPY ui ui
COPY docs/protocol docs/protocol
ENV DEYE_LOCAL_SOLC=1
RUN npm run build --workspace onchain && npm run build --workspace offchain && npm run build --workspace ui

EXPOSE 4174
CMD ["npm", "run", "dev:revenue", "--workspace", "ui"]
