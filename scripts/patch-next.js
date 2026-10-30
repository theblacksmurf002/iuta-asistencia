/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const files = [
  'node_modules/next/dist/lib/metadata/metadata.js',
  'node_modules/next/dist/lib/metadata/metadata-parallel.js',
  'node_modules/next/dist/esm/lib/metadata/metadata.js',
  'node_modules/next/dist/esm/lib/metadata/metadata-parallel.js'
];

let patchedCount = 0;

for (const rel of files) {
  const filePath = path.join(__dirname, '..', rel);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('suppressHydrationWarning: true')) {
    continue;
  }

  if (content.includes('hidden: true,')) {
    content = content.replace('hidden: true,', 'hidden: true,\n                    suppressHydrationWarning: true,');
    fs.writeFileSync(filePath, content, 'utf8');
    patchedCount++;
  }
}

if (patchedCount > 0) {
  console.log(`[patch-next] Successfully patched ${patchedCount} Next.js metadata boundary file(s) with suppressHydrationWarning: true.`);
}
