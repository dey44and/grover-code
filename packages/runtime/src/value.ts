/** A value manipulated by a Grover program. Values are immutable and tagged. */
export type RuntimeValue = IntegerValue | RealValue | BooleanValue | StringValue;

export interface IntegerValue {
  readonly type: 'integer';
  readonly value: bigint;
}

export interface RealValue {
  readonly type: 'real';
  readonly value: number;
}

export interface BooleanValue {
  readonly type: 'boolean';
  readonly value: boolean;
}

export interface StringValue {
  readonly type: 'string';
  readonly value: string;
}

export type NumericValue = IntegerValue | RealValue;

export const integerValue = (value: bigint | number | string): IntegerValue => {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || !Number.isFinite(value))) {
    throw new RangeError(
      'O valoare intreaga creata dintr-un number trebuie sa fie finita si exacta.',
    );
  }

  return Object.freeze({ type: 'integer', value: BigInt(value) });
};

export const realValue = (value: number): RealValue => {
  if (!Number.isFinite(value)) {
    throw new RangeError('O valoare reala trebuie sa fie finita.');
  }

  return Object.freeze({ type: 'real', value });
};

export const booleanValue = (value: boolean): BooleanValue =>
  Object.freeze({ type: 'boolean', value });

export const stringValue = (value: string): StringValue => Object.freeze({ type: 'string', value });

export const isNumericValue = (value: RuntimeValue): value is NumericValue =>
  value.type === 'integer' || value.type === 'real';

/** Formats a value with the spellings used by the Romanian pseudocode dialect. */
export const formatRuntimeValue = (value: RuntimeValue): string => {
  switch (value.type) {
    case 'integer':
      return value.value.toString();
    case 'real':
      return Object.is(value.value, -0) ? '0' : value.value.toString();
    case 'boolean':
      return value.value ? 'adevarat' : 'fals';
    case 'string':
      return value.value;
  }
};

export const runtimeValuesEqual = (left: RuntimeValue, right: RuntimeValue): boolean => {
  if (left.type === right.type) {
    return left.value === right.value;
  }

  if (isNumericValue(left) && isNumericValue(right)) {
    if (left.type === 'integer' && right.type === 'real') {
      return Number.isInteger(right.value) && left.value === BigInt(right.value);
    }
    if (left.type === 'real' && right.type === 'integer') {
      return Number.isInteger(left.value) && BigInt(left.value) === right.value;
    }
  }

  return false;
};

/** Equality for debugger state, where a type change is itself observable. */
export const runtimeValuesIdentical = (left: RuntimeValue, right: RuntimeValue): boolean => {
  if (left.type !== right.type) {
    return false;
  }
  switch (left.type) {
    case 'integer':
      return right.type === 'integer' && left.value === right.value;
    case 'real':
      return right.type === 'real' && Object.is(left.value, right.value);
    case 'boolean':
      return right.type === 'boolean' && left.value === right.value;
    case 'string':
      return right.type === 'string' && left.value === right.value;
  }
};

export const cloneRuntimeValue = (value: RuntimeValue): RuntimeValue => {
  switch (value.type) {
    case 'integer':
      return integerValue(value.value);
    case 'real':
      return realValue(value.value);
    case 'boolean':
      return booleanValue(value.value);
    case 'string':
      return stringValue(value.value);
  }
};
