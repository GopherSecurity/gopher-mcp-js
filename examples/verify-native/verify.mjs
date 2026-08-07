#!/usr/bin/env node
/**
 * verify.mjs — End-to-end verification of native library loading
 *
 * Tests the full chain that fails on a clean macOS without Homebrew:
 *   1. Import the SDK
 *   2. Load the native library (triggers dlopen of all bundled dylibs)
 *   3. Create an agent with a dummy config (no real server needed)
 *
 * Usage:
 *   node examples/verify-native/verify.mjs
 *
 * Expected output on success:
 *   ✅ Step 1: Import SDK .............. OK
 *   ✅ Step 2: Load native library ..... OK
 *   ✅ Step 3: Create agent ............ OK (or expected error)
 *   ✅ All checks passed — native library loads correctly
 *
 * Known failure modes:
 *   - exit 137 (SIGKILL): Invalid code signature on bundled dylibs (Bug 4)
 *   - "Library not loaded: @loader_path/libnghttp3.9.dylib": Missing transitive dep (Bug 5)
 *   - "Failed to load gopher-orch native library": dlopen failure
 */

const DUMMY_SERVER_CONFIG = JSON.stringify({
  succeeded: true,
  code: 200000000,
  message: 'success',
  data: {
    servers: [
      {
        version: '2026-01-11',
        serverId: 'verify-test',
        name: 'verify',
        transport: 'http_sse',
        config: {
          url: 'http://localhost:19999/mcp',
          headers: {},
        },
        connectTimeout: 1000,
        requestTimeout: 1000,
      },
    ],
  },
});

async function main() {
  let passed = 0;
  let failed = 0;

  // Step 1: Import
  process.stdout.write('Step 1: Import SDK .............. ');
  let GopherAgent;
  try {
    const mod = await import('@gopher.security/gopher-mcp-js');
    GopherAgent = mod.GopherAgent;
    console.log('✅ OK');
    passed++;
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
    failed++;
    process.exit(1);
  }

  // Step 2: Load native library (dlopen happens here)
  process.stdout.write('Step 2: Load native library ..... ');
  try {
    // createWithServerConfig triggers native library loading
    const agent = await GopherAgent.createWithServerConfig(
      'AnthropicProvider',
      'claude-haiku-4-5-20251001',
      DUMMY_SERVER_CONFIG,
      { oauth: { mode: 'disabled' } }
    );
    console.log('✅ OK');
    passed++;

    // Step 3: Verify agent was created
    process.stdout.write('Step 3: Create agent ............ ');
    if (agent) {
      console.log('✅ OK');
      passed++;
      agent.dispose();
    } else {
      console.log('❌ FAIL: agent is null');
      failed++;
    }
  } catch (e) {
    // If we get a JS error (not a SIGKILL), the native lib at least loaded
    if (e.message && e.message.includes('Failed to load')) {
      console.log(`❌ FAIL: ${e.message}`);
      console.log('');
      console.log('  This means dlopen failed. Check with:');
      console.log(
        '    DYLD_PRINT_LIBRARIES=1 node examples/verify-native/verify.mjs'
      );
      console.log('');
      console.log('  Common causes:');
      console.log('    - Missing bundled dylib (Bug 5)');
      console.log('    - Invalid code signature (Bug 4)');
      failed++;
    } else {
      // Other errors (e.g., connection timeout) are expected with dummy config
      console.log(`✅ OK (native loaded, got expected error: ${e.message})`);
      passed++;
      process.stdout.write('Step 3: Create agent ............ ');
      console.log('✅ OK (agent creation attempted)');
      passed++;
    }
  }

  console.log('');
  if (failed === 0) {
    console.log(
      `✅ All ${passed} checks passed — native library loads correctly`
    );
  } else {
    console.log(`❌ ${failed} check(s) failed, ${passed} passed`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`\n❌ Unexpected error: ${e.message}`);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
