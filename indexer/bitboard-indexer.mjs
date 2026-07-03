#!/usr/bin/env node
/**
 * Optional BitBoard read-through indexer: HTTP API that queries the same Nostr filters as the client.
 *
 * Usage: BITBOARD_INDEXER_PORT=8090 node indexer/bitboard-indexer.mjs
 * Client: VITE_BITBOARD_INDEXER_URL=http://localhost:8090
 *
 * GET /health -> { ok: true }
 * GET /v1/posts?limit=50&boardId=b-tech&until=1234567890
 */
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { WebSocket } from 'ws';
import { SimplePool } from 'nostr-tools';

globalThis.WebSocket = WebSocket;

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://nostr.wine',
  'wss://relay.nostr.info',
  'wss://relay.primal.net',
];

const RELAYS = process.env.BITBOARD_INDEXER_RELAYS
  ? process.env.BITBOARD_INDEXER_RELAYS.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : DEFAULT_RELAYS;

const PORT = Number(process.env.BITBOARD_INDEXER_PORT || '8090') || 8090;
const QUERY_TIMEOUT_MS = Number(process.env.BITBOARD_INDEXER_QUERY_MS || '12000') || 12000;
const CACHE_TTL_MS = Number(process.env.BITBOARD_INDEXER_CACHE_MS || '60000') || 60000;
const CACHE_MAX_ENTRIES = 500;

const pool = new SimplePool();

// Response cache: without it every page load fans out to all relays.
// Keyed by the canonical filter params; in-flight dedup prevents a stampede
// of identical queries while the first one is still resolving.
const responseCache = new Map(); // key -> { at, events }
const inFlight = new Map(); // key -> Promise<events>

function cacheKey(searchParams) {
  const keys = ['limit', 'boardId', 'boardAddress', 'geohash', 'until'];
  return keys.map((k) => `${k}=${searchParams.get(k) ?? ''}`).join('&');
}

function pruneCache() {
  if (responseCache.size <= CACHE_MAX_ENTRIES) return;
  // Drop oldest entries first
  const entries = [...responseCache.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [key] of entries.slice(0, responseCache.size - CACHE_MAX_ENTRIES)) {
    responseCache.delete(key);
  }
}

function buildFilter(searchParams) {
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') || '50') || 50));
  const boardId = searchParams.get('boardId') || undefined;
  const boardAddress = searchParams.get('boardAddress') || undefined;
  const geohash = searchParams.get('geohash') || undefined;
  const untilRaw = searchParams.get('until');
  const until = untilRaw ? Number(untilRaw) : undefined;

  const filter = {
    kinds: [1],
    limit,
    '#client': ['bitboard'],
  };
  if (boardId) filter['#board'] = [boardId];
  if (boardAddress) filter['#a'] = [boardAddress];
  if (geohash) filter['#g'] = [geohash];
  if (until !== undefined && Number.isFinite(until)) filter.until = until;
  return filter;
}

async function handlePosts(searchParams) {
  const key = cacheKey(searchParams);

  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.events;
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const filter = buildFilter(searchParams);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('query timeout')), QUERY_TIMEOUT_MS),
    );
    const events = await Promise.race([pool.querySync(RELAYS, filter), timeout]);
    responseCache.set(key, { at: Date.now(), events });
    pruneCache();
    return events;
  })();

  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const jsonHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, jsonHeaders);
      res.end(JSON.stringify({ ok: true, relays: RELAYS.length }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/posts') {
      const events = await handlePosts(url.searchParams);
      res.writeHead(200, jsonHeaders);
      res.end(JSON.stringify({ events }));
      return;
    }

    res.writeHead(404, jsonHeaders);
    res.end(JSON.stringify({ error: 'not_found' }));
  } catch (e) {
    res.writeHead(500, jsonHeaders);
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
});

server.listen(PORT, () => {
  console.log(`BitBoard indexer listening on http://127.0.0.1:${PORT} (${RELAYS.length} relays)`);
});
