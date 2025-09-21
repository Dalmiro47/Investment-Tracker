// scripts/gen-icons.mjs
// Generate PWA icons from an SVG logo.
//
// Usage:
//   1) Put your SVG at public/logo.svg  (or public/logos.svg)
//   2) npm i -D sharp
//   3) npm run icons   (script: "node scripts/gen-icons.mjs")

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const CANDIDATES = ['public/logo.svg', 'public/logos.svg'];
const SRC = CANDIDATES.map((p) => path.resolve(p)).find((p) => fs.existsSync(p));

if (!SRC) {
  console.error('❌ Missing public/logo.svg (or public/logos.svg).');
  process.exit(1);
}

const OUT = path.resolve('public/icons');
if (!fs.existsSync(OUT)) {
  fs.mkdirSync(OUT, { recursive: true });
}

const bg = '#0B1220'; // theme background for canvas and iOS flatten
const sizes = [
  { name: 'icon-192.png', size: 192, flatten: false },
  { name: 'icon-512.png', size: 512, flatten: false },
  { name: 'apple-touch-icon.png', size: 180, flatten: true }, // no alpha on iOS
];

(async () => {
  const svg = fs.readFileSync(SRC);

  for (const { name, size, flatten } of sizes) {
    let img = sharp(svg, { density: 512 }); // high-density render for crisp edges
    if (flatten) img = img.flatten({ background: bg });

    await img
      .resize(size, size, { fit: 'contain', background: bg })
      .png()
      .toFile(path.join(OUT, name));

    console.log('✔ wrote', path.join('public/icons', name));
  }

  console.log('\n✅ Done. References:');
  console.log('  manifest.webmanifest → /icons/icon-192.png, /icons/icon-512.png');
  console.log('  layout.tsx → apple icon /icons/apple-touch-icon.png');
})().catch((e) => {
  console.error('❌ Icon generation failed:\n', e);
  process.exit(1);
});
