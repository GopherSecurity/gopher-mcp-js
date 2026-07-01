#!/usr/bin/env node

/**
 * Download native gopher-orch library as a fallback when optional
 * dependency packages aren't available.
 *
 * This script is run during postinstall to ensure the native library
 * is available even if:
 * - The user's platform package wasn't installed
 * - The user ran npm install with --ignore-scripts initially
 * - The optional dependencies failed to install
 *
 * Usage:
 *   node scripts/download-native.js [--version <version>] [--force]
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Configuration
const GITHUB_REPO = 'GopherSecurity/gopher-orch';
const DEFAULT_VERSION = 'latest';

// Platform mappings
const PLATFORM_MAP = {
  darwin: { name: 'macos', ext: 'tar.gz', lib: 'libgopher-orch.dylib' },
  linux: { name: 'linux', ext: 'tar.gz', lib: 'libgopher-orch.so' },
  win32: { name: 'windows', ext: 'zip', lib: 'gopher-orch.dll' },
};

const ARCH_MAP = {
  arm64: 'arm64',
  x64: 'x64',
  x86_64: 'x64',
};

/**
 * Get the platform-specific package name
 */
function getPlatformPackageName() {
  const platform = os.platform();
  const arch = os.arch();
  const archName = ARCH_MAP[arch] || arch;

  const platformName =
    platform === 'darwin' ? 'darwin' : platform === 'win32' ? 'win32' : 'linux';

  return `@gopher.security/gopher-orch-${platformName}-${archName}`;
}

function findNativeLibraryInDir(dir, libName) {
  if (!fs.existsSync(dir)) return null;

  const direct = path.join(dir, libName);
  if (fs.existsSync(direct)) return direct;

  const prefix = libName.replace(/\.[^.]+$/, '');
  const match = fs
    .readdirSync(dir)
    .find((file) => file === libName || file.startsWith(prefix));
  return match ? path.join(dir, match) : null;
}

function isSharedLibrary(file) {
  return (
    file.endsWith('.dylib') ||
    file.includes('.dylib.') ||
    file.endsWith('.so') ||
    file.includes('.so.') ||
    file.endsWith('.dll')
  );
}

/**
 * Check if the platform package is already installed
 */
function isPlatformPackageInstalled() {
  const packageName = getPlatformPackageName();
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const packageDir = path.dirname(packageJsonPath);
    const platformInfo = PLATFORM_MAP[os.platform()];
    return Boolean(
      platformInfo &&
        findNativeLibraryInDir(path.join(packageDir, 'lib'), platformInfo.lib)
    );
  } catch {
    return false;
  }
}

/**
 * Check if the native library already exists locally
 */
function isLibraryInstalled() {
  const platform = os.platform();
  const platformInfo = PLATFORM_MAP[platform];
  if (!platformInfo) return false;

  const libDir = path.join(__dirname, '..', 'native', 'lib');
  return Boolean(findNativeLibraryInDir(libDir, platformInfo.lib));
}

/**
 * Get the download URL for the current platform
 */
function getDownloadUrl(version) {
  const platform = os.platform();
  const arch = os.arch();

  const platformInfo = PLATFORM_MAP[platform];
  const archName = ARCH_MAP[arch] || arch;

  if (!platformInfo) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const filename = `libgopher-orch-${platformInfo.name}-${archName}.${platformInfo.ext}`;

  if (version === 'latest') {
    return `https://github.com/${GITHUB_REPO}/releases/latest/download/${filename}`;
  }
  return `https://github.com/${GITHUB_REPO}/releases/download/${version}/${filename}`;
}

/**
 * Follow redirects and download a file
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    request.on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });

    file.on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Extract the archive based on extension
 */
function extractArchive(archivePath, destDir) {
  const ext = path.extname(archivePath);

  if (ext === '.gz' && archivePath.endsWith('.tar.gz')) {
    // tar.gz
    execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, { stdio: 'inherit' });
  } else if (ext === '.zip') {
    // zip
    execSync(`unzip -o "${archivePath}" -d "${destDir}"`, { stdio: 'inherit' });
  } else {
    throw new Error(`Unknown archive format: ${ext}`);
  }
}

/**
 * Main download function
 */
