#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const SVG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a1a"/>
      <stop offset="100%" style="stop-color:#0a0a0a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="100" fill="url(#bg)"/>
  <g transform="translate(56, 80)">
    <path d="M350 180H50c-11 0-20-9-20-20v-80c0-11 9-20 20-20h280l40 60-20 60z" fill="#facc15"/>
    <rect x="30" y="140" width="300" height="60" rx="8" fill="#facc15"/>
    <path d="M280 60h50l50 75v25h-100V60z" fill="#d4a90a"/>
    <rect x="290" y="75" width="30" height="40" rx="4" fill="#87ceeb" opacity="0.8"/>
    <circle cx="100" cy="200" r="35" fill="#333"/>
    <circle cx="100" cy="200" r="20" fill="#666"/>
    <circle cx="280" cy="200" r="35" fill="#333"/>
    <circle cx="280" cy="200" r="20" fill="#666"/>
    <rect x="60" y="110" width="40" height="50" rx="4" fill="#d4a90a"/>
    <rect x="110" y="110" width="40" height="50" rx="4" fill="#d4a90a"/>
    <rect x="160" y="110" width="40" height="50" rx="4" fill="#d4a90a"/>
  </g>
  <g transform="translate(320, 260)">
    <ellipse cx="60" cy="180" rx="40" ry="15" fill="#000" opacity="0.3"/>
    <path d="M60 20c-33 0-55 25-55 55 0 40 55 110 55 110s55-70 55-110c0-30-22-55-55-55z" fill="#ef4444"/>
    <circle cx="60" cy="75" r="22" fill="#fff"/>
    <circle cx="60" cy="75" r="12" fill="#ef4444"/>
  </g>
</svg>`;

const SIZES = [512, 192, 180, 167, 152, 120, 32, 16];
const VERSION = 'v3';

const outputDir = path.join(process.cwd(), 'client', 'public', 'pwa');

async function generateIcons() {
  console.log('[generate-pwa-icons] Starting icon generation...');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`[generate-pwa-icons] Created directory: ${outputDir}`);
  }
  
  const svgPath = path.join(outputDir, `pingpoint-icon-${VERSION}.svg`);
  fs.writeFileSync(svgPath, SVG_ICON);
  console.log(`[generate-pwa-icons] Wrote SVG: ${svgPath}`);
  
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch (err) {
    console.warn('[generate-pwa-icons] sharp not available, skipping PNG generation');
    console.warn('[generate-pwa-icons] To generate PNGs, install sharp: npm install sharp');
    console.log('[generate-pwa-icons] SVG saved successfully. iOS requires PNG, so manually convert the SVG.');
    return;
  }
  
  const svgBuffer = Buffer.from(SVG_ICON);
  
  for (const size of SIZES) {
    try {
      const pngPath = path.join(outputDir, `pingpoint-icon-${size}-${VERSION}.png`);
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(pngPath);
      console.log(`[generate-pwa-icons] Generated: ${pngPath}`);
      
      if (size >= 192) {
        const maskablePath = path.join(outputDir, `pingpoint-icon-${size}-${VERSION}-maskable.png`);
        const padding = Math.round(size * 0.1);
        const innerSize = size - (padding * 2);
        
        const paddedBuffer = await sharp(svgBuffer)
          .resize(innerSize, innerSize)
          .extend({
            top: padding,
            bottom: padding,
            left: padding,
            right: padding,
            background: { r: 10, g: 10, b: 12, alpha: 1 }
          })
          .png()
          .toBuffer();
        
        await sharp(paddedBuffer).toFile(maskablePath);
        console.log(`[generate-pwa-icons] Generated maskable: ${maskablePath}`);
      }
    } catch (err) {
      console.error(`[generate-pwa-icons] Failed to generate ${size}px: ${err.message}`);
    }
  }
  
  const appleTouchSrc = path.join(outputDir, `pingpoint-icon-180-${VERSION}.png`);
  const appleTouchDest = path.join(process.cwd(), 'client', 'public', 'apple-touch-icon.png');
  if (fs.existsSync(appleTouchSrc)) {
    fs.copyFileSync(appleTouchSrc, appleTouchDest);
    console.log(`[generate-pwa-icons] Copied apple-touch-icon.png`);
  }
  
  console.log('[generate-pwa-icons] Done!');
}

generateIcons().catch(console.error);
