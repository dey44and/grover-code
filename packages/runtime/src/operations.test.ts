import { describe, expect, it } from 'vitest';

import {
  RuntimeFault,
  RuntimeLimitFault,
  type RuntimeErrorCode,
  type RuntimeResource,
} from './errors.js';
import {
  enforceValueLimits,
  evaluateBinaryOperation,
  evaluateUnaryOperation,
  integerBitLength,
  integerPart,
  type ValueLimits,
} from './operations.js';
import { booleanValue, integerValue, realValue, stringValue } from './value.js';

const restrictiveLimits: ValueLimits = {
  maxIntegerBits: 3,
  maxStringLength: 4,
};

const captureError = (operation: () => unknown): Error => {
  try {
    operation();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error('Operatia a aruncat o valoare care nu este Error.', { cause: error });
  }
  throw new Error('Operatia trebuia sa arunce o eroare.');
};

const expectRuntimeFault = (operation: () => unknown, code: RuntimeErrorCode): RuntimeFault => {
  const error = captureError(operation);
  expect(error).toBeInstanceOf(RuntimeFault);
  if (!(error instanceof RuntimeFault)) {
    throw error;
  }
  expect(error.code).toBe(code);
  return error;
};

const expectLimitFault = (
  operation: () => unknown,
  resource: RuntimeResource,
  maximum: number,
  observed?: number,
): RuntimeLimitFault => {
  const error = captureError(operation);
  expect(error).toBeInstanceOf(RuntimeLimitFault);
  if (!(error instanceof RuntimeLimitFault)) {
    throw error;
  }
  expect(error).toMatchObject({ resource, maximum, observed });
  return error;
};

describe('runtime value limits', () => {
  it('measures integer magnitudes, including zero and negative values', () => {
    expect(integerBitLength(0n)).toBe(1);
    expect(integerBitLength(1n)).toBe(1);
    expect(integerBitLength(7n)).toBe(3);
    expect(integerBitLength(-8n)).toBe(4);
  });

  it('accepts values at the boundary and reports integer and UTF-16 string excesses', () => {
    const boundaryInteger = integerValue(7n);
    const boundaryString = stringValue('abcd');
    const boolean = booleanValue(true);

    expect(enforceValueLimits(boundaryInteger, restrictiveLimits)).toBe(boundaryInteger);
    expect(enforceValueLimits(boundaryString, restrictiveLimits)).toBe(boundaryString);
    expect(enforceValueLimits(boolean, restrictiveLimits)).toBe(boolean);
    expectLimitFault(
      () => enforceValueLimits(integerValue(-8n), restrictiveLimits),
      'integer-bits',
      3,
      4,
    );
    expectLimitFault(
      () => enforceValueLimits(stringValue('abcde'), restrictiveLimits),
      'string-length',
      4,
      5,
    );
  });
});

describe('unary operations', () => {
  it('preserves unary plus and negates integer and real operands', () => {
    const integer = integerValue(3n);
    const real = realValue(-2.5);

    expect(evaluateUnaryOperation('+', integer)).toBe(integer);
    expect(evaluateUnaryOperation('+', real)).toBe(real);
    expect(evaluateUnaryOperation('-', integer)).toEqual(integerValue(-3n));
    expect(evaluateUnaryOperation('-', real)).toEqual(realValue(2.5));
  });

  it('supports both logical-negation spellings', () => {
    expect(evaluateUnaryOperation('nu', booleanValue(true))).toEqual(booleanValue(false));
    expect(evaluateUnaryOperation('!', booleanValue(false))).toEqual(booleanValue(true));
  });

  it('reports operand, resource, and unsupported-operator errors', () => {
    expectRuntimeFault(() => evaluateUnaryOperation('+', stringValue('3')), 'expected-number');
    expectRuntimeFault(() => evaluateUnaryOperation('-', booleanValue(false)), 'expected-number');
    expectRuntimeFault(() => evaluateUnaryOperation('nu', integerValue(1n)), 'expected-boolean');
    expectRuntimeFault(() => evaluateUnaryOperation('~', integerValue(1n)), 'unsupported-operator');
    expectLimitFault(
      () => evaluateUnaryOperation('+', integerValue(8n), restrictiveLimits),
      'integer-bits',
      3,
      4,
    );
  });
});