async function downloadNative(options = {}) {
  const { version = DEFAULT_VERSION, force = false } = options;

  console.log('gopher-orch native library installer');
  console.log('====================================');
  console.log(`Platform: ${os.platform()} ${os.arch()}`);
  console.log(`Version: ${version}`);
  console.log();

  // Check if platform package is already installed
  if (!force && isPlatformPackageInstalled()) {
    console.log(
      '✓ Platform-specific package is already installed via npm optional dependencies'
    );
    console.log('  No download needed.');
    return;
  }

  // Check if library already exists
  if (!force && isLibraryInstalled()) {
    console.log('✓ Native library already exists in native/lib/');
    console.log('  Use --force to re-download.');
    return;
  }

  const platform = os.platform();
  const platformInfo = PLATFORM_MAP[platform];

  if (!platformInfo) {
    console.error(`✗ Unsupported platform: ${platform}`);
    console.error(
      '  Supported platforms: darwin (macOS), linux, win32 (Windows)'
    );
    process.exit(1);
  }

  // Create directories
  const nativeLibDir = path.join(__dirname, '..', 'native', 'lib');
  const tempDir = path.join(os.tmpdir(), 'gopher-orch-download');

  fs.mkdirSync(nativeLibDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // Download
    const url = getDownloadUrl(version);
    const archiveName = `gopher-orch.${platformInfo.ext}`;
    const archivePath = path.join(tempDir, archiveName);

    console.log(`Downloading from: ${url}`);
    await downloadFile(url, archivePath);
    console.log('✓ Download complete');

    // Extract
    console.log('Extracting archive...');
    const extractDir = path.join(tempDir, 'extracted');
    fs.mkdirSync(extractDir, { recursive: true });
    extractArchive(archivePath, extractDir);
    console.log('✓ Extraction complete');

    // Find and copy library files
    const libName = platformInfo.lib;
    let primaryLibFound = false;
    const copied = new Set();

    const candidateDirs = [extractDir, path.join(extractDir, 'lib')].filter(
      (dir) => fs.existsSync(dir)
    );
    const searchPaths = [];

    for (const dir of candidateDirs) {
      for (const file of fs.readdirSync(dir)) {
        if (isSharedLibrary(file)) {
          searchPaths.push(path.join(dir, file));
        }
      }
    }

    // Ensure the unversioned primary name is checked even if the archive
    // contains only that file and no directory listing matched above.
    searchPaths.push(path.join(extractDir, libName));
    searchPaths.push(path.join(extractDir, 'lib', libName));

    for (const srcPath of searchPaths) {
      if (fs.existsSync(srcPath) && fs.statSync(srcPath).isFile()) {
        const basename = path.basename(srcPath);
        if (copied.has(basename)) {
          continue;
        }
        copied.add(basename);

        const destPath = path.join(nativeLibDir, basename);
        fs.copyFileSync(srcPath, destPath);
        console.log(`✓ Installed: ${basename}`);

        if (
          basename === libName ||
          basename.startsWith(libName.replace(/\.[^.]+$/, ''))
        ) {
          primaryLibFound = true;
        }

        // Create symlink for versioned libraries
        if (
          platform !== 'win32' &&
          basename !== libName &&
          basename.startsWith(libName.replace(/\.[^.]+$/, ''))
        ) {
          const symlinkPath = path.join(nativeLibDir, libName);
          if (fs.existsSync(symlinkPath)) {
            fs.unlinkSync(symlinkPath);
          }
          fs.symlinkSync(basename, symlinkPath);
          console.log(`✓ Created symlink: ${libName}`);
        }
      }
    }

    if (!primaryLibFound) {
      throw new Error(`Library file not found in archive: ${libName}`);
    }

    console.log();
    console.log('✓ Installation complete!');
    console.log(`  Library installed to: ${nativeLibDir}`);
  } finally {
    // Cleanup temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    version: DEFAULT_VERSION,
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version' || args[i] === '-v') {
      options.version = args[++i];
    } else if (args[i] === '--force' || args[i] === '-f') {
      options.force = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: download-native.js [options]');
      console.log();
      console.log('Options:');
      console.log(
        '  --version, -v <version>  gopher-orch version (default: latest)'
      );
      console.log('  --force, -f              Force re-download');
      console.log('  --help, -h               Show this help');
      process.exit(0);
    }
  }

  return options;
}

// Run if called directly
if (require.main === module) {
  const options = parseArgs();
  downloadNative(options).catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = { downloadNative };
