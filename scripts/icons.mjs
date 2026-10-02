// Generates the PNG icons from public/icons/icon.svg (run: node scripts/icons.mjs)
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg');
const out = 'public/icons/';
await sharp(svg).resize(180, 180).png().toFile(out + 'icon-180.png');
await sharp(svg).resize(180, 180).flatten({ background: '#FFFDF7' }).png().toFile(out + 'apple-touch-icon.png');
await sharp(svg).resize(192, 192).png().toFile(out + 'icon-192.png');
await sharp(svg).resize(512, 512).png().toFile(out + 'icon-512.png');
// maskable: content inside the 80% safe zone on a full-bleed background
const inner = await sharp(svg).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#FFFDF7' } })
  .composite([{ input: inner, top: 56, left: 56 }])
  .png()
  .toFile(out + 'icon-maskable-512.png');
console.log('icons ok');
