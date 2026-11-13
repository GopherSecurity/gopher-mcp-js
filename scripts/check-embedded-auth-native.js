#!/usr/bin/env node
// Verify the binary actually selected by SDK loading, not its version label.
const { GopherOrchLibrary } = require('../dist/ffi/library');
const lib = GopherOrchLibrary.getInstance();
const capability = lib?.embeddedAuthCapabilities();
if (!capability || capability.version !== 1 || capability.embedded_auth !== true) {
  console.error('Selected native artifact does not support embedded authorization v1. Install/build a compatible artifact or set GOPHER_ORCH_LIBRARY_PATH.');
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ embeddedAuth: true, version: capability.version, asyncStore: capability.async_store === true }));
}
