/**
 * Tests for GopherAgentConfig.
 */

import { GopherAgentConfig } from '../src/config';

describe('GopherAgentConfig', () => {
  describe('builder pattern', () => {
    test('should create config with API key', () => {
      const config = GopherAgentConfig.builder()
        .provider('AnthropicProvider')
        .model('claude-3-haiku-20240307')
        .apiKey('test-api-key')
        .build();

      expect(config.provider).toBe('AnthropicProvider');
      expect(config.model).toBe('claude-3-haiku-20240307');
      expect(config.apiKey).toBe('test-api-key');
      expect(config.serverConfig).toBeUndefined();
      expect(config.hasApiKey()).toBe(true);
      expect(config.hasServerConfig()).toBe(false);
    });

    test('should create config with server config', () => {
      const config = GopherAgentConfig.builder()
        .provider('AnthropicProvider')
        .model('claude-3-haiku-20240307')
        .serverConfig('{"servers": []}')
        .build();

      expect(config.provider).toBe('AnthropicProvider');
      expect(config.model).toBe('claude-3-haiku-20240307');
      expect(config.apiKey).toBeUndefined();
      expect(config.serverConfig).toBe('{"servers": []}');
      expect(config.hasApiKey()).toBe(false);
      expect(config.hasServerConfig()).toBe(true);
    });

    test('should require provider', () => {
      expect(() => {
        GopherAgentConfig.builder()
          .model('claude-3-haiku-20240307')
          .apiKey('test-key')
          .build();
      }).toThrow('Provider is required');
    });

    test('should require model', () => {
      expect(() => {
        GopherAgentConfig.builder()
          .provider('AnthropicProvider')
          .apiKey('test-key')
          .build();
      }).toThrow('Model is required');
    });

    test('should require either API key or server config', () => {
      expect(() => {
        GopherAgentConfig.builder()
          .provider('AnthropicProvider')
          .model('claude-3-haiku-20240307')
          .build();
      }).toThrow('Either apiKey or serverConfig is required');
    });

    test('should not allow both API key and server config', () => {
      expect(() => {
        GopherAgentConfig.builder()
          .provider('AnthropicProvider')
          .model('claude-3-haiku-20240307')
          .apiKey('test-key')
          .serverConfig('{"servers": []}')
          .build();
      }).toThrow('Cannot specify both apiKey and serverConfig');
    });
  });
});
