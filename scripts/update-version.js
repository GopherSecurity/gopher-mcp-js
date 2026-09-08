#!/usr/bin/env node
/**
 * Update SDK and gopher-orch native package versions across release files.
 *
 * Usage:
 *   node scripts/update-version.js <sdk-version> [gopher-orch-version]
 *
 * Example:
 *   node scripts/update-version.js 0.1.35.2 0.1.35
 *
 * This updates:
 *   - package.json version
 *   - package.json gopherOrchVersion
 *   - package.json optionalDependencies versions for native gopher-orch packages
 *   - platform package versions under packages/
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

function updatePackageJson(sdkVersion, gopherOrchVersion) {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  pkg.version = sdkVersion;
  pkg.gopherOrchVersion = gopherOrchVersion;

  if (pkg.optionalDependencies) {
    for (const dep of Object.keys(pkg.optionalDependencies)) {
      if (dep.startsWith('@gopher.security/gopher-orch-')) {
        pkg.optionalDependencies[dep] = gopherOrchVersion;
      }
    }
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(
    `✓ Updated package.json to SDK version ${sdkVersion} and gopher-orch version ${gopherOrchVersion}`
  );
}

function updatePlatformPackages(sdkVersion) {
  const packagesDir = path.join(ROOT_DIR, 'packages');

  if (!fs.existsSync(packagesDir)) {
    console.log('⚠ packages/ directory not found, skipping');
    return;
  }

  const platforms = fs.readdirSync(packagesDir);

  for (const platform of platforms) {
    const pkgPath = path.join(packagesDir, platform, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      pkg.version = sdkVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log(
        `✓ Updated packages/${platform}/package.json to ${sdkVersion}`
      );
    }
  }
}

function inferGopherOrchVersion(sdkVersion) {
  const extendedVersion = sdkVersion.match(
    /^([0-9]+\.[0-9]+\.[0-9]+)\.[0-9]+$/
  );
  if (extendedVersion) {
    return extendedVersion[1];
  }
  return sdkVersion;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.length > 2) {
    console.error(
      'Usage: node scripts/update-version.js <sdk-version> [gopher-orch-version]'
    );
    console.error('Example: node scripts/update-version.js 0.1.35.2 0.1.35');
    process.exit(1);
  }

  const sdkVersion = args[0].replace(/^v/, ''); // Remove 'v' prefix if present
  const gopherOrchVersion = args[1]
    ? args[1].replace(/^v/, '')
    : inferGopherOrchVersion(sdkVersion);

  console.log(`\nUpdating SDK version to: ${sdkVersion}`);
  console.log(`Using gopher-orch version: ${gopherOrchVersion}\n`);

  updatePackageJson(sdkVersion, gopherOrchVersion);
  updatePlatformPackages(gopherOrchVersion);

  console.log('\n✅ Version update complete!\n');
  console.log('Next steps:');
  console.log('  1. Review changes: git diff');
  console.log(
    '  2. Commit: git add -A && git commit -m "Bump version to ' +
      sdkVersion +
      '"'
  );
  console.log('  3. Push to trigger release: git push origin npm_release');
}

main();
