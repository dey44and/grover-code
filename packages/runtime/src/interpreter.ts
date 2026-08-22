import {
  MAX_EXPRESSION_NODES,
  type Expression,
  type Program,
  type Statement,
} from '@grover/language';

import {
  RuntimeFault,
  RuntimeLimitFault,
  toRuntimeErrorInfo,
  type RuntimeErrorInfo,
  type RuntimeResource,
} from './errors.js';
import { InputTape, type InputSource } from './input.js';
import {
  evaluateBinaryOperation,
  evaluateUnaryOperation,
  enforceValueLimits,
  expectBoolean,
  integerPart,
  DEFAULT_VALUE_LIMITS,
  type ValueLimits,
} from './operations.js';
import {
  booleanValue,
  formatRuntimeValue,
  integerValue,
  isNumericValue,
  realValue,
  runtimeValuesIdentical,
  stringValue,
  type NumericValue,
  type RuntimeValue,
} from './value.js';

type SourceSpan = Program['span'];

export type MachineStatus = 'ready' | 'running' | 'waiting-input' | 'completed' | 'error' | 'limit';

export type TracePhase = 'assignment' | 'read' | 'write' | 'condition';

export interface VariableChange {
  readonly name: string;
  readonly before?: RuntimeValue;
  readonly after: RuntimeValue;
  readonly changed: boolean;
}

export interface TraceRecord {
  readonly index: number;
  readonly nodeId: string;
  readonly statementId: string;
  readonly span: SourceSpan;
  readonly phase: TracePhase;
  readonly variableChanges: readonly VariableChange[];
  readonly conditionResult?: boolean;
  readonly inputConsumed?: readonly RuntimeValue[];
  readonly outputAppended?: string;
}

export interface WaitingForInput {
  readonly nodeId: string;
  readonly span: SourceSpan;
  readonly targets: readonly string[];
  readonly required: number;
  readonly available: number;
}

export type ExecutionLimit =
  | {
      readonly kind: 'execution' | 'run';
      readonly maximum: number;
      readonly message: string;
    }
  | {
      readonly kind: 'resource';
      readonly resource: RuntimeResource;
      readonly maximum: number;
      readonly observed?: number;
      readonly message: string;
      readonly nodeId: string;
      readonly span: SourceSpan;
    };

export interface InputState {
  readonly position: number;
  readonly length: number;
  readonly remaining: number;
}

export interface MachineState {
  readonly status: MachineStatus;
  readonly variables: Readonly<Record<string, RuntimeValue>>;
  readonly output: readonly string[];
  readonly renderedOutput: string;
  readonly input: InputState;
  readonly trace: readonly TraceRecord[];
  readonly stepsExecuted: number;
  readonly outputCharacters: number;
  readonly canStepBack: boolean;
  readonly waitingForInput?: WaitingForInput;
  readonly error?: RuntimeErrorInfo;
  readonly limit?: ExecutionLimit;
}

export interface InterpreterOptions {
  readonly input?: InputSource;
  /** Hard cumulative ceiling. It protects both Step and Run. */
  readonly executionLimit?: number;
  /** Maximum binary width of any integer value. Default: 65,536 bits. */
  readonly maxIntegerBits?: number;
  /** Maximum length of any string value in UTF-16 code units. Default: 1,000,000. */
  readonly maxStringLength?: number;
  /** Maximum rendered output length in UTF-16 code units. Default: 1,000,000. */
  readonly maxOutputCharacters?: number;
  /** Separator placed between values emitted by the same `scrie` statement. Default: one space. */
  readonly writeValueSeparator?: string;
  /** Separator placed between distinct `scrie` statements in renderedOutput. Default: empty. */
  readonly outputSeparator?: string;
}

export interface RunOptions {
  /** Maximum number of additional pedagogical steps performed by this call. */
  readonly maxSteps?: number;
}

interface SourceReference {
  readonly nodeId: string;
  readonly statementId: string;
  readonly span: SourceSpan;
}

interface AssignmentInstruction extends SourceReference {
  readonly kind: 'assignment';
  readonly target: string;
  readonly expression: Expression;
}

interface ReadInstruction extends SourceReference {
  readonly kind: 'read';
  readonly targets: readonly string[];
}

interface WriteInstruction extends SourceReference {
  readonly kind: 'write';
  readonly expressions: readonly Expression[];
}

interface ConditionInstruction extends SourceReference {
  readonly kind: 'condition';
  readonly condition: Expression;
  trueTarget: number;
  falseTarget: number;
}

