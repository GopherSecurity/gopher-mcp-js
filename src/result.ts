/**
 * Status of agent query execution.
 */
export enum AgentResultStatus {
  SUCCESS = 'success',
  ERROR = 'error',
  TIMEOUT = 'timeout',
}

/**
 * Options for creating an AgentResult.
 */
export interface AgentResultOptions {
  response: string;
  status: AgentResultStatus;
  iterationCount?: number;
  tokensUsed?: number;
}

/**
 * Result from agent query execution.
 */
export class AgentResult {
  public readonly response: string;
  public readonly status: AgentResultStatus;
  public readonly iterationCount?: number;
  public readonly tokensUsed?: number;

  private constructor(options: AgentResultOptions) {
    this.response = options.response;
    this.status = options.status;
    this.iterationCount = options.iterationCount;
    this.tokensUsed = options.tokensUsed;
  }

  /**
   * Check if the result is a success.
   */
  isSuccess(): boolean {
    return this.status === AgentResultStatus.SUCCESS;
  }

  /**
   * Create a new builder for AgentResult.
   */
  static builder(): AgentResultBuilder {
    return new AgentResultBuilder();
  }

  /**
   * Create a success result.
   */
  static success(response: string): AgentResult {
    return AgentResult.builder()
      .response(response)
      .status(AgentResultStatus.SUCCESS)
      .build();
  }

  /**
   * Create an error result.
   */
  static error(message: string): AgentResult {
    return AgentResult.builder()
      .response(message)
      .status(AgentResultStatus.ERROR)
      .build();
  }

  /**
   * Create a timeout result.
   */
  static timeout(message: string): AgentResult {
    return AgentResult.builder()
      .response(message)
      .status(AgentResultStatus.TIMEOUT)
      .build();
  }

  /**
   * String representation of the result.
   */
  toString(): string {
    return `AgentResult{response='${this.response}', status=${this.status}, iterationCount=${this.iterationCount}, tokensUsed=${this.tokensUsed}}`;
  }
}

/**
 * Builder for AgentResult.
 */
export class AgentResultBuilder {
  private _response?: string;
  private _status?: AgentResultStatus;
  private _iterationCount?: number;
  private _tokensUsed?: number;

  /**
   * Set the response.
   */
  response(response: string): this {
    this._response = response;
    return this;
  }

  /**
   * Set the status.
   */
  status(status: AgentResultStatus): this {
    this._status = status;
    return this;
  }

  /**
   * Set the iteration count.
   */
  iterationCount(iterationCount: number): this {
    this._iterationCount = iterationCount;
    return this;
  }

  /**
   * Set the tokens used.
   */
  tokensUsed(tokensUsed: number): this {
    this._tokensUsed = tokensUsed;
    return this;
  }

  /**
   * Build the AgentResult.
   */
  build(): AgentResult {
    if (this._response === undefined) {
      throw new Error('Response is required');
    }
    if (this._status === undefined) {
      throw new Error('Status is required');
    }
    return new (AgentResult as unknown as {
      new (options: AgentResultOptions): AgentResult;
    })({
      response: this._response,
      status: this._status,
      iterationCount: this._iterationCount,
      tokensUsed: this._tokensUsed,
    });
  }
}
