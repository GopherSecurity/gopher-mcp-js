import fs from 'node:fs';
import path from 'node:path';

describe('GOPHER_SDK_TEST API routing contract', () => {
  const apiEngineHeader = path.resolve(
    __dirname,
    '../third_party/gopher-orch/include/gopher/orch/agent/api_engine.h'
  );

  function readApiEngineHeader(): string | null {
    if (!fs.existsSync(apiEngineHeader)) {
      console.warn(
        `Skipping native API routing contract: ${apiEngineHeader} not found`
      );
      return null;
    }
    return fs.readFileSync(apiEngineHeader, 'utf8');
  }

  it('keeps the documented staging opt-in guarded by explicit truthy values', () => {
    const source = readApiEngineHeader();
    if (source === null) {
      return;
    }

    expect(source).toContain('std::getenv("GOPHER_SDK_TEST")');
    expect(source).toContain('https://api-test.gopher.security');
    expect(source).toContain('https://api.gopher.security');
    expect(source).toMatch(/value\s*==\s*"true"/);
    expect(source).toMatch(/value\s*==\s*"1"/);
    expect(source).toMatch(/value\s*==\s*"yes"/);
  });

  it('documents non-truthy values as staying on production', () => {
    const source = readApiEngineHeader();
    if (source === null) {
      return;
    }

    expect(source).toMatch(
      /Anything[\s\S]{0,80}else[\s\S]{0,120}stays on production/
    );
  });
});
