#!/usr/bin/env node

const MIN_NODE_MAJOR = 18;
const version = process.versions.node;
const majorText = version.split('.')[0];
const major = parseInt(majorText || '', 10);

if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
  console.error(
    [
      '@gopher.security/gopher-mcp-js requires Node.js 18 or newer.',
      'Current Node.js: v' + version,
      '',
      'Ubuntu 20 commonly ships an older Node.js. Install a newer Node:',
      '  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -',
      '  sudo apt-get install -y nodejs',
      '',
      'Or use nvm:',
      '  nvm install 20',
      '  nvm use 20',
    ].join('\n')
  );
  process.exit(1);
}
