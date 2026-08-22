import type {
  AssignmentStatement,
  BinaryExpression,
  BinaryOperator,
  Expression,
  ForStatement,
  Identifier,
  IfStatement,
  IntegerPartExpression,
  LiteralExpression,
  Program,
  ReadStatement,
  RepeatUntilStatement,
  SourceSpan,
  Statement,
  WhileStatement,
  WriteStatement,
} from '@grover/language';
import { beforeEach, describe, expect, it } from 'vitest';

import { createInterpreter } from './interpreter.js';
import { InputTape, parseInputTape } from './input.js';
import { booleanValue, integerValue, realValue, stringValue } from './value.js';

const span: SourceSpan = {
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 1, line: 1, column: 2 },
};

let nextNodeId = 0;
const metadata = (): { readonly id: string; readonly span: SourceSpan } => ({
  id: `test-node-${String((nextNodeId += 1))}`,
  span,
});

const identifier = (name: string): Identifier => ({
  kind: 'Identifier',
  ...metadata(),
  name,
});

const integer = (value: bigint | number | string): LiteralExpression => {
  const canonical = value.toString();
  return {
    kind: 'Literal',
    ...metadata(),
    valueType: 'integer',
    value: canonical,
    raw: canonical,
  };
};

const real = (value: string): LiteralExpression => ({
  kind: 'Literal',
  ...metadata(),
  valueType: 'real',
  value,
  raw: value,
});

const boolean = (value: boolean): LiteralExpression => ({
  kind: 'Literal',
  ...metadata(),
  valueType: 'boolean',
  value,
  raw: value ? 'adevarat' : 'fals',
});

const string = (value: string): LiteralExpression => ({
  kind: 'Literal',
  ...metadata(),
  valueType: 'string',
  value,
  raw: JSON.stringify(value),
});

const binary = (
  left: Expression,
  operator: BinaryOperator,
  right: Expression,
): BinaryExpression => ({
  kind: 'BinaryExpression',
  ...metadata(),
  operator,
  left,
  right,
});

const integerPartExpression = (expression: Expression): IntegerPartExpression => ({
  kind: 'IntegerPartExpression',
  ...metadata(),
  expression,
});

const assign = (name: string, value: Expression): AssignmentStatement => ({
  kind: 'AssignmentStatement',
  ...metadata(),
  target: identifier(name),
  value,
});

const read = (...names: readonly string[]): ReadStatement => ({
  kind: 'ReadStatement',
  ...metadata(),
  targets: names.map(identifier),
});

const write = (...values: readonly Expression[]): WriteStatement => ({
  kind: 'WriteStatement',
  ...metadata(),
  values,
});

const ifStatement = (
  condition: Expression,
  thenBranch: readonly Statement[],
  elseBranch: readonly Statement[] = [],
): IfStatement => ({
  kind: 'IfStatement',
  ...metadata(),
  condition,
  thenBranch,
  elseBranch,
});

const whileStatement = (condition: Expression, body: readonly Statement[]): WhileStatement => ({
  kind: 'WhileStatement',
  ...metadata(),
  condition,
  body,
});

const repeatUntil = (body: readonly Statement[], condition: Expression): RepeatUntilStatement => ({
  kind: 'RepeatUntilStatement',
  ...metadata(),
  body,
  condition,
});

const forStatement = (
  variable: string,
  start: Expression,
  end: Expression,
  body: readonly Statement[],
  step?: Expression,
): ForStatement => ({
  kind: 'ForStatement',
  ...metadata(),
  variable: identifier(variable),
  start,
  end,
  ...(step === undefined ? {} : { step }),
  body,
});

const program = (...body: readonly Statement[]): Program => ({
  kind: 'Program',
  ...metadata(),
  body,
});

beforeEach(() => {
  nextNodeId = 0;
});

