import * as koffi from 'koffi';

import {
  getOrCreateCallbackPrototype,
  getOrCreateOpaquePointer,
  getOrCreateStruct,
} from '../src/ffi/koffi-types';

function uniqueTypeName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

describe('koffi type registry helpers', () => {
  test('reuses a tracked struct with the same layout', () => {
    const name = uniqueTypeName('TrackedStruct');
    const first = getOrCreateStruct(name, {
      code: 'int32_t',
      message: 'const char*',
    });
    const second = getOrCreateStruct(name, {
      code: 'int32_t',
      message: 'const char*',
    });

    expect(first).toBe(second);
  });

  test('rejects a tracked struct with a different field type', () => {
    const name = uniqueTypeName('ConflictingStruct');
    getOrCreateStruct(name, {
      code: 'int32_t',
      message: 'const char*',
    });

    expect(() =>
      getOrCreateStruct(name, {
        code: 'int64_t',
        message: 'const char*',
      })
    ).toThrow(/Conflicting koffi type registration/);
  });

  test('rejects a tracked struct with a different field order', () => {
    const name = uniqueTypeName('ReorderedStruct');
    getOrCreateStruct(name, {
      code: 'int32_t',
      message: 'const char*',
    });

    expect(() =>
      getOrCreateStruct(name, {
        message: 'const char*',
        code: 'int32_t',
      })
    ).toThrow(/Conflicting koffi type registration/);
  });

  test('rejects an untracked pre-registered struct', () => {
    const name = uniqueTypeName('ExternalStruct');
    koffi.struct(name, {
      code: 'int32_t',
    });

    expect(() =>
      getOrCreateStruct(name, {
        code: 'int32_t',
      })
    ).toThrow(/already registered outside the tracked FFI registry/);
  });

  test('reuses a tracked opaque pointer', () => {
    const name = uniqueTypeName('TrackedOpaque');
    const first = getOrCreateOpaquePointer(name);
    const second = getOrCreateOpaquePointer(name);

    expect(first).toBe(second);
  });

  test('reuses a tracked callback prototype', () => {
    const name = uniqueTypeName('TrackedCallback');
    const signature = `int ${name}(void*)`;
    const first = getOrCreateCallbackPrototype(name, signature);
    const second = getOrCreateCallbackPrototype(name, signature);

    expect(first).toBe(second);
  });

  test('tracks structs with callback prototype fields', () => {
    const callbackName = uniqueTypeName('StructCallback');
    const structName = uniqueTypeName('StructWithCallback');
    getOrCreateCallbackPrototype(
      callbackName,
      `int ${callbackName}(void*)`
    );
    const first = getOrCreateStruct(structName, {
      callback: `${callbackName}*`,
      user_data: 'void*',
    });
    const second = getOrCreateStruct(structName, {
      callback: `${callbackName}*`,
      user_data: 'void*',
    });

    expect(first).toBe(second);
  });
});
