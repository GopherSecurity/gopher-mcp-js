#!/usr/bin/env node
/**
 * Update gopher-orch version across all files
 *
 * Usage:
 *   node scripts/update-version.js <version>
 *
 * Example:
 *   node scripts/update-version.js 0.1.0-20260225-132506
 *
 * This updates:
 *   - package.json version
 *   - package.json optionalDependencies versions
 *   - .github/workflows/publish-packages.yml GOPHER_ORCH_VERSION
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

function updatePackageJson(version) {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  // Update main version
  pkg.version = version;

  // Update optionalDependencies
  if (pkg.optionalDependencies) {
    for (const dep of Object.keys(pkg.optionalDependencies)) {
      if (dep.startsWith('@gopher.security/gopher-orch-')) {
        pkg.optionalDependencies[dep] = version;
      }
    }
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`✓ Updated package.json to version ${version}`);
}

function updateWorkflow(version) {
  const workflowPath = path.join(ROOT_DIR, '.github/workflows/publish-packages.yml');

  if (!fs.existsSync(workflowPath)) {
    console.log('⚠ Workflow file not found, skipping');
    return;
  }

  let content = fs.readFileSync(workflowPath, 'utf8');

  // Update GOPHER_ORCH_VERSION (add 'v' prefix for the tag)
  const versionTag = version.startsWith('v') ? version : `v${version}`;
  content = content.replace(
    /GOPHER_ORCH_VERSION:\s*['"][^'"]+['"]/,
    `GOPHER_ORCH_VERSION: '${versionTag}'`
  );

  fs.writeFileSync(workflowPath, content);
  console.log(`✓ Updated workflow GOPHER_ORCH_VERSION to ${versionTag}`);
}

function updatePlatformPackages(version) {
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
      pkg.version = version;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log(`✓ Updated packages/${platform}/package.json to ${version}`);
    }
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node scripts/update-version.js <version>');
    console.error('Example: node scripts/update-version.js 0.1.0-20260225-132506');
    process.exit(1);
  }

  const version = args[0].replace(/^v/, ''); // Remove 'v' prefix if present

  console.log(`\nUpdating gopher-orch version to: ${version}\n`);

  updatePackageJson(version);
  updateWorkflow(version);
  updatePlatformPackages(version);

  console.log('\n✅ Version update complete!\n');
  console.log('Next steps:');
  console.log('  1. Review changes: git diff');
  console.log('  2. Commit: git add -A && git commit -m "Bump version to ' + version + '"');
  console.log('  3. Push to trigger release: git push origin npm_release');
}

main();