describe('input tape', () => {
  it('parses typed values and quoted strings without losing integer precision', () => {
    const parsed = parseInputTape('900719925474099312345 2.5 adevarat "Ana Maria" simplu');

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.values).toEqual([
      integerValue('900719925474099312345'),
      realValue(2.5),
      booleanValue(true),
      stringValue('Ana Maria'),
      stringValue('simplu'),
    ]);
  });

  it('decodes JSON-compatible control and Unicode escapes in quoted input', () => {
    const parsed = parseInputTape('"a\\b\\f\\u0041"');

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.values).toEqual([stringValue('a\b\fA')]);
  });

  it('reports an unterminated quoted value', () => {
    const parsed = parseInputTape('1 "neterminat');

    expect(parsed.diagnostics).toHaveLength(1);
    expect(parsed.diagnostics[0]?.message).toContain('nu este inchis');
  });

  it('takes ownership of caller-provided values without retaining mutable references', () => {
    const external = { type: 'integer' as const, value: 1n };
    const tape = new InputTape([external]);

    external.value = 99n;

    expect(tape.consume(1)).toEqual([integerValue(1)]);
  });
});

describe('deterministic execution', () => {
  it('executes a while loop one assignment or condition at a time', () => {
    const machine = createInterpreter(
      program(
        assign('x', integer(0)),
        whileStatement(binary(identifier('x'), '<', integer(3)), [
          assign('x', binary(identifier('x'), '+', integer(1))),
        ]),
        write(identifier('x')),
      ),
    );

    expect(machine.step().variables.x).toEqual(integerValue(0));
    expect(machine.step().trace.at(-1)).toMatchObject({
      phase: 'condition',
      conditionResult: true,
    });

    const finalState = machine.run();
    expect(finalState.status).toBe('completed');
    expect(finalState.variables.x).toEqual(integerValue(3));
    expect(finalState.renderedOutput).toBe('3');
    expect(finalState.trace.map((record) => record.phase)).toEqual([
      'assignment',
      'condition',
      'assignment',
      'condition',
      'assignment',
      'condition',
      'assignment',
      'condition',
      'write',
    ]);
  });

  it('executes a repeta block before testing its condition', () => {
    const machine = createInterpreter(
      program(
        assign('x', integer(10)),
        repeatUntil(
          [assign('x', binary(identifier('x'), '+', integer(1)))],
          binary(identifier('x'), '>=', integer(10)),
        ),
      ),
    );

    const state = machine.run();
    expect(state.status).toBe('completed');
    expect(state.variables.x).toEqual(integerValue(11));
    expect(state.trace.at(-1)).toMatchObject({ phase: 'condition', conditionResult: true });
  });

  it('concatenates consecutive scrie statements without an implicit newline', () => {
    const machine = createInterpreter(
      program(write(string('a')), write(integer(1)), write(string('b'), integer(2))),
    );

    let state = machine.run();
    expect(state.status).toBe('completed');
    expect(state.output).toEqual(['a', '1', 'b 2']);
    expect(state.renderedOutput).toBe('a1b 2');
    expect(state.outputCharacters).toBe(5);
    expect(state.trace.map((record) => record.outputAppended)).toEqual(['a', '1', 'b 2']);

    state = machine.stepBack();
    expect(state.status).toBe('ready');
    expect(state.output).toEqual(['a', '1']);
    expect(state.renderedOutput).toBe('a1');
    expect(state.outputCharacters).toBe(2);

    state = machine.run();
    expect(state.renderedOutput).toBe('a1b 2');
  });

  it('starts a new output line only when the program writes one explicitly', () => {
    const machine = createInterpreter(
      program(write(string('a')), write(string('\n')), write(string('b'))),
    );

    const state = machine.run();
    expect(state.output).toEqual(['a', '\n', 'b']);
    expect(state.renderedOutput).toBe('a\nb');
    expect(state.outputCharacters).toBe(3);
  });

  it('supports an explicit separator for embedding applications', () => {
    const machine = createInterpreter(program(write(string('a')), write(string('b'))), {
      outputSeparator: '\n',
    });

    const state = machine.run();
    expect(state.renderedOutput).toBe('a\nb');
    expect(state.outputCharacters).toBe(3);
  });

  it('uses inclusive for bounds evaluated once and exposes counter updates', () => {
    const machine = createInterpreter(
      program(
        assign('n', integer(3)),
        assign('s', integer(0)),
        forStatement('i', integer(1), identifier('n'), [
          assign('s', binary(identifier('s'), '+', identifier('i'))),
          assign('n', integer(0)),
        ]),
        write(identifier('s')),
      ),
    );

    const state = machine.run();
    expect(state.status).toBe('completed');
    expect(state.variables.s).toEqual(integerValue(6));
    expect(state.variables.i).toEqual(integerValue(4));
    expect(state.renderedOutput).toBe('6');

    const loopConditions = state.trace.filter(
      (record) => record.phase === 'condition' && record.variableChanges[0]?.name === 'i',
    );
    expect(loopConditions.map((record) => record.conditionResult)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it('supports descending for loops with an explicit negative step', () => {
    const machine = createInterpreter(
      program(
        assign('s', integer(0)),
        forStatement(
          'i',
          integer(3),
          integer(1),
          [assign('s', binary(identifier('s'), '+', identifier('i')))],
          integer(-1),
        ),
      ),
    );

    const state = machine.run();
    expect(state.status).toBe('completed');
    expect(state.variables.s).toEqual(integerValue(6));
    expect(state.variables.i).toEqual(integerValue(0));
  });

  it('short-circuits logical operators', () => {
    const missingComparison = binary(identifier('lipsa'), '=', integer(0));
    const divisionByZero = binary(integer(1), '/', integer(0));
    const machine = createInterpreter(
      program(
        write(binary(boolean(false), 'si', missingComparison)),
        write(binary(boolean(true), 'sau', divisionByZero)),
      ),
    );

    const state = machine.run();
    expect(state.status).toBe('completed');
    expect(state.output).toEqual(['fals', 'adevarat']);
  });

  it('compares mixed integers and reals without lossy Number coercion', () => {
    const machine = createInterpreter(
      program(
        write(binary(integer('9007199254740993'), '=', real('9007199254740992'))),
        write(binary(integer('9007199254740992'), '=', real('9007199254740992'))),
      ),
    );

    expect(machine.run().output).toEqual(['fals', 'adevarat']);
  });

  it('preserves arbitrary-precision integers and floors integer-part expressions', () => {
    const huge = '999999999999999999999999999999999999';
    const machine = createInterpreter(
      program(
        assign('mare', binary(integer(huge), '+', integer(1))),
        assign('jos', integerPartExpression(real('-2.1'))),
        write(identifier('mare'), identifier('jos')),
      ),
    );

    const state = machine.run();
    expect(state.status).toBe('completed');
    expect(state.variables.mare).toEqual(integerValue('1000000000000000000000000000000000000'));
    expect(state.variables.jos).toEqual(integerValue(-3));
    expect(state.renderedOutput).toBe('1000000000000000000000000000000000000 -3');
  });

  it('converts the floor of an integral binary64 value outside the safe-integer range', () => {
    const machine = createInterpreter(program(assign('mare', integerPartExpression(real('1e30')))));

    const state = machine.run();
    expect(state.status).toBe('completed');
    expect(state.variables.mare).toEqual(integerValue(BigInt(1e30)));
  });
});

describe('debugger state', () => {
  it('waits atomically for all values requested by citeste', () => {
    const machine = createInterpreter(program(read('a', 'b'), write(identifier('a'))), {
      input: '7',
    });

    let state = machine.step();
    expect(state.status).toBe('waiting-input');
    expect(state.input.position).toBe(0);
    expect(state.variables).toEqual({});
    expect(state.waitingForInput).toMatchObject({ required: 2, available: 1 });

    state = machine.appendInput('8');
    expect(state.status).toBe('ready');
    state = machine.step();
    expect(state.variables).toMatchObject({ a: integerValue(7), b: integerValue(8) });
    expect(state.input.position).toBe(2);
  });

  it('reverses variable, input, output, loop-context, and trace state', () => {
    const machine = createInterpreter(program(read('x'), write(identifier('x'))), { input: '42' });

    expect(machine.run().status).toBe('completed');
    let state = machine.stepBack();
    expect(state.status).toBe('ready');
    expect(state.output).toEqual([]);
    expect(state.input.position).toBe(1);
    expect(state.variables.x).toEqual(integerValue(42));
    expect(state.trace).toHaveLength(1);

    state = machine.stepBack();
    expect(state.input.position).toBe(0);
    expect(state.variables.x).toBeUndefined();
    expect(state.trace).toEqual([]);

    state = machine.run();
    expect(state.status).toBe('completed');
    expect(state.renderedOutput).toBe('42');
  });

  it('enters limit state for non-terminating execution and can step back', () => {
    const machine = createInterpreter(program(whileStatement(boolean(true), [])));

    let state = machine.run({ maxSteps: 5 });
    expect(state.status).toBe('limit');
    expect(state.limit).toMatchObject({ kind: 'run', maximum: 5 });
    expect(state.trace).toHaveLength(5);

    state = machine.stepBack();
    expect(state.status).toBe('ready');
    expect(state.trace).toHaveLength(4);
    expect(machine.step().trace).toHaveLength(5);
  });

  it('enforces the cumulative execution limit', () => {
    const machine = createInterpreter(program(whileStatement(boolean(true), [])), {
      executionLimit: 3,
    });

    const state = machine.run();
    expect(state.status).toBe('limit');
    expect(state.limit).toMatchObject({ kind: 'execution', maximum: 3 });
    expect(state.stepsExecuted).toBe(3);
  });

  it('runs cooperative slices without emitting an artificial limit', () => {
    const machine = createInterpreter(program(whileStatement(boolean(true), [])), {
      executionLimit: 10,
    });

    let state = machine.runSlice(3);
    expect(state.status).toBe('ready');
    expect(state.trace).toHaveLength(3);
    expect(state.limit).toBeUndefined();

    state = machine.runSlice(3);
    expect(state.status).toBe('ready');
    expect(state.trace).toHaveLength(6);
  });

  it('stops atomically at integer, string, and output resource limits', () => {
    const integerMachine = createInterpreter(
      program(assign('x', binary(integer(2), '^', integer(100)))),
      {
        maxIntegerBits: 32,
      },
    );
    let state = integerMachine.step();
    expect(state.status).toBe('limit');
    expect(state.limit).toMatchObject({
      kind: 'resource',
      resource: 'integer-bits',
      maximum: 32,
      span,
    });
    expect(state.limit?.kind).toBe('resource');
    if (state.limit?.kind !== 'resource') {
      throw new Error('Expected a resource limit.');
    }
    expect(typeof state.limit.nodeId).toBe('string');
    expect(state.variables.x).toBeUndefined();
    expect(state.trace).toEqual([]);

    const stringMachine = createInterpreter(program(assign('s', string('abcd'))), {
      maxStringLength: 3,
    });
    state = stringMachine.step();
    expect(state.limit).toMatchObject({ kind: 'resource', resource: 'string-length' });
    expect(state.variables.s).toBeUndefined();

    const outputMachine = createInterpreter(program(write(string('abcd'))), {
      maxOutputCharacters: 3,
    });
    state = outputMachine.step();
    expect(state.limit).toMatchObject({ kind: 'resource', resource: 'output-characters' });
    expect(state.output).toEqual([]);
    expect(state.outputCharacters).toBe(0);
  });

  it('counts concatenated output across scrie statements and rejects overflow atomically', () => {
    const machine = createInterpreter(program(write(string('ab')), write(string('cd'))), {
      maxOutputCharacters: 3,
    });

    let state = machine.step();
    expect(state.status).toBe('ready');
    expect(state.renderedOutput).toBe('ab');
    expect(state.outputCharacters).toBe(2);

    state = machine.step();
    expect(state.status).toBe('limit');
    expect(state.limit).toMatchObject({
      kind: 'resource',
      resource: 'output-characters',
      maximum: 3,
      observed: 4,
    });
    expect(state.output).toEqual(['ab']);
    expect(state.renderedOutput).toBe('ab');
    expect(state.outputCharacters).toBe(2);
    expect(state.trace).toHaveLength(1);
  });

  it('rejects a programmatic deeply nested expression before exhausting the call stack', () => {
    let expression: Expression = integer(0);
    for (let index = 0; index < 10_000; index += 1) {
      expression = binary(expression, '+', integer(1));
    }
    const machine = createInterpreter(program(assign('x', expression)));

    const state = machine.step();
    expect(state.status).toBe('limit');
    expect(state.limit).toMatchObject({
      kind: 'resource',
      resource: 'expression-nodes',
      maximum: 512,
      observed: 513,
    });
    expect(state.error).toBeUndefined();
    expect(state.variables.x).toBeUndefined();
    expect(state.trace).toEqual([]);
  });

  it('does not reject a power whose exact value fits the integer-bit limit', () => {
    const machine = createInterpreter(program(assign('x', binary(integer(2), '^', integer(40)))), {
      maxIntegerBits: 64,
    });

    const state = machine.run();
    expect(state.status).toBe('completed');
    expect(state.variables.x).toEqual(integerValue(1n << 40n));
  });

  it('returns localized runtime errors without committing a partial step', () => {
    const division = binary(integer(7), '/', integer(0));
    const machine = createInterpreter(program(assign('x', division)));

    let state = machine.step();
    expect(state.status).toBe('error');
    expect(state.error).toMatchObject({
      code: 'division-by-zero',
      nodeId: division.id,
    });
    expect(state.error?.message).toContain('zero');
    expect(state.variables.x).toBeUndefined();
    expect(state.trace).toEqual([]);

    state = machine.stepBack();
    expect(state.status).toBe('ready');
  });

  it('treats a failed attempt as a reversible debugger transition', () => {
    const machine = createInterpreter(
      program(assign('x', integer(1)), assign('y', binary(integer(1), '/', integer(0)))),
    );

    expect(machine.run().status).toBe('error');
    let state = machine.stepBack();
    expect(state.status).toBe('ready');
    expect(state.variables.x).toEqual(integerValue(1));
    expect(state.stepsExecuted).toBe(1);
    expect(state.trace).toHaveLength(1);

    state = machine.stepBack();
    expect(state.variables.x).toBeUndefined();
    expect(state.stepsExecuted).toBe(0);
  });

  it('returns deeply immutable trace snapshots', () => {
    const machine = createInterpreter(program(assign('x', integer(1))));
    const state = machine.step();
    const record = state.trace[0];
    const change = record?.variableChanges[0];

    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.trace)).toBe(true);
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record?.variableChanges)).toBe(true);
    expect(Object.isFrozen(change)).toBe(true);
    expect(change === undefined ? undefined : Reflect.set(change, 'name', 'corupt')).toBe(false);
    expect(machine.state.trace[0]?.variableChanges[0]?.name).toBe('x');
  });

  it('replaces the input tape on reset', () => {
    const machine = createInterpreter(program(read('x')), { input: '1' });
    expect(machine.run().variables.x).toEqual(integerValue(1));

    const state = machine.reset('2');
    expect(state.status).toBe('ready');
    expect(state.input).toMatchObject({ position: 0, length: 1, remaining: 1 });
    expect(machine.run().variables.x).toEqual(integerValue(2));
  });
});

describe('official-style algorithm', () => {
  it('traces the even digits of a natural number in reverse order', () => {
    const digit = identifier('c');
    const source = identifier('n');
    const accumulator = identifier('x');
    const machine = createInterpreter(
      program(
        read('n'),
        assign('x', integer(0)),
        repeatUntil(
          [
            assign('c', binary(source, '%', integer(10))),
            assign('n', integerPartExpression(binary(source, '/', integer(10)))),
            ifStatement(binary(binary(digit, '%', integer(2)), '=', integer(0)), [
              assign('x', binary(binary(accumulator, '*', integer(10)), '+', digit)),
            ]),
          ],
          binary(source, '=', integer(0)),
        ),
        write(accumulator),
      ),
      { input: '123456' },
    );

    const state = machine.run();
    expect(state.status).toBe('completed');
    expect(state.variables.x).toEqual(integerValue(642));
    expect(state.renderedOutput).toBe('642');
    expect(state.trace.some((record) => record.conditionResult === false)).toBe(true);
    expect(state.trace.at(-1)?.phase).toBe('write');
  });
});
