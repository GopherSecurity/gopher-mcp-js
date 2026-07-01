const MIN_NODE_MAJOR = 18;

export function assertSupportedNodeVersion(): void {
  const version = process.versions.node;
  const majorText = version.split('.')[0];
  const major = Number.parseInt(majorText ? majorText : '', 10);

  if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    throw new Error(
      [
        `@gopher.security/gopher-mcp-js requires Node.js ${MIN_NODE_MAJOR} or newer.`,
        `Current Node.js: v${version}`,
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
  }
}
