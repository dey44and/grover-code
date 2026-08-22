import { RuntimeFault, RuntimeLimitFault } from './errors.js';
import {
  booleanValue,
  integerValue,
  isNumericValue,
  realValue,
  runtimeValuesEqual,
  stringValue,
  type NumericValue,
  type RuntimeValue,
} from './value.js';

export interface ValueLimits {
  readonly maxIntegerBits: number;
  readonly maxStringLength: number;
}

export const DEFAULT_VALUE_LIMITS: ValueLimits = Object.freeze({
  maxIntegerBits: 65_536,
  maxStringLength: 1_000_000,
});

export const integerBitLength = (value: bigint): number => {
  const magnitude = value < 0n ? -value : value;
  return magnitude === 0n ? 1 : magnitude.toString(2).length;
};

export const enforceValueLimits = (
  value: RuntimeValue,
  limits: ValueLimits = DEFAULT_VALUE_LIMITS,
): RuntimeValue => {
  if (value.type === 'integer') {
    const bits = integerBitLength(value.value);
    if (bits > limits.maxIntegerBits) {
      throw new RuntimeLimitFault(
        'integer-bits',
        limits.maxIntegerBits,
        `Valoarea intreaga depaseste limita de ${limits.maxIntegerBits} biti.`,
        bits,
      );
    }
  } else if (value.type === 'string' && value.value.length > limits.maxStringLength) {
    throw new RuntimeLimitFault(
      'string-length',
      limits.maxStringLength,
      `Sirul de caractere depaseste limita de ${limits.maxStringLength} caractere UTF-16.`,
      value.value.length,
    );
  }
  return value;
};

const typeName = (value: RuntimeValue): string => {
  switch (value.type) {
    case 'integer':
      return 'intreg';
    case 'real':
      return 'real';
    case 'boolean':
      return 'logic';
    case 'string':
      return 'sir de caractere';
  }
};

export const expectBoolean = (value: RuntimeValue): boolean => {
  if (value.type !== 'boolean') {
    throw new RuntimeFault(
      'expected-boolean',
      `Conditia trebuie sa aiba o valoare logica, dar a primit ${typeName(value)}.`,
    );
  }
  return value.value;
};

const expectNumeric = (value: RuntimeValue, operator: string): NumericValue => {
  if (!isNumericValue(value)) {
    throw new RuntimeFault(
      'expected-number',
      `Operatorul „${operator}” necesita valori numerice, dar a primit ${typeName(value)}.`,
    );
  }
  return value;
};

const finiteReal = (value: number): RuntimeValue => {
  if (!Number.isFinite(value)) {
    throw new RuntimeFault(
      'numeric-overflow',
      'Rezultatul real depaseste domeniul numeric acceptat.',
    );
  }
  return realValue(value);
};

const asReal = (value: NumericValue): number => Number(value.value);

const sameNumericKind = (
  left: NumericValue,
  right: NumericValue,
  integerOperation: (left: bigint, right: bigint) => bigint,
  realOperation: (left: number, right: number) => number,
): RuntimeValue => {
  if (left.type === 'integer' && right.type === 'integer') {
    return integerValue(integerOperation(left.value, right.value));
  }
  return finiteReal(realOperation(asReal(left), asReal(right)));
};

export const evaluateUnaryOperation = (
  operator: string,
  operand: RuntimeValue,
  limits: ValueLimits = DEFAULT_VALUE_LIMITS,
): RuntimeValue => {
  switch (operator) {
    case '+':
      return enforceValueLimits(expectNumeric(operand, operator), limits);
    case '-': {
      const numeric = expectNumeric(operand, operator);
      return enforceValueLimits(
        numeric.type === 'integer' ? integerValue(-numeric.value) : finiteReal(-numeric.value),
        limits,
      );
    }
    case 'nu':
    case '!':
      return booleanValue(!expectBoolean(operand));
    default:
      throw new RuntimeFault(
        'unsupported-operator',
        `Operatorul unar „${operator}” nu este suportat.`,
      );
  }
};

