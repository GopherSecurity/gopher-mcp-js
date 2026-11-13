import {
  normalizeSourceSelection,
  selectionFromCreateOptions,
} from '../src/sourceSelection';
import { GopherSourceSelection } from '../src/config';
import fixtures from '../third_party/gopher-orch/tests/fixtures/inventory/conformance.json';

describe('source selection', () => {
  test.each(fixtures.request_cases)(
    'matches native request fixture %#',
    ({ options, key, value, expected }) => {
      expect(
        normalizeSourceSelection(
          options,
          key ? { key: key as keyof GopherSourceSelection, value } : undefined
        )
      ).toEqual(expected);
    }
  );
  test.each([
    null,
    [],
    's1',
    { serverId: 's1' },
    { serverId: null },
    { serverId: [1] },
    { serverId: [''] },
    { serverName: [' \t'] },
    { gatewayId: ['x\0y'] },
    { serverIds: ['s'] },
  ])('rejects malformed selection %#', (input) => {
    expect(() =>
      normalizeSourceSelection(input as GopherSourceSelection)
    ).toThrow();
  });
  test('preserves exact values without mutation and merges categories', () => {
    const input = Object.freeze({
      serverId: Object.freeze(['s2', 's1']),
      gatewayName: Object.freeze([' Prod ']),
    });
    expect(
      normalizeSourceSelection(input as unknown as GopherSourceSelection, {
        key: 'serverId',
        value: 's1',
      })
    ).toEqual({
      serverId: ['s1', 's2'],
      serverName: [],
      gatewayId: [],
      gatewayName: [' Prod '],
    });
  });
  test('rejects likely misspellings but permits runtime options', () => {
    expect(() =>
      selectionFromCreateOptions({ serverIds: ['s'] } as GopherSourceSelection)
    ).toThrow();
    expect(
      selectionFromCreateOptions({
        accessToken: 't',
        serverId: ['s'],
      } as GopherSourceSelection)
    ).toEqual({ serverId: ['s'] });
  });
});
