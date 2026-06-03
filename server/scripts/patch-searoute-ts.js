const fs = require('fs');
const path = require('path');

const pkgRoot = path.join(__dirname, '..');
const libDir = path.join(pkgRoot, 'node_modules', 'searoute-ts', 'dist', 'lib');
const utilsJs = path.join(libDir, 'utils.js');
const utilsShim = path.join(libDir, 'utils');

try {
  if (!fs.existsSync(utilsJs)) {
    console.log('[patch-searoute-ts] utils.js not found, skipping');
    process.exit(0);
  }

  if (!fs.existsSync(utilsShim)) {
    fs.writeFileSync(utilsShim, "export * from './utils.js';\n", 'utf8');
    console.log('[patch-searoute-ts] Added utils shim');
  } else {
    console.log('[patch-searoute-ts] utils shim already present');
  }
} catch (err) {
  console.error('[patch-searoute-ts] Failed:', err.message);
  process.exit(1);
}