const compareNumeric = (left: NumericValue, right: NumericValue): -1 | 0 | 1 => {
  if (left.type === 'integer' && right.type === 'integer') {
    return left.value < right.value ? -1 : left.value > right.value ? 1 : 0;
  }
  if (left.type === 'real' && right.type === 'real') {
    return left.value < right.value ? -1 : left.value > right.value ? 1 : 0;
  }
  if (left.type === 'integer' && right.type === 'real') {
    if (Number.isInteger(right.value)) {
      const rightInteger = BigInt(right.value);
      return left.value < rightInteger ? -1 : left.value > rightInteger ? 1 : 0;
    }
    const floor = BigInt(Math.floor(right.value));
    return left.value <= floor ? -1 : 1;
  }

  if (left.type !== 'real' || right.type !== 'integer') {
    throw new RuntimeFault('internal-error', 'Comparatia numerica a primit valori invalide.');
  }
  const leftReal = left.value;
  const rightInteger = right.value;
  if (Number.isInteger(leftReal)) {
    const leftInteger = BigInt(leftReal);
    return leftInteger < rightInteger ? -1 : leftInteger > rightInteger ? 1 : 0;
  }
  const floor = BigInt(Math.floor(leftReal));
  return floor < rightInteger ? -1 : 1;
};

const compareValues = (left: RuntimeValue, right: RuntimeValue): -1 | 0 | 1 => {
  if (isNumericValue(left) && isNumericValue(right)) {
    return compareNumeric(left, right);
  }
  if (left.type === 'string' && right.type === 'string') {
    return left.value < right.value ? -1 : left.value > right.value ? 1 : 0;
  }
  throw new RuntimeFault(
    'type-mismatch',
    `Valorile de tip ${typeName(left)} si ${typeName(right)} nu pot fi ordonate.`,
  );
};

const exponentiate = (
  left: RuntimeValue,
  right: RuntimeValue,
  limits: ValueLimits,
): RuntimeValue => {
  const base = expectNumeric(left, '^');
  const exponent = expectNumeric(right, '^');
  if (base.type === 'integer' && exponent.type === 'integer' && exponent.value >= 0n) {
    if (exponent.value === 0n) {
      return integerValue(1n);
    }
    if (base.value === 0n || base.value === 1n) {
      return base;
    }
    if (base.value === -1n) {
      return integerValue(exponent.value % 2n === 0n ? 1n : -1n);
    }
    // A b-bit base raised to e has between (b - 1) * e + 1 and b * e bits.
    // Reject only from the lower bound; the exact post-check handles the narrow
    // uncertain interval without constructing more than about 2x the limit.
    const minimumResultBits = BigInt(integerBitLength(base.value) - 1) * exponent.value + 1n;
    if (minimumResultBits > BigInt(limits.maxIntegerBits)) {
      throw new RuntimeLimitFault(
        'integer-bits',
        limits.maxIntegerBits,
        `Rezultatul puterii ar depasi limita de ${limits.maxIntegerBits} biti.`,
      );
    }
    return enforceValueLimits(integerValue(base.value ** exponent.value), limits);
  }
  const result = asReal(base) ** asReal(exponent);
  if (Number.isNaN(result)) {
    throw new RuntimeFault(
      'invalid-exponent',
      'Puterea nu are un rezultat real pentru valorile primite.',
    );
  }
  return finiteReal(result);
};

