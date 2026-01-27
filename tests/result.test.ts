/**
 * Tests for AgentResult.
 */

import { AgentResult, AgentResultStatus } from '../src/result';

describe('AgentResult', () => {
  test('should create success result', () => {
    const result = AgentResult.success('Hello, world!');

    expect(result.response).toBe('Hello, world!');
    expect(result.status).toBe(AgentResultStatus.SUCCESS);
    expect(result.isSuccess()).toBe(true);
  });

  test('should create error result', () => {
    const result = AgentResult.error('Something went wrong');

    expect(result.response).toBe('Something went wrong');
    expect(result.status).toBe(AgentResultStatus.ERROR);
    expect(result.isSuccess()).toBe(false);
  });

  test('should create timeout result', () => {
    const result = AgentResult.timeout('Operation timed out');

    expect(result.response).toBe('Operation timed out');
    expect(result.status).toBe(AgentResultStatus.TIMEOUT);
    expect(result.isSuccess()).toBe(false);
  });

  test('should create result with metadata via builder', () => {
    const result = AgentResult.builder()
      .response('Test response')
      .status(AgentResultStatus.SUCCESS)
      .iterationCount(5)
      .tokensUsed(100)
      .build();

    expect(result.response).toBe('Test response');
    expect(result.status).toBe(AgentResultStatus.SUCCESS);
    expect(result.iterationCount).toBe(5);
    expect(result.tokensUsed).toBe(100);
  });

  test('should have optional fields default to undefined', () => {
    const result = AgentResult.success('Test');

    expect(result.iterationCount).toBeUndefined();
    expect(result.tokensUsed).toBeUndefined();
  });

  test('should provide string representation', () => {
    const result = AgentResult.success('Test');
    const str = result.toString();

    expect(str).toContain('Test');
    expect(str).toContain('success');
  });
});

describe('AgentResultStatus', () => {
  test('should have correct values', () => {
    expect(AgentResultStatus.SUCCESS).toBe('success');
    expect(AgentResultStatus.ERROR).toBe('error');
    expect(AgentResultStatus.TIMEOUT).toBe('timeout');
  });

  test('should have distinct values', () => {
    expect(AgentResultStatus.SUCCESS).not.toBe(AgentResultStatus.ERROR);
    expect(AgentResultStatus.SUCCESS).not.toBe(AgentResultStatus.TIMEOUT);
    expect(AgentResultStatus.ERROR).not.toBe(AgentResultStatus.TIMEOUT);
  });
});