describe('arithmetic operations', () => {
  it('keeps all-integer arithmetic exact', () => {
    expect(evaluateBinaryOperation('+', integerValue(7n), integerValue(2n))).toEqual(
      integerValue(9n),
    );
    expect(evaluateBinaryOperation('-', integerValue(7n), integerValue(2n))).toEqual(
      integerValue(5n),
    );
    expect(evaluateBinaryOperation('*', integerValue(7n), integerValue(2n))).toEqual(
      integerValue(14n),
    );
  });

  it('promotes mixed and real arithmetic to real values', () => {
    expect(evaluateBinaryOperation('+', integerValue(2n), realValue(0.5))).toEqual(realValue(2.5));
    expect(evaluateBinaryOperation('-', realValue(2.5), integerValue(1n))).toEqual(realValue(1.5));
    expect(evaluateBinaryOperation('*', realValue(1.5), realValue(2))).toEqual(realValue(3));
  });

  it('reports integer limits, binary64 overflow, and nonnumeric operands', () => {
    expectLimitFault(
      () => evaluateBinaryOperation('+', integerValue(7n), integerValue(1n), restrictiveLimits),
      'integer-bits',
      3,
      4,
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('*', realValue(Number.MAX_VALUE), realValue(2)),
      'numeric-overflow',
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('-', integerValue(1n), stringValue('1')),
      'expected-number',
    );
  });

  it('concatenates strings and enforces the configured UTF-16 limit', () => {
    expect(
      evaluateBinaryOperation('+', stringValue('ab'), stringValue('cd'), restrictiveLimits),
    ).toEqual(stringValue('abcd'));
    expectLimitFault(
      () => evaluateBinaryOperation('+', stringValue('abc'), stringValue('de'), restrictiveLimits),
      'string-length',
      4,
      5,
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('+', stringValue('1'), integerValue(1n)),
      'expected-number',
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('+', integerValue(1n), stringValue('1')),
      'expected-number',
    );
  });
});

describe('division and remainder operations', () => {
  it('implements slash division as real division', () => {
    expect(evaluateBinaryOperation('/', integerValue(7n), integerValue(2n))).toEqual(
      realValue(3.5),
    );
    expect(evaluateBinaryOperation('/', realValue(-3), integerValue(2n))).toEqual(realValue(-1.5));
    expectRuntimeFault(
      () => evaluateBinaryOperation('/', integerValue(1n), integerValue(0n)),
      'division-by-zero',
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('/', integerValue(1n), realValue(-0)),
      'division-by-zero',
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('/', realValue(Number.MAX_VALUE), realValue(0.5)),
      'numeric-overflow',
    );
  });

  it('makes div truncate toward zero and require integer operands', () => {
    expect(evaluateBinaryOperation('div', integerValue(-7n), integerValue(3n))).toEqual(
      integerValue(-2n),
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('div', realValue(7), integerValue(3n)),
      'type-mismatch',
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('div', integerValue(7n), realValue(3)),
      'type-mismatch',
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('div', integerValue(7n), integerValue(0n)),
      'division-by-zero',
    );
  });

  it('supports both remainder spellings and reports invalid operands', () => {
    expect(evaluateBinaryOperation('%', integerValue(-7n), integerValue(3n))).toEqual(
      integerValue(-1n),
    );
    expect(evaluateBinaryOperation('mod', integerValue(7n), integerValue(3n))).toEqual(
      integerValue(1n),
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('mod', realValue(7), integerValue(3n)),
      'type-mismatch',
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('%', integerValue(7n), realValue(3)),
      'type-mismatch',
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('mod', integerValue(7n), integerValue(0n)),
      'division-by-zero',
    );
  });
});

