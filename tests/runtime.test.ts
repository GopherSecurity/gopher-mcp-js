import { assertSupportedNodeVersion } from '../src/runtime';

function withNodeVersion(version: string, fn: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(process.versions, 'node');
  Object.defineProperty(process.versions, 'node', {
    configurable: true,
    value: version,
  });
  try {
    fn();
  } finally {
    if (descriptor) {
      Object.defineProperty(process.versions, 'node', descriptor);
    }
  }
}

describe('assertSupportedNodeVersion', () => {
  test('accepts Node 18', () => {
    withNodeVersion('18.0.0', () => {
      expect(() => assertSupportedNodeVersion()).not.toThrow();
    });
  });

  test('accepts newer Node versions', () => {
    withNodeVersion('20.11.1', () => {
      expect(() => assertSupportedNodeVersion()).not.toThrow();
    });
  });

  test('rejects older Node versions with upgrade instructions', () => {
    withNodeVersion('10.19.0', () => {
      expect(() => assertSupportedNodeVersion()).toThrow(
        /requires Node\.js 18 or newer[\s\S]*Current Node\.js: v10\.19\.0[\s\S]*setup_20\.x/
      );
    });
  });
});
