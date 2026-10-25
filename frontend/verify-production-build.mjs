import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assetsDirectory = fileURLToPath(
  new globalThis.URL('./dist/assets/', import.meta.url),
);
const assetNames = await readdir(assetsDirectory);

assert.equal(
  assetNames.some((name) => name.endsWith('.map')),
  false,
  'Production assets must not include publicly downloadable source maps.',
);

for (const name of assetNames.filter((asset) => asset.endsWith('.js'))) {
  const bundle = await readFile(join(assetsDirectory, name), 'utf8');
  assert.equal(
    /sourceMappingURL\s*=/.test(bundle),
    false,
    `Production bundle ${name} must not advertise a source map.`,
  );
}