describe('comparison operations', () => {
  it('supports equality aliases across compatible and incompatible value types', () => {
    expect(evaluateBinaryOperation('=', integerValue(2n), realValue(2))).toEqual(
      booleanValue(true),
    );
    expect(evaluateBinaryOperation('==', stringValue('doi'), stringValue('doi'))).toEqual(
      booleanValue(true),
    );
    expect(evaluateBinaryOperation('!=', realValue(2), integerValue(2n))).toEqual(
      booleanValue(false),
    );
    expect(evaluateBinaryOperation('<>', booleanValue(true), booleanValue(false))).toEqual(
      booleanValue(true),
    );
    expect(evaluateBinaryOperation('≠', stringValue('2'), integerValue(2n))).toEqual(
      booleanValue(true),
    );
    expect(
      evaluateBinaryOperation('=', integerValue(9_007_199_254_740_993n), realValue(2 ** 53)),
    ).toEqual(booleanValue(false));
  });

  it('orders integer and real values without losing integer precision', () => {
    expect(
      evaluateBinaryOperation('>', integerValue(9_007_199_254_740_993n), realValue(2 ** 53)),
    ).toEqual(booleanValue(true));
    expect(evaluateBinaryOperation('<', integerValue(2n), realValue(2.5))).toEqual(
      booleanValue(true),
    );
    expect(evaluateBinaryOperation('>', integerValue(3n), realValue(2.5))).toEqual(
      booleanValue(true),
    );
    expect(evaluateBinaryOperation('<', realValue(2.5), integerValue(3n))).toEqual(
      booleanValue(true),
    );
    expect(evaluateBinaryOperation('>', realValue(2.5), integerValue(2n))).toEqual(
      booleanValue(true),
    );
    expect(evaluateBinaryOperation('≤', realValue(2), integerValue(2n))).toEqual(
      booleanValue(true),
    );
    expect(evaluateBinaryOperation('≥', realValue(3), realValue(2.5))).toEqual(booleanValue(true));
  });

  it('orders strings and rejects unordered type pairs', () => {
    expect(evaluateBinaryOperation('<', stringValue('ana'), stringValue('ion'))).toEqual(
      booleanValue(true),
    );
    expect(evaluateBinaryOperation('>=', stringValue('ion'), stringValue('ion'))).toEqual(
      booleanValue(true),
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('<', booleanValue(false), booleanValue(true)),
      'type-mismatch',
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('>', stringValue('2'), integerValue(2n)),
      'type-mismatch',
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('<', realValue(2), stringValue('2')),
      'type-mismatch',
    );
  });
});

describe('exponentiation', () => {
  it('handles integer identities, parity, and ordinary exact powers', () => {
    expect(evaluateBinaryOperation('^', integerValue(42n), integerValue(0n))).toEqual(
      integerValue(1n),
    );
    expect(evaluateBinaryOperation('^', integerValue(0n), integerValue(5n))).toEqual(
      integerValue(0n),
    );
    expect(evaluateBinaryOperation('^', integerValue(1n), integerValue(100_000n))).toEqual(
      integerValue(1n),
    );
    expect(evaluateBinaryOperation('^', integerValue(-1n), integerValue(6n))).toEqual(
      integerValue(1n),
    );
    expect(evaluateBinaryOperation('^', integerValue(-1n), integerValue(7n))).toEqual(
      integerValue(-1n),
    );
    expect(evaluateBinaryOperation('^', integerValue(2n), integerValue(10n))).toEqual(
      integerValue(1_024n),
    );
  });

  it('preflights clearly excessive powers and post-checks the uncertain boundary', () => {
    expectLimitFault(
      () =>
        evaluateBinaryOperation('^', integerValue(2n), integerValue(100n), {
          maxIntegerBits: 32,
          maxStringLength: 10,
        }),
      'integer-bits',
      32,
    );
    expectLimitFault(
      () =>
        evaluateBinaryOperation('^', integerValue(3n), integerValue(5n), {
          maxIntegerBits: 7,
          maxStringLength: 10,
        }),
      'integer-bits',
      7,
      8,
    );
  });

  it('supports real powers and reports invalid or overflowing results', () => {
    expect(evaluateBinaryOperation('^', integerValue(2n), integerValue(-2n))).toEqual(
      realValue(0.25),
    );
    expect(evaluateBinaryOperation('^', integerValue(9n), realValue(0.5))).toEqual(realValue(3));
    expectRuntimeFault(
      () => evaluateBinaryOperation('^', integerValue(-1n), realValue(0.5)),
      'invalid-exponent',
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('^', realValue(Number.MAX_VALUE), integerValue(2n)),
      'numeric-overflow',
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('^', stringValue('2'), integerValue(2n)),
      'expected-number',
    );
    expectRuntimeFault(
      () => evaluateBinaryOperation('^', integerValue(2n), booleanValue(true)),
      'expected-number',
    );
  });
});

describe('integer part and unsupported operations', () => {
  it('preserves integers and floors positive and negative real values', () => {
    const integer = integerValue(5n);
    expect(integerPart(integer)).toBe(integer);
    expect(integerPart(realValue(3.9))).toEqual(integerValue(3n));
    expect(integerPart(realValue(-2.1))).toEqual(integerValue(-3n));
    expect(integerPart(realValue(1e20))).toEqual(integerValue(100_000_000_000_000_000_000n));
  });

  it('reports invalid operands and integer-part resource excesses', () => {
    expectRuntimeFault(() => integerPart(stringValue('3')), 'expected-number');
    expectLimitFault(() => integerPart(realValue(16), restrictiveLimits), 'integer-bits', 3, 5);
    expectRuntimeFault(
      () => evaluateBinaryOperation('&', integerValue(1n), integerValue(2n)),
      'unsupported-operator',
    );
  });
});
