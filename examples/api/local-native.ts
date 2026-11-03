/** Select local native libraries before importing the SDK. */
import { existsSync } from 'fs';
import { resolve } from 'path';

if (!process.env.GOPHER_ORCH_LIBRARY_PATH) {
  const root = resolve(__dirname, '../..');
  const libraryName =
    process.platform === 'darwin'
      ? 'libgopher-orch.dylib'
      : process.platform === 'win32'
        ? 'gopher-orch.dll'
        : 'libgopher-orch.so';
  const candidates = [
    resolve(root, 'native/current/lib'),
    resolve(root, 'native/lib'),
    resolve(root, 'third_party/gopher-orch/build/lib'),
  ];
  const libraryDir = candidates.find((dir) =>
    existsSync(resolve(dir, libraryName))
  );
  if (!libraryDir) {
    throw new Error(
      'Local gopher-orch library not found. Build the native libraries or set GOPHER_ORCH_LIBRARY_PATH.'
    );
  }
  process.env.GOPHER_ORCH_LIBRARY_PATH = libraryDir;
}
