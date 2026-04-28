# Verify Native Library Loading

Quick test to verify the npm package loads correctly on a clean machine (no Homebrew).

## Usage

### Test the published npm package

```bash
mkdir /tmp/test-sdk && cd /tmp/test-sdk
npm init -y
npm install @gopher.security/gopher-mcp-js@latest
cp /path/to/gopher-mcp-js/examples/verify-native/verify.mjs .
node verify.mjs
```

### Test the local build

```bash
cd /path/to/gopher-mcp-js
node examples/verify-native/verify.mjs
```

## Expected output (working)

```
Step 1: Import SDK .............. ✅ OK
Step 2: Load native library ..... ✅ OK
Step 3: Create agent ............ ✅ OK
✅ All 3 checks passed — native library loads correctly
```

## Known failure modes

| Symptom | Bug | Cause |
|---------|-----|-------|
| exit 137 (SIGKILL), no output | Bug 4 | Invalid code signature on bundled dylibs |
| `Library not loaded: @loader_path/libnghttp3.9.dylib` | Bug 5 | Missing transitive dependency |
| `Failed to load gopher-orch native library` | Bug 1 | Hardcoded Homebrew paths, deps not bundled |

## Debug with DYLD_PRINT_LIBRARIES

```bash
DYLD_PRINT_LIBRARIES=1 node examples/verify-native/verify.mjs 2>&1 | head -30
```
