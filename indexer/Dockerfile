# BitBoard read-through indexer
# Build from the repo root:  docker build -f indexer/Dockerfile -t bitboard-indexer .
# Run:                       docker run -p 8090:8090 bitboard-indexer
FROM node:20-alpine

WORKDIR /app

# Only the two runtime deps the indexer needs — no full app install.
RUN npm install --no-save --omit=dev nostr-tools@^2.18.2 ws@^8.18.0

COPY indexer/bitboard-indexer.mjs ./bitboard-indexer.mjs

ENV BITBOARD_INDEXER_PORT=8090
EXPOSE 8090

# Unprivileged user
USER node

CMD ["node", "bitboard-indexer.mjs"]
