import type { SourceSpan } from '@grover/language';

export type RuntimeErrorCode =
  | 'uninitialized-variable'
  | 'expected-boolean'
  | 'expected-number'
  | 'type-mismatch'
  | 'division-by-zero'
  | 'invalid-exponent'
  | 'numeric-overflow'
  | 'for-step-zero'
  | 'invalid-for-counter'
  | 'unsupported-operator'
  | 'internal-error';

export interface RuntimeErrorLocation {
  readonly nodeId: string;
  readonly span: SourceSpan;
}

/** A deterministic, user-facing execution fault. */
export class RuntimeFault extends Error {
  public readonly code: RuntimeErrorCode;
  public readonly location: RuntimeErrorLocation | undefined;

  public constructor(code: RuntimeErrorCode, message: string, location?: RuntimeErrorLocation) {
    super(message);
    this.name = 'RuntimeFault';
    this.code = code;
    this.location = location;
  }

  public at(location: RuntimeErrorLocation): RuntimeFault {
    return this.location === undefined ? new RuntimeFault(this.code, this.message, location) : this;
  }
}

export interface RuntimeErrorInfo {
  readonly code: RuntimeErrorCode;
  readonly message: string;
  readonly nodeId?: string;
  readonly span?: SourceSpan;
}

export type RuntimeResource =
  'integer-bits' | 'string-length' | 'output-characters' | 'expression-nodes';

/** Internal control signal converted by the interpreter into the `limit` state. */
export class RuntimeLimitFault extends Error {
  public readonly resource: RuntimeResource;
  public readonly maximum: number;
  public readonly observed: number | undefined;
  public readonly location: RuntimeErrorLocation | undefined;

  public constructor(
    resource: RuntimeResource,
    maximum: number,
    message: string,
    observed?: number,
    location?: RuntimeErrorLocation,
  ) {
    super(message);
    this.name = 'RuntimeLimitFault';
    this.resource = resource;
    this.maximum = maximum;
    this.observed = observed;
    this.location = location;
  }

  public at(location: RuntimeErrorLocation): RuntimeLimitFault {
    return this.location === undefined
      ? new RuntimeLimitFault(this.resource, this.maximum, this.message, this.observed, location)
      : this;
  }
}

export const toRuntimeErrorInfo = (error: unknown): RuntimeErrorInfo => {
  if (error instanceof RuntimeFault) {
    if (error.location === undefined) {
      return { code: error.code, message: error.message };
    }
    return {
      code: error.code,
      message: error.message,
      nodeId: error.location.nodeId,
      span: error.location.span,
    };
  }

  return {
    code: 'internal-error',
    message: 'A aparut o eroare interna in timpul executiei.',
  };
};
