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

try {
  sdk.GopherAgent.createWithUrl(
    'NotARealProvider',
    'verification-model',
    'http://127.0.0.1:1/mcp'
  );
  throw new Error('Expected createWithUrl to fail');
} catch (error) {
  const message = error && error.message ? error.message : String(error);
  if (message.includes('Failed to load')) {
    throw error;
  }
  console.log('createWithUrl reached native code and failed as expected');
}
