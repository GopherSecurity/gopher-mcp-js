#!/usr/bin/env node

const { createRequire } = require('module');
const path = require('path');

const requireFromProject = createRequire(path.join(process.cwd(), 'package.json'));
const sdk = requireFromProject('@gopher.security/gopher-mcp-js');

const requiredExports = [
  'GopherAgent',
  'GopherAgentConfig',
  'ServerConfig',
  'GopherOrchLibrary',
];

for (const name of requiredExports) {
  if (!(name in sdk)) {
    throw new Error(`Missing export: ${name}`);
  }
}

if (!sdk.GopherOrchLibrary.isAvailable()) {
  throw new Error(
    'Native library unavailable:\n' +
      sdk.GopherOrchLibrary.getLoadErrorMessage()
  );
}

console.log('SDK import and native load OK');
