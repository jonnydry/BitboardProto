#!/usr/bin/env node
/**
 * OG Image Generator for BitBoard
 * Produces public/og-image.png (1200x630) using sharp + inline SVG
 *
 * Usage: node scripts/generate-og-image.mjs
 * Or:    npm run og-image
 *
 * Requires: sharp (install with `npm install --save-dev sharp`)
 */

/* globals console, process, Buffer */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('sharp is not installed. Run: npm install --save-dev sharp');
  process.exit(1);
}

const WIDTH = 1200;
const HEIGHT = 630;

// Scanline SVG pattern — subtle horizontal lines
const scanlines = Array.from(
  { length: Math.ceil(HEIGHT / 4) },
  (_, i) => `<rect x="0" y="${i * 4}" width="${WIDTH}" height="1" fill="#ffffff" opacity="0.03" />`,
).join('');

const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#000000" />

  <!-- Scanlines -->
  ${scanlines}

  <!-- Border frame -->
  <rect x="24" y="24" width="${WIDTH - 48}" height="${HEIGHT - 48}" fill="none" stroke="#ffb000" stroke-width="2" opacity="0.4" />
  <!-- Corner accents -->
  <polyline points="24,40 24,24 40,24" fill="none" stroke="#ffb000" stroke-width="3"/>
  <polyline points="${WIDTH - 40},24 ${WIDTH - 24},24 ${WIDTH - 24},40" fill="none" stroke="#ffb000" stroke-width="3"/>
  <polyline points="24,${HEIGHT - 40} 24,${HEIGHT - 24} 40,${HEIGHT - 24}" fill="none" stroke="#ffb000" stroke-width="3"/>
  <polyline points="${WIDTH - 40},${HEIGHT - 24} ${WIDTH - 24},${HEIGHT - 24} ${WIDTH - 24},${HEIGHT - 40}" fill="none" stroke="#ffb000" stroke-width="3"/>

  <!-- Main title -->
  <text
    x="${WIDTH / 2}"
    y="260"
    font-family="'Courier New', Courier, monospace"
    font-size="120"
    font-weight="bold"
    fill="#ffb000"
    text-anchor="middle"
    letter-spacing="12"
  >BITBOARD</text>

  <!-- Subtitle -->
  <text
    x="${WIDTH / 2}"
    y="330"
    font-family="'Courier New', Courier, monospace"
    font-size="22"
    fill="#ffb000"
    text-anchor="middle"
    letter-spacing="8"
    opacity="0.7"
  >DECENTRALIZED · NOSTR PROTOCOL</text>

  <!-- Divider -->
  <line x1="200" y1="370" x2="${WIDTH - 200}" y2="370" stroke="#ffb000" stroke-width="1" opacity="0.3"/>

  <!-- Tagline -->
  <text
    x="${WIDTH / 2}"
    y="430"
    font-family="'Courier New', Courier, monospace"
    font-size="18"
    fill="#ffb000"
    text-anchor="middle"
    letter-spacing="6"
    opacity="0.5"
  >0 servers · your keys · open protocol</text>
</svg>
`.trim();

const outputPath = join(__dirname, '..', 'public', 'og-image.png');

console.log('Generating OG image...');
sharp(Buffer.from(svg))
  .png()
  .toFile(outputPath)
  .then(() => console.log(`✓ Written to ${outputPath}`))
  .catch((err) => {
    console.error('Failed to generate OG image:', err.message);
    process.exit(1);
  });