/** Evaluates a non-short-circuiting binary operator. */
export const evaluateBinaryOperation = (
  operator: string,
  left: RuntimeValue,
  right: RuntimeValue,
  limits: ValueLimits = DEFAULT_VALUE_LIMITS,
): RuntimeValue => {
  switch (operator) {
    case '+': {
      if (left.type === 'string' && right.type === 'string') {
        if (left.value.length + right.value.length > limits.maxStringLength) {
          throw new RuntimeLimitFault(
            'string-length',
            limits.maxStringLength,
            `Sirul concatenat ar depasi limita de ${limits.maxStringLength} caractere UTF-16.`,
            left.value.length + right.value.length,
          );
        }
        return stringValue(left.value + right.value);
      }
      const leftNumber = expectNumeric(left, operator);
      const rightNumber = expectNumeric(right, operator);
      return enforceValueLimits(
        sameNumericKind(
          leftNumber,
          rightNumber,
          (a, b) => a + b,
          (a, b) => a + b,
        ),
        limits,
      );
    }
    case '-': {
      const leftNumber = expectNumeric(left, operator);
      const rightNumber = expectNumeric(right, operator);
      return enforceValueLimits(
        sameNumericKind(
          leftNumber,
          rightNumber,
          (a, b) => a - b,
          (a, b) => a - b,
        ),
        limits,
      );
    }
    case '*': {
      const leftNumber = expectNumeric(left, operator);
      const rightNumber = expectNumeric(right, operator);
      return enforceValueLimits(
        sameNumericKind(
          leftNumber,
          rightNumber,
          (a, b) => a * b,
          (a, b) => a * b,
        ),
        limits,
      );
    }
    case '/': {
      const leftNumber = expectNumeric(left, operator);
      const rightNumber = expectNumeric(right, operator);
      if (rightNumber.value === 0 || rightNumber.value === 0n) {
        throw new RuntimeFault('division-by-zero', 'Impartirea la zero nu este definita.');
      }
      return finiteReal(asReal(leftNumber) / asReal(rightNumber));
    }
    case 'div': {
      const leftNumber = expectNumeric(left, operator);
      const rightNumber = expectNumeric(right, operator);
      if (leftNumber.type !== 'integer' || rightNumber.type !== 'integer') {
        throw new RuntimeFault('type-mismatch', 'Operatorul „div” accepta numai operanzi intregi.');
      }
      if (rightNumber.value === 0n) {
        throw new RuntimeFault('division-by-zero', 'Impartirea la zero nu este definita.');
      }
      return enforceValueLimits(integerValue(leftNumber.value / rightNumber.value), limits);
    }
    case '%':
    case 'mod': {
      const leftNumber = expectNumeric(left, operator);
      const rightNumber = expectNumeric(right, operator);
      if (leftNumber.type !== 'integer' || rightNumber.type !== 'integer') {
        throw new RuntimeFault(
          'type-mismatch',
          `Operatorul „${operator}” accepta numai operanzi intregi.`,
        );
      }
      if (rightNumber.value === 0n) {
        throw new RuntimeFault('division-by-zero', 'Restul impartirii la zero nu este definit.');
      }
      return enforceValueLimits(integerValue(leftNumber.value % rightNumber.value), limits);
    }
    case '^':
      return exponentiate(left, right, limits);
    case '=':
    case '==':
      return booleanValue(runtimeValuesEqual(left, right));
    case '!=':
    case '<>':
    case '≠':
      return booleanValue(!runtimeValuesEqual(left, right));
    case '<':
      return booleanValue(compareValues(left, right) < 0);
    case '<=':
    case '≤':
      return booleanValue(compareValues(left, right) <= 0);
    case '>':
      return booleanValue(compareValues(left, right) > 0);
    case '>=':
    case '≥':
      return booleanValue(compareValues(left, right) >= 0);
    default:
      throw new RuntimeFault(
        'unsupported-operator',
        `Operatorul binar „${operator}” nu este suportat.`,
      );
  }
};

export const integerPart = (
  value: RuntimeValue,
  limits: ValueLimits = DEFAULT_VALUE_LIMITS,
): RuntimeValue => {
  const numeric = expectNumeric(value, '[]');
  if (numeric.type === 'integer') {
    return numeric;
  }
  // Every finite integral binary64 number can be converted exactly to BigInt,
  // including values outside Number.MAX_SAFE_INTEGER. The configured bit limit
  // remains the resource-safety boundary.
  return enforceValueLimits(integerValue(BigInt(Math.floor(numeric.value))), limits);
};
