/**
 * Custom error classes for gopher-orch operations.
 */

/**
 * Base error class for agent operations.
 */
export class AgentError extends Error {
  public readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    Object.setPrototypeOf(this, AgentError.prototype);
  }
}

/**
 * Error thrown when API key is invalid or missing.
 */
export class ApiKeyError extends AgentError {
  constructor(message: string) {
    super(message, 'API_KEY_ERROR');
    this.name = 'ApiKeyError';
    Object.setPrototypeOf(this, ApiKeyError.prototype);
  }
}

/**
 * Error thrown when connection fails.
 */
export class ConnectionError extends AgentError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'ConnectionError';
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

/**
 * Error thrown when operation times out.
 */
export class TimeoutError extends AgentError {
  constructor(message: string) {
    super(message, 'TIMEOUT_ERROR');
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}
