/**
 * Tests for buildCreateErrorMessage — the helper that translates the
 * native side's lastError struct into the AgentError message thrown by
 * GopherAgent.create() and the routing factories.
 *
 * Two failure shapes need to round-trip cleanly into AgentError text:
 *
 *  1. A populated lastError (native fills code/message/details for
 *     explicit failures: unsupported provider, fetchMcpServers error,
 *     JSON parse failure, etc.). The helper must surface that message
 *     verbatim, appending ": <details>" when details is present.
 *
 *  2. An empty / zero-initialised lastError. The empty-registry guard in
 *     gopher-orch's createByJson returns nullptr after logging only a
 *     warning — lastError is never populated. The helper must produce a
 *     useful fallback that names the likely causes and points the user at
 *     GOPHER_DEBUG=1 instead of the bare "Failed to create agent" string
 *     that earlier SDK versions emitted.
 */

import { buildCreateErrorMessage } from '../src/agent';
// Use the narrow ffi/library path (not the ffi barrel) so this suite does
// not transitively load src/ffi/auth/loader.ts, which registers koffi types
// at module-import time and complains "Duplicate type name" when several
// test files have already loaded it earlier in the same Jest run.
import type { GopherOrchErrorInfoData } from '../src/ffi/library';

const FALLBACK_HINTS = [
  // Mentions there was no specific native-side error, so the user knows
  // the lastError pump did fire and just came back empty.
  'returned null without a specific error',
  // Names the most common cause so the user knows where to start looking.
  'MCP server',
  // Mentions the diagnostic env var so the user can opt into more logs.
  'GOPHER_DEBUG=1',
];

function makeErrorInfo(
  overrides: Partial<GopherOrchErrorInfoData> = {}
): GopherOrchErrorInfoData {
  return {
    code: 0,
    message: null,
    details: null,
    file: null,
    line: 0,
    ...overrides,
  };
}

describe('buildCreateErrorMessage', () => {
  describe('populated lastError', () => {
    test('surfaces message verbatim when present', () => {
      const msg = buildCreateErrorMessage(
        makeErrorInfo({
          code: -1,
          message: 'createByJson: unsupported provider: NotARealProvider',
        })
      );
      expect(msg).toBe('createByJson: unsupported provider: NotARealProvider');
    });

    test('appends ": <details>" when details are set', () => {
      const msg = buildCreateErrorMessage(
        makeErrorInfo({
          code: -1,
          message: 'createByJson: failed to parse server config',
          details: 'unexpected token at line 3',
        })
      );
      expect(msg).toBe(
        'createByJson: failed to parse server config: unexpected token at line 3'
      );
    });

    test('omits the details suffix when details are absent', () => {
      const msg = buildCreateErrorMessage(
        makeErrorInfo({
          code: -1,
          message: 'createByServerId: API key is required',
          details: null,
        })
      );
      // No trailing ": " — that historically appeared when details was the
      // empty string but truthy in JS terms.
      expect(msg).toBe('createByServerId: API key is required');
    });

    test('treats empty-string details as no details', () => {
      const msg = buildCreateErrorMessage(
        makeErrorInfo({
          code: -1,
          message: 'createByJson: some failure',
          details: '',
        })
      );
      expect(msg).toBe('createByJson: some failure');
    });
  });

  describe('empty lastError fallback', () => {
    test('uses actionable fallback when errorInfo is null', () => {
      const msg = buildCreateErrorMessage(null);
      for (const hint of FALLBACK_HINTS) {
        expect(msg).toContain(hint);
      }
    });

    test('uses actionable fallback when errorInfo.message is null', () => {
      const msg = buildCreateErrorMessage(makeErrorInfo());
      for (const hint of FALLBACK_HINTS) {
        expect(msg).toContain(hint);
      }
    });

    test('uses actionable fallback when errorInfo.message is empty string', () => {
      const msg = buildCreateErrorMessage(makeErrorInfo({ message: '' }));
      for (const hint of FALLBACK_HINTS) {
        expect(msg).toContain(hint);
      }
    });

    test('fallback message is non-empty so AgentError consumers can log it', () => {
      // The contract the existing agent-create-by tests assert on (every
      // AgentError has a non-empty message) must also hold for the fallback.
      expect(buildCreateErrorMessage(null).length).toBeGreaterThan(0);
    });
  });
});