interface ForConditionInstruction extends SourceReference {
  readonly kind: 'for-condition';
  readonly stage: 'initial' | 'next';
  readonly loopId: string;
  readonly variable: string;
  readonly start?: Expression;
  readonly end?: Expression;
  readonly step?: Expression;
  trueTarget: number;
  falseTarget: number;
}

interface JumpInstruction {
  readonly kind: 'jump';
  target: number;
}

type Instruction =
  | AssignmentInstruction
  | ReadInstruction
  | WriteInstruction
  | ConditionInstruction
  | ForConditionInstruction
  | JumpInstruction;

interface ForLoopContext {
  readonly current: NumericValue;
  readonly end: NumericValue;
  readonly step: NumericValue;
}

interface VariableBefore {
  readonly present: boolean;
  readonly value?: RuntimeValue;
}

interface Checkpoint {
  readonly pc: number;
  readonly variables: ReadonlyMap<string, VariableBefore>;
  readonly loopContexts: ReadonlyMap<string, ForLoopContext>;
  readonly inputPosition: number;
  readonly outputLength: number;
  readonly traceLength: number;
  readonly stepsExecuted: number;
  readonly outputCharacters: number;
}

const assertPositiveSafeInteger = (value: number, name: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} trebuie sa fie un intreg strict pozitiv.`);
  }
  return value;
};

const literalValue = (
  expression: Extract<Expression, { readonly kind: 'Literal' }>,
  limits: ValueLimits,
): RuntimeValue => {
  let value: RuntimeValue;
  switch (expression.valueType) {
    case 'integer': {
      if (typeof expression.value !== 'string') {
        throw new RuntimeFault('internal-error', 'Literalul intreg nu are o reprezentare valida.');
      }
      value = integerValue(expression.value);
      break;
    }
    case 'real': {
      if (typeof expression.value !== 'string') {
        throw new RuntimeFault('internal-error', 'Literalul real nu are o reprezentare valida.');
      }
      const value = Number(expression.value);
      if (!Number.isFinite(value)) {
        throw new RuntimeFault(
          'numeric-overflow',
          'Literalul real depaseste domeniul numeric acceptat.',
        );
      }
      return realValue(value);
    }
    case 'boolean': {
      if (typeof expression.value !== 'boolean') {
        throw new RuntimeFault('internal-error', 'Literalul logic nu are o reprezentare valida.');
      }
      value = booleanValue(expression.value);
      break;
    }
    case 'string': {
      if (typeof expression.value !== 'string') {
        throw new RuntimeFault('internal-error', 'Literalul sir nu are o reprezentare valida.');
      }
      value = stringValue(expression.value);
      break;
    }
  }
  return enforceValueLimits(value, limits);
};

const attachLocation = (error: unknown, expression: Expression): never => {
  if (error instanceof RuntimeFault || error instanceof RuntimeLimitFault) {
    throw error.at({ nodeId: expression.id, span: expression.span });
  }
  throw error;
};

/**
 * Parser-produced expressions already respect this bound, but callers may
 * construct an AST directly. Walk it iteratively so an adversarially deep AST
 * is rejected before the recursive evaluator can exhaust the JavaScript stack.
 */
const assertExpressionComplexity = (expression: Expression): void => {
  const pending: Expression[] = [expression];
  let observed = 0;

  while (pending.length > 0) {
    const current = pending.pop() as Expression;
    observed += 1;
    if (observed > MAX_EXPRESSION_NODES) {
      throw new RuntimeLimitFault(
        'expression-nodes',
        MAX_EXPRESSION_NODES,
        `Expresia depaseste limita de complexitate de ${MAX_EXPRESSION_NODES} noduri sintactice.`,
        observed,
        { nodeId: current.id, span: current.span },
      );
    }

    switch (current.kind) {
      case 'UnaryExpression':
        pending.push(current.operand);
        break;
      case 'BinaryExpression':
        pending.push(current.right, current.left);
        break;
      case 'GroupingExpression':
      case 'IntegerPartExpression':
        pending.push(current.expression);
        break;
      case 'Literal':
      case 'Identifier':
        break;
    }
  }
};

const evaluateExpressionNode = (
  expression: Expression,
  variables: ReadonlyMap<string, RuntimeValue>,
  limits: ValueLimits,
): RuntimeValue => {
  try {
    switch (expression.kind) {
      case 'Literal':
        return literalValue(expression, limits);
      case 'Identifier': {
        const value = variables.get(expression.name);
        if (value === undefined) {
          throw new RuntimeFault(
            'uninitialized-variable',
            `Variabila „${expression.name}” este folosita inainte de initializare.`,
          );
        }
        return value;
      }
      case 'UnaryExpression':
        return evaluateUnaryOperation(
          expression.operator,
          evaluateExpressionNode(expression.operand, variables, limits),
          limits,
        );
      case 'BinaryExpression': {
        const left = evaluateExpressionNode(expression.left, variables, limits);
        if (expression.operator === 'si') {
          if (!expectBoolean(left)) {
            return booleanValue(false);
          }
          return booleanValue(
            expectBoolean(evaluateExpressionNode(expression.right, variables, limits)),
          );
        }
        if (expression.operator === 'sau') {
          if (expectBoolean(left)) {
            return booleanValue(true);
          }
          return booleanValue(
            expectBoolean(evaluateExpressionNode(expression.right, variables, limits)),
          );
        }
        return evaluateBinaryOperation(
          expression.operator,
          left,
          evaluateExpressionNode(expression.right, variables, limits),
          limits,
        );
      }
      case 'GroupingExpression':
        return evaluateExpressionNode(expression.expression, variables, limits);
      case 'IntegerPartExpression':
        return integerPart(
          evaluateExpressionNode(expression.expression, variables, limits),
          limits,
        );
    }
  } catch (error) {
    return attachLocation(error, expression);
  }
};

const evaluateExpression = (
  expression: Expression,
  variables: ReadonlyMap<string, RuntimeValue>,
  limits: ValueLimits,
): RuntimeValue => {
  assertExpressionComplexity(expression);
  return evaluateExpressionNode(expression, variables, limits);
};

class Compiler {
  readonly #instructions: Instruction[] = [];

  public compile(program: Program): readonly Instruction[] {
    this.#compileStatements(program.body);
    return this.#instructions;
  }

  #emit(instruction: Instruction): number {
    this.#instructions.push(instruction);
    return this.#instructions.length - 1;
  }

  #reference(statement: Statement, span: SourceSpan = statement.span): SourceReference {
    return { nodeId: statement.id, statementId: statement.id, span };
  }

  #compileStatements(statements: readonly Statement[]): void {
    for (const statement of statements) {
      this.#compileStatement(statement);
    }
  }

  #compileStatement(statement: Statement): void {
    switch (statement.kind) {
      case 'AssignmentStatement':
        this.#emit({
          kind: 'assignment',
          ...this.#reference(statement),
          target: statement.target.name,
          expression: statement.value,
        });
        return;
      case 'ReadStatement':
        this.#emit({
          kind: 'read',
          ...this.#reference(statement),
          targets: statement.targets.map((target) => target.name),
        });
        return;
      case 'WriteStatement':
        this.#emit({
          kind: 'write',
          ...this.#reference(statement),
          expressions: statement.values,
        });
        return;
      case 'IfStatement': {
        const conditionIndex = this.#emit({
          kind: 'condition',
          ...this.#reference(statement, statement.condition.span),
          nodeId: statement.condition.id,
          condition: statement.condition,
          trueTarget: -1,
          falseTarget: -1,
        });
        const condition = this.#instructions[conditionIndex] as ConditionInstruction;
        condition.trueTarget = this.#instructions.length;
        this.#compileStatements(statement.thenBranch);
        if (statement.elseBranch.length === 0) {
          condition.falseTarget = this.#instructions.length;
        } else {
          const skipElseIndex = this.#emit({ kind: 'jump', target: -1 });
          condition.falseTarget = this.#instructions.length;
          this.#compileStatements(statement.elseBranch);
          (this.#instructions[skipElseIndex] as JumpInstruction).target = this.#instructions.length;
        }
        return;
      }
      case 'WhileStatement': {
        const conditionIndex = this.#emit({
          kind: 'condition',
          ...this.#reference(statement, statement.condition.span),
          nodeId: statement.condition.id,
          condition: statement.condition,
          trueTarget: -1,
          falseTarget: -1,
        });
        const condition = this.#instructions[conditionIndex] as ConditionInstruction;
        condition.trueTarget = this.#instructions.length;
        this.#compileStatements(statement.body);
        this.#emit({ kind: 'jump', target: conditionIndex });
        condition.falseTarget = this.#instructions.length;
        return;
      }
      case 'RepeatUntilStatement': {
        const bodyStart = this.#instructions.length;
        this.#compileStatements(statement.body);
        const conditionIndex = this.#emit({
          kind: 'condition',
          ...this.#reference(statement, statement.condition.span),
          nodeId: statement.condition.id,
          condition: statement.condition,
          trueTarget: -1,
          falseTarget: bodyStart,
        });
        (this.#instructions[conditionIndex] as ConditionInstruction).trueTarget =
          this.#instructions.length;
        return;
      }
      case 'ForStatement': {
        const loopId = statement.id;
        const headerSpan: SourceSpan = {
          start: statement.span.start,
          end: (statement.step ?? statement.end).span.end,
        };
        const initialIndex = this.#emit({
          kind: 'for-condition',
          ...this.#reference(statement, headerSpan),
          stage: 'initial',
          loopId,
          variable: statement.variable.name,
          start: statement.start,
          end: statement.end,
          ...(statement.step === undefined ? {} : { step: statement.step }),
          trueTarget: -1,
          falseTarget: -1,
        });
        const initial = this.#instructions[initialIndex] as ForConditionInstruction;
        initial.trueTarget = this.#instructions.length;
        this.#compileStatements(statement.body);
        const nextIndex = this.#emit({
          kind: 'for-condition',
          ...this.#reference(statement, headerSpan),
          stage: 'next',
          loopId,
          variable: statement.variable.name,
          trueTarget: initial.trueTarget,
          falseTarget: -1,
        });
        const afterLoop = this.#instructions.length;
        initial.falseTarget = afterLoop;
        (this.#instructions[nextIndex] as ForConditionInstruction).falseTarget = afterLoop;
        return;
      }
      case 'CommentStatement':
        return;
      case 'ErrorStatement':
        throw new RuntimeFault(
          'internal-error',
          'Programul contine o instructiune invalida si nu poate fi executat.',
          { nodeId: statement.id, span: statement.span },
        );
    }
  }
}

const cloneVariables = (
  variables: ReadonlyMap<string, RuntimeValue>,
): Readonly<Record<string, RuntimeValue>> => {
  const result: Record<string, RuntimeValue> = Object.create(null) as Record<string, RuntimeValue>;
  for (const [name, value] of variables) {
    result[name] = value;
  }
  return Object.freeze(result);
};

const snapshotSpan = (span: SourceSpan): SourceSpan =>
  Object.freeze({
    start: Object.freeze({ ...span.start }),
    end: Object.freeze({ ...span.end }),
  });

const snapshotWaiting = (waiting: WaitingForInput): WaitingForInput =>
  Object.freeze({
    ...waiting,
    span: snapshotSpan(waiting.span),
    targets: Object.freeze([...waiting.targets]),
  });

const snapshotError = (error: RuntimeErrorInfo): RuntimeErrorInfo =>
  Object.freeze({
    ...error,
    ...(error.span === undefined ? {} : { span: snapshotSpan(error.span) }),
  });

const snapshotLimit = (limit: ExecutionLimit): ExecutionLimit => {
  if (limit.kind !== 'resource') return Object.freeze({ ...limit });
  return Object.freeze({ ...limit, span: snapshotSpan(limit.span) });
};

const cloneLoopContexts = (
  contexts: ReadonlyMap<string, ForLoopContext>,
): ReadonlyMap<string, ForLoopContext> => new Map(contexts);

const normalizeForNumbers = (
  start: NumericValue,
  end: NumericValue,
  step: NumericValue,
): readonly [NumericValue, NumericValue, NumericValue] => {
  if (start.type === 'integer' && end.type === 'integer' && step.type === 'integer') {
    return [start, end, step];
  }
  const normalized = [start, end, step].map((value) => {
    const number = Number(value.value);
    if (!Number.isFinite(number)) {
      throw new RuntimeFault(
        'numeric-overflow',
        'Limitele instructiunii „pentru” depasesc domeniul numerelor reale.',
      );
    }
    return realValue(number);
  });
  return [
    normalized[0] as NumericValue,
    normalized[1] as NumericValue,
    normalized[2] as NumericValue,
  ];
};

const numericSign = (value: NumericValue): -1 | 0 | 1 =>
  value.value < 0 ? -1 : value.value > 0 ? 1 : 0;

const addNumeric = (left: NumericValue, right: NumericValue, limits: ValueLimits): NumericValue => {
  if (left.type === 'integer' && right.type === 'integer') {
    return enforceValueLimits(integerValue(left.value + right.value), limits) as NumericValue;
  }
  const result = Number(left.value) + Number(right.value);
  if (!Number.isFinite(result)) {
    throw new RuntimeFault(
      'numeric-overflow',
      'Contorul instructiunii „pentru” depaseste domeniul numeric acceptat.',
    );
  }
  return realValue(result);
};

const forCondition = (context: ForLoopContext, limits: ValueLimits): boolean => {
  const relation = evaluateBinaryOperation(
    numericSign(context.step) > 0 ? '<=' : '>=',
    context.current,
    context.end,
    limits,
  );
  return expectBoolean(relation);
};

/**
 * Deterministic, synchronous interpreter. Every public Step is one event visible
 * to a student; internal jumps never leak into the debugger trace.
 */
export class Interpreter {
  readonly #instructions: readonly Instruction[];
  readonly #input: InputTape;
  readonly #executionLimit: number;
  readonly #valueLimits: ValueLimits;
  readonly #maxOutputCharacters: number;
  readonly #writeValueSeparator: string;
  readonly #outputSeparator: string;
  readonly #variables = new Map<string, RuntimeValue>();
  readonly #output: string[] = [];
  readonly #trace: TraceRecord[] = [];
  readonly #history: Checkpoint[] = [];
  readonly #loopContexts = new Map<string, ForLoopContext>();
  #pc = 0;
  #status: MachineStatus = 'ready';
  #stepsExecuted = 0;
  #outputCharacters = 0;
  #waitingForInput: WaitingForInput | undefined;
  #error: RuntimeErrorInfo | undefined;
  #limit: ExecutionLimit | undefined;

  public constructor(program: Program, options: InterpreterOptions = {}) {
    this.#instructions = new Compiler().compile(program);
    this.#input = new InputTape(options.input);
    this.#executionLimit = assertPositiveSafeInteger(
      options.executionLimit ?? 100_000,
      'executionLimit',
    );
    this.#valueLimits = Object.freeze({
      maxIntegerBits: assertPositiveSafeInteger(
        options.maxIntegerBits ?? DEFAULT_VALUE_LIMITS.maxIntegerBits,
        'maxIntegerBits',
      ),
      maxStringLength: assertPositiveSafeInteger(
        options.maxStringLength ?? DEFAULT_VALUE_LIMITS.maxStringLength,
        'maxStringLength',
      ),
    });
    this.#maxOutputCharacters = assertPositiveSafeInteger(
      options.maxOutputCharacters ?? 1_000_000,
      'maxOutputCharacters',
    );
    this.#writeValueSeparator = options.writeValueSeparator ?? ' ';
    this.#outputSeparator = options.outputSeparator ?? '';
    this.#settleAfterStep(false);
  }

  public get state(): MachineState {
    const state: MachineState = {
      status: this.#status,
      variables: cloneVariables(this.#variables),
      output: Object.freeze([...this.#output]),
      renderedOutput: this.#output.join(this.#outputSeparator),
      input: Object.freeze({
        position: this.#input.position,
        length: this.#input.length,
        remaining: this.#input.remaining,
      }),
      trace: Object.freeze([...this.#trace]),
      stepsExecuted: this.#stepsExecuted,
      outputCharacters: this.#outputCharacters,
      canStepBack: this.#history.length > 0,
      ...(this.#waitingForInput === undefined
        ? {}
        : { waitingForInput: snapshotWaiting(this.#waitingForInput) }),
      ...(this.#error === undefined ? {} : { error: snapshotError(this.#error) }),
      ...(this.#limit === undefined ? {} : { limit: snapshotLimit(this.#limit) }),
    };
    return Object.freeze(state);
  }

  public step(): MachineState {
    if (this.#status === 'completed' || this.#status === 'error') {
      return this.state;
    }
    if (this.#status === 'limit' && this.#limit?.kind !== 'run') {
      return this.state;
    }
    if (this.#status === 'limit') {
      this.#clearTransientState();
      this.#status = 'ready';
    }
    if (this.#status === 'waiting-input') {
      const instruction = this.#instructions[this.#pc];
      if (instruction?.kind === 'read' && this.#input.remaining < instruction.targets.length) {
        this.#setWaiting(instruction);
        return this.state;
      }
      this.#waitingForInput = undefined;
      this.#status = 'ready';
    }
    if (this.#stepsExecuted >= this.#executionLimit) {
      this.#setExecutionLimit();
      return this.state;
    }

    this.#advanceOne(false);
    return this.state;
  }

  public run(options: RunOptions | number = {}): MachineState {
    if (this.#status === 'completed' || this.#status === 'error') {
      return this.state;
    }
    const requested =
      typeof options === 'number' ? options : (options.maxSteps ?? this.#executionLimit);
    const maximum = assertPositiveSafeInteger(requested, 'maxSteps');
    if (this.#status === 'limit' && this.#limit?.kind !== 'run') {
      return this.state;
    }
    if (this.#status === 'limit') {
      this.#clearTransientState();
    }
    this.#advanceMany(maximum);

    if (this.#status === 'running') {
      if (this.#stepsExecuted >= this.#executionLimit) {
        this.#setExecutionLimit();
      } else {
        this.#status = 'limit';
        this.#limit = {
          kind: 'run',
          maximum,
          message: `Executia a fost oprita dupa ${maximum} pasi in aceasta rulare.`,
        };
      }
    }
    return this.state;
  }

  /**
   * Advances a bounded batch without treating normal batch exhaustion as a
   * program limit. Browser schedulers use this to yield between animation
   * frames while preserving the exact semantics of `run()`.
   */
  public runSlice(maxSteps: number): MachineState {
    const maximum = assertPositiveSafeInteger(maxSteps, 'maxSteps');
    if (this.#status === 'completed' || this.#status === 'error') {
      return this.state;
    }
    if (this.#status === 'limit' && this.#limit?.kind !== 'run') {
      return this.state;
    }
    if (this.#status === 'limit') {
      this.#clearTransientState();
    }

    this.#advanceMany(maximum);
    if (this.#status === 'running') {
      if (this.#stepsExecuted >= this.#executionLimit) {
        this.#setExecutionLimit();
      } else {
        this.#status = 'ready';
      }
    }
    return this.state;
  }

  public appendInput(source: InputSource): MachineState {
    this.#input.append(source);
    if (this.#status === 'waiting-input') {
      const instruction = this.#instructions[this.#pc];
      if (instruction?.kind === 'read' && this.#input.remaining >= instruction.targets.length) {
        this.#waitingForInput = undefined;
        this.#status = 'ready';
      } else if (instruction?.kind === 'read') {
        this.#setWaiting(instruction);
      }
    }
    return this.state;
  }

  public stepBack(): MachineState {
    const checkpoint = this.#history.pop();
    if (checkpoint === undefined) {
      return this.state;
    }
    this.#pc = checkpoint.pc;
    for (const [name, before] of checkpoint.variables) {
      if (before.present) {
        this.#variables.set(name, before.value as RuntimeValue);
      } else {
        this.#variables.delete(name);
      }
    }
    this.#loopContexts.clear();
    for (const [loopId, context] of checkpoint.loopContexts) {
      this.#loopContexts.set(loopId, context);
    }
    this.#input.restore(checkpoint.inputPosition);
    this.#output.length = checkpoint.outputLength;
    this.#trace.length = checkpoint.traceLength;
    this.#stepsExecuted = checkpoint.stepsExecuted;
    this.#outputCharacters = checkpoint.outputCharacters;
    this.#clearTransientState();
    this.#status = 'ready';
    return this.state;
  }

  /** Resets execution. Existing tape values are retained unless a replacement is supplied. */
  public reset(input?: InputSource): MachineState {
    if (input !== undefined) {
      this.#input.replace(input);
    } else {
      this.#input.restore(0);
    }
    this.#variables.clear();
    this.#output.length = 0;
    this.#trace.length = 0;
    this.#history.length = 0;
    this.#loopContexts.clear();
    this.#pc = 0;
    this.#stepsExecuted = 0;
    this.#outputCharacters = 0;
    this.#clearTransientState();
    this.#status = 'ready';
    this.#settleAfterStep(false);
    return this.state;
  }

  #clearTransientState(): void {
    this.#waitingForInput = undefined;
    this.#error = undefined;
    this.#limit = undefined;
  }

  #advanceMany(maximum: number): void {
    this.#status = 'running';
    let performed = 0;
    while (this.#status === 'running' && performed < maximum) {
      if (this.#stepsExecuted >= this.#executionLimit) {
        this.#setExecutionLimit();
        break;
      }
      const before = this.#stepsExecuted;
      this.#advanceOne(true);
      performed += this.#stepsExecuted - before;
    }
  }

  #setExecutionLimit(): void {
    this.#status = 'limit';
    this.#limit = {
      kind: 'execution',
      maximum: this.#executionLimit,
      message: `Executia a atins limita cumulativa de ${this.#executionLimit} pasi.`,
    };
  }

  #normalizeProgramCounter(): void {
    while (this.#pc < this.#instructions.length) {
      const instruction = this.#instructions[this.#pc];
      if (instruction?.kind !== 'jump') {
        break;
      }
      this.#pc = instruction.target;
    }
  }

  #settleAfterStep(running: boolean): void {
    this.#normalizeProgramCounter();
    if (this.#pc >= this.#instructions.length) {
      this.#status = 'completed';
    } else {
      this.#status = running ? 'running' : 'ready';
    }
  }

  #setWaiting(instruction: ReadInstruction): void {
    this.#status = 'waiting-input';
    this.#waitingForInput = {
      nodeId: instruction.nodeId,
      span: instruction.span,
      targets: [...instruction.targets],
      required: instruction.targets.length,
      available: this.#input.remaining,
    };
  }

  #checkpoint(variableNames: readonly string[]): Checkpoint {
    const variables = new Map<string, VariableBefore>();
    for (const name of new Set(variableNames)) {
      const value = this.#variables.get(name);
      variables.set(name, value === undefined ? { present: false } : { present: true, value });
    }
    return {
      pc: this.#pc,
      variables,
      loopContexts: cloneLoopContexts(this.#loopContexts),
      inputPosition: this.#input.position,
      outputLength: this.#output.length,
      traceLength: this.#trace.length,
      stepsExecuted: this.#stepsExecuted,
      outputCharacters: this.#outputCharacters,
    };
  }

  #record(
    instruction: SourceReference,
    phase: TracePhase,
    details: {
      readonly variableChanges?: readonly VariableChange[];
      readonly conditionResult?: boolean;
      readonly inputConsumed?: readonly RuntimeValue[];
      readonly outputAppended?: string;
    } = {},
  ): void {
    const variableChanges = Object.freeze(
      (details.variableChanges ?? []).map((change) => Object.freeze({ ...change })),
    );
    const inputConsumed =
      details.inputConsumed === undefined ? undefined : Object.freeze([...details.inputConsumed]);
    const record: TraceRecord = {
      index: this.#trace.length + 1,
      nodeId: instruction.nodeId,
      statementId: instruction.statementId,
      span: snapshotSpan(instruction.span),
      phase,
      variableChanges,
      ...(details.conditionResult === undefined
        ? {}
        : { conditionResult: details.conditionResult }),
      ...(inputConsumed === undefined ? {} : { inputConsumed }),
      ...(details.outputAppended === undefined ? {} : { outputAppended: details.outputAppended }),
    };
    this.#trace.push(Object.freeze(record));
    this.#stepsExecuted += 1;
  }

  #assign(name: string, value: RuntimeValue): VariableChange {
    const checkedValue = enforceValueLimits(value, this.#valueLimits);
    const before = this.#variables.get(name);
    this.#variables.set(name, checkedValue);
    return {
      name,
      ...(before === undefined ? {} : { before }),
      after: checkedValue,
      changed: before === undefined || !runtimeValuesIdentical(before, checkedValue),
    };
  }

  #advanceOne(running: boolean): void {
    this.#normalizeProgramCounter();
    const instruction = this.#instructions[this.#pc];
    if (instruction === undefined) {
      this.#status = 'completed';
      return;
    }
    if (instruction.kind === 'jump') {
      throw new Error('Invariant violation: jump-ul intern nu a fost normalizat.');
    }
    if (instruction.kind === 'read' && this.#input.remaining < instruction.targets.length) {
      this.#setWaiting(instruction);
      return;
    }

    const changedNames =
      instruction.kind === 'assignment'
        ? [instruction.target]
        : instruction.kind === 'read'
          ? instruction.targets
          : instruction.kind === 'for-condition'
            ? [instruction.variable]
            : [];
    const checkpoint = this.#checkpoint(changedNames);

    try {
      switch (instruction.kind) {
        case 'assignment': {
          const value = evaluateExpression(
            instruction.expression,
            this.#variables,
            this.#valueLimits,
          );
          const change = this.#assign(instruction.target, value);
          this.#pc += 1;
          this.#record(instruction, 'assignment', { variableChanges: [change] });
          break;
        }
        case 'read': {
          const values = this.#input.consume(instruction.targets.length);
          if (values === undefined) {
            throw new Error('Invariant violation: input tape-ul a fost consumat neatomic.');
          }
          const changes = instruction.targets.map((target, index) =>
            this.#assign(target, values[index] as RuntimeValue),
          );
          this.#pc += 1;
          this.#record(instruction, 'read', {
            variableChanges: changes,
            inputConsumed: values,
          });
          break;
        }
        case 'write': {
          const rendered = instruction.expressions
            .map((expression) =>
              formatRuntimeValue(
                evaluateExpression(expression, this.#variables, this.#valueLimits),
              ),
            )
            .join(this.#writeValueSeparator);
          const outputCharacters =
            this.#outputCharacters +
            (this.#output.length === 0 ? 0 : this.#outputSeparator.length) +
            rendered.length;
          if (outputCharacters > this.#maxOutputCharacters) {
            throw new RuntimeLimitFault(
              'output-characters',
              this.#maxOutputCharacters,
              `Iesirea programului depaseste limita de ${this.#maxOutputCharacters} caractere UTF-16.`,
              outputCharacters,
            );
          }
          this.#output.push(rendered);
          this.#outputCharacters = outputCharacters;
          this.#pc += 1;
          this.#record(instruction, 'write', { outputAppended: rendered });
          break;
        }
        case 'condition': {
          const result = expectBoolean(
            evaluateExpression(instruction.condition, this.#variables, this.#valueLimits),
          );
          this.#pc = result ? instruction.trueTarget : instruction.falseTarget;
          this.#record(instruction, 'condition', { conditionResult: result });
          break;
        }
        case 'for-condition':
          this.#executeForCondition(instruction);
          break;
      }
      this.#history.push(checkpoint);
      this.#clearTransientState();
      this.#settleAfterStep(running);
    } catch (error) {
      this.#history.push(checkpoint);
      this.#restoreCheckpoint(checkpoint);
      if (error instanceof RuntimeLimitFault) {
        const location = error.location ?? {
          nodeId: instruction.nodeId,
          span: instruction.span,
        };
        this.#status = 'limit';
        this.#limit = {
          kind: 'resource',
          resource: error.resource,
          maximum: error.maximum,
          ...(error.observed === undefined ? {} : { observed: error.observed }),
          message: error.message,
          nodeId: location.nodeId,
          span: snapshotSpan(location.span),
        };
      } else {
        this.#status = 'error';
        this.#error = toRuntimeErrorInfo(
          error instanceof RuntimeFault
            ? error.at({ nodeId: instruction.nodeId, span: instruction.span })
            : error,
        );
      }
    }
  }

  #restoreCheckpoint(checkpoint: Checkpoint): void {
    this.#pc = checkpoint.pc;
    for (const [name, before] of checkpoint.variables) {
      if (before.present) {
        this.#variables.set(name, before.value as RuntimeValue);
      } else {
        this.#variables.delete(name);
      }
    }
    this.#loopContexts.clear();
    for (const [loopId, context] of checkpoint.loopContexts) {
      this.#loopContexts.set(loopId, context);
    }
    this.#input.restore(checkpoint.inputPosition);
    this.#output.length = checkpoint.outputLength;
    this.#trace.length = checkpoint.traceLength;
    this.#stepsExecuted = checkpoint.stepsExecuted;
    this.#outputCharacters = checkpoint.outputCharacters;
  }

  #executeForCondition(instruction: ForConditionInstruction): void {
    let context: ForLoopContext;
    if (instruction.stage === 'initial') {
      const start = evaluateExpression(
        instruction.start as Expression,
        this.#variables,
        this.#valueLimits,
      );
      const end = evaluateExpression(
        instruction.end as Expression,
        this.#variables,
        this.#valueLimits,
      );
      const step =
        instruction.step === undefined
          ? integerValue(1n)
          : evaluateExpression(instruction.step, this.#variables, this.#valueLimits);
      if (!isNumericValue(start) || !isNumericValue(end) || !isNumericValue(step)) {
        throw new RuntimeFault(
          'invalid-for-counter',
          'Contorul, limitele si pasul instructiunii „pentru” trebuie sa fie numerice.',
        );
      }
      const [normalizedStart, normalizedEnd, normalizedStep] = normalizeForNumbers(
        start,
        end,
        step,
      );
      if (numericSign(normalizedStep) === 0) {
        throw new RuntimeFault('for-step-zero', 'Pasul instructiunii „pentru” nu poate fi zero.');
      }
      context = {
        current: normalizedStart,
        end: normalizedEnd,
        step: normalizedStep,
      };
    } else {
      const previous = this.#loopContexts.get(instruction.loopId);
      if (previous === undefined) {
        throw new RuntimeFault('internal-error', 'Contextul instructiunii „pentru” lipseste.');
      }
      context = {
        ...previous,
        current: addNumeric(previous.current, previous.step, this.#valueLimits),
      };
    }

    const result = forCondition(context, this.#valueLimits);
    const change = this.#assign(instruction.variable, context.current);
    if (result) {
      this.#loopContexts.set(instruction.loopId, context);
      this.#pc = instruction.trueTarget;
    } else {
      this.#loopContexts.delete(instruction.loopId);
      this.#pc = instruction.falseTarget;
    }
    this.#record(instruction, 'condition', {
      variableChanges: [change],
      conditionResult: result,
    });
  }
}

export const createInterpreter = (program: Program, options?: InterpreterOptions): Interpreter =>
  new Interpreter(program, options);
