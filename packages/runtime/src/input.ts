import {
  booleanValue,
  cloneRuntimeValue,
  integerValue,
  realValue,
  stringValue,
  type RuntimeValue,
} from './value.js';

export interface InputDiagnostic {
  readonly message: string;
  readonly start: number;
  readonly end: number;
}

export interface ParsedInputTape {
  readonly values: readonly RuntimeValue[];
  readonly diagnostics: readonly InputDiagnostic[];
}

export type InputSource = string | readonly RuntimeValue[];

const INTEGER_PATTERN = /^[+-]?\d+$/u;
const REAL_PATTERN = /^[+-]?(?:(?:\d+\.\d*)|(?:\d*\.\d+))(?:[eE][+-]?\d+)?$/u;
const EXPONENTIAL_PATTERN = /^[+-]?\d+[eE][+-]?\d+$/u;

const parseBareValue = (raw: string): RuntimeValue => {
  const normalized = raw.toLocaleLowerCase('ro-RO');
  if (normalized === 'adevarat' || normalized === 'true') {
    return booleanValue(true);
  }
  if (normalized === 'fals' || normalized === 'false') {
    return booleanValue(false);
  }
  if (INTEGER_PATTERN.test(raw)) {
    return integerValue(raw);
  }
  if (REAL_PATTERN.test(raw) || EXPONENTIAL_PATTERN.test(raw)) {
    const number = Number(raw);
    if (Number.isFinite(number)) {
      return realValue(number);
    }
  }
  return stringValue(raw);
};

const decodeEscape = (character: string): string | undefined => {
  switch (character) {
    case 'b':
      return '\b';
    case 'f':
      return '\f';
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 't':
      return '\t';
    case '\\':
      return '\\';
    case '"':
      return '"';
    case "'":
      return "'";
    default:
      return undefined;
  }
};

/**
 * Parses the input panel. Whitespace, commas, and semicolons separate values;
 * quoted strings may contain separators and the common backslash escapes.
 */
export const parseInputTape = (source: string): ParsedInputTape => {
  const values: RuntimeValue[] = [];
  const diagnostics: InputDiagnostic[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    while (cursor < source.length && /[\s,;]/u.test(source[cursor] ?? '')) {
      cursor += 1;
    }
    if (cursor >= source.length) {
      break;
    }

    const start = cursor;
    const quote = source[cursor];
    if (quote === '"' || quote === "'") {
      cursor += 1;
      let decoded = '';
      let terminated = false;
      while (cursor < source.length) {
        const character = source[cursor] ?? '';
        if (character === quote) {
          cursor += 1;
          terminated = true;
          break;
        }
        if (character === '\\') {
          const escaped = source[cursor + 1];
          if (escaped === undefined) {
            break;
          }
          const replacement = decodeEscape(escaped);
          if (escaped === 'u') {
            const digits = source.slice(cursor + 2, cursor + 6);
            if (/^[\dA-Fa-f]{4}$/u.test(digits)) {
              decoded += String.fromCharCode(Number.parseInt(digits, 16));
              cursor += 6;
              continue;
            }
          }
          if (replacement === undefined) {
            diagnostics.push({
              message: `Secventa escape \\${escaped} nu este valida.`,
              start: cursor,
              end: cursor + 2,
            });
            decoded += escaped;
          } else {
            decoded += replacement;
          }
          cursor += 2;
          continue;
        }
        decoded += character;
        cursor += 1;
      }

      if (!terminated) {
        diagnostics.push({
          message: 'Sirul de caractere din zona de intrare nu este inchis.',
          start,
          end: source.length,
        });
      }
      values.push(stringValue(decoded));
      continue;
    }

    while (cursor < source.length && !/[\s,;]/u.test(source[cursor] ?? '')) {
      cursor += 1;
    }
    values.push(parseBareValue(source.slice(start, cursor)));
  }

  return { values, diagnostics };
};

const parseSource = (source: InputSource): ParsedInputTape => {
  if (typeof source === 'string') {
    return parseInputTape(source);
  }
  // Break references to caller-owned objects so later external mutation cannot
  // change a deterministic execution tape.
  return { values: source.map(cloneRuntimeValue), diagnostics: [] };
};

/** Mutable cursor over immutable runtime values. Its cursor is part of machine history. */
export class InputTape {
  readonly #values: RuntimeValue[];
  #cursor = 0;

  public constructor(source: InputSource = []) {
    const parsed = parseSource(source);
    if (parsed.diagnostics.length > 0) {
      throw new InputTapeSyntaxError(parsed.diagnostics);
    }
    this.#values = [...parsed.values];
  }

  public get length(): number {
    return this.#values.length;
  }

  public get position(): number {
    return this.#cursor;
  }

  public get remaining(): number {
    return this.#values.length - this.#cursor;
  }

  public get values(): readonly RuntimeValue[] {
    return [...this.#values];
  }

  public append(source: InputSource): void {
    const parsed = parseSource(source);
    if (parsed.diagnostics.length > 0) {
      throw new InputTapeSyntaxError(parsed.diagnostics);
    }
    this.#values.push(...parsed.values);
  }

  public replace(source: InputSource): void {
    const parsed = parseSource(source);
    if (parsed.diagnostics.length > 0) {
      throw new InputTapeSyntaxError(parsed.diagnostics);
    }
    this.#values.length = 0;
    this.#values.push(...parsed.values);
    this.#cursor = 0;
  }

  public peek(count: number): readonly RuntimeValue[] | undefined {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError(
        'Numarul de valori solicitate din input tape trebuie sa fie un intreg pozitiv.',
      );
    }
    if (this.remaining < count) {
      return undefined;
    }
    return this.#values.slice(this.#cursor, this.#cursor + count);
  }

  public consume(count: number): readonly RuntimeValue[] | undefined {
    const values = this.peek(count);
    if (values === undefined) {
      return undefined;
    }
    this.#cursor += count;
    return values;
  }

  public restore(position: number): void {
    if (!Number.isSafeInteger(position) || position < 0 || position > this.#values.length) {
      throw new RangeError('Pozitia input tape-ului nu este valida.');
    }
    this.#cursor = position;
  }
}

export class InputTapeSyntaxError extends Error {
  public readonly diagnostics: readonly InputDiagnostic[];

  public constructor(diagnostics: readonly InputDiagnostic[]) {
    super(diagnostics[0]?.message ?? 'Input tape invalid.');
    this.name = 'InputTapeSyntaxError';
    this.diagnostics = [...diagnostics];
  }
}
