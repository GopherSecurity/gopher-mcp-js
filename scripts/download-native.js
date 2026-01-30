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

  return `@gopher-orch/${platformName}-${archName}`;
}

/**
 * Check if the platform package is already installed
 */
function isPlatformPackageInstalled() {
  const packageName = getPlatformPackageName();
  try {
    require.resolve(`${packageName}/package.json`);
    return true;
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

  const libPath = path.join(__dirname, '..', 'native', 'lib', platformInfo.lib);
  return fs.existsSync(libPath);
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

    // Find and copy library file
    const libName = platformInfo.lib;
    let libFound = false;

    // Look for the library in various locations
    const searchPaths = [
      path.join(extractDir, libName),
      path.join(extractDir, 'lib', libName),
    ];

    // Also search for versioned libraries (e.g., libgopher-orch.so.0.1.0)
    const files = fs.readdirSync(extractDir);
    for (const file of files) {
      if (file.startsWith(libName.replace(/\.[^.]+$/, ''))) {
        searchPaths.push(path.join(extractDir, file));
      }
    }

    // Check lib subdirectory too
    const libDir = path.join(extractDir, 'lib');
    if (fs.existsSync(libDir)) {
      const libFiles = fs.readdirSync(libDir);
      for (const file of libFiles) {
        if (file.startsWith(libName.replace(/\.[^.]+$/, ''))) {
          searchPaths.push(path.join(libDir, file));
        }
      }
    }

    for (const srcPath of searchPaths) {
      if (fs.existsSync(srcPath) && fs.statSync(srcPath).isFile()) {
        const destPath = path.join(nativeLibDir, path.basename(srcPath));
        fs.copyFileSync(srcPath, destPath);
        console.log(`✓ Installed: ${path.basename(srcPath)}`);
        libFound = true;

        // Create symlink for versioned libraries
        if (platform !== 'win32' && srcPath !== path.join(extractDir, libName)) {
          const symlinkPath = path.join(nativeLibDir, libName);
          if (fs.existsSync(symlinkPath)) {
            fs.unlinkSync(symlinkPath);
          }
          fs.symlinkSync(path.basename(srcPath), symlinkPath);
          console.log(`✓ Created symlink: ${libName}`);
        }
      }
    }

    if (!libFound) {
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
