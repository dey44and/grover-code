import type { BinaryOperator, Expression, Program, Statement } from './ast.js';

export interface FormatOptions {
  /** Indentation unit. Defaults to two spaces. */
  readonly indent?: string;
  readonly lineEnding?: '\n' | '\r\n';
  readonly assignmentOperator?: '<-' | '←';
  /** Defaults to true. */
  readonly finalNewline?: boolean;
}

interface ResolvedFormatOptions {
  readonly indent: string;
  readonly lineEnding: '\n' | '\r\n';
  readonly assignmentOperator: '<-' | '←';
  readonly finalNewline: boolean;
}

const precedence = (expression: Expression): number => {
  if (expression.kind === 'BinaryExpression') {
    const levels: Readonly<Record<BinaryOperator, number>> = {
      sau: 1,
      si: 2,
      '=': 4,
      '!=': 4,
      '<': 4,
      '<=': 4,
      '>': 4,
      '>=': 4,
      '+': 5,
      '-': 5,
      '*': 6,
      '/': 6,
      '%': 6,
      '^': 8,
    };
    return levels[expression.operator];
  }
  if (expression.kind === 'UnaryExpression') {
    return expression.operator === 'nu' ? 3 : 7;
  }
  return 9;
};

const isComparison = (operator: BinaryOperator): boolean =>
  operator === '=' ||
  operator === '!=' ||
  operator === '<' ||
  operator === '<=' ||
  operator === '>' ||
  operator === '>=';

class Formatter {
  readonly #options: ResolvedFormatOptions;
  readonly #lines: string[] = [];

  public constructor(options: FormatOptions) {
    const indent = options.indent ?? '  ';
    if (indent.includes('\n') || indent.includes('\r')) {
      throw new TypeError('Indentarea nu poate contine caractere newline.');
    }
    this.#options = {
      indent,
      lineEnding: options.lineEnding ?? '\n',
      assignmentOperator: options.assignmentOperator ?? '<-',
      finalNewline: options.finalNewline ?? true,
    };
  }

  public format(program: Program): string {
    this.#emitStatements(program.body, 0);
    const content = this.#lines.join(this.#options.lineEnding);
    if (!this.#options.finalNewline || content.length === 0) {
      return content;
    }
    return `${content}${this.#options.lineEnding}`;
  }

  #emitStatements(statements: readonly Statement[], depth: number): void {
    for (const statement of statements) {
      if (statement.kind === 'CommentStatement' && statement.inline && this.#lines.length > 0) {
        const lastIndex = this.#lines.length - 1;
        const suffix = statement.text.length === 0 ? ' //' : ` // ${statement.text}`;
        this.#lines[lastIndex] = `${this.#lines[lastIndex] ?? ''}${suffix}`;
        continue;
      }
      this.#emitStatement(statement, depth);
    }
  }

  #emitStatement(statement: Statement, depth: number): void {
    const indentation = this.#options.indent.repeat(depth);
    switch (statement.kind) {
      case 'ReadStatement': {
        const targets = statement.targets.map((target) => target.name).join(', ');
        const annotation =
          statement.annotation === undefined ? '' : ` (${statement.annotation.text})`;
        this.#lines.push(
          `${indentation}citeste${targets.length === 0 ? '' : ` ${targets}`}${annotation}`,
        );
        return;
      }
      case 'WriteStatement':
        this.#lines.push(
          `${indentation}scrie${
            statement.values.length === 0
              ? ''
              : ` ${statement.values.map((value) => this.#expression(value)).join(', ')}`
          }`,
        );
        return;
      case 'AssignmentStatement':
        this.#lines.push(
          `${indentation}${statement.target.name} ${this.#options.assignmentOperator} ${this.#expression(statement.value)}`,
        );
        return;
      case 'IfStatement':
        this.#lines.push(`${indentation}daca ${this.#expression(statement.condition)} atunci`);
        this.#emitStatements(statement.thenBranch, depth + 1);
        if (statement.elseBranch.length > 0) {
          this.#lines.push(`${indentation}altfel`);
          this.#emitStatements(statement.elseBranch, depth + 1);
        }
        this.#lines.push(`${indentation}sfarsit daca`);
        return;
      case 'WhileStatement':
        this.#lines.push(`${indentation}cat timp ${this.#expression(statement.condition)} executa`);
        this.#emitStatements(statement.body, depth + 1);
        this.#lines.push(`${indentation}sfarsit cat timp`);
        return;
      case 'RepeatUntilStatement':
        this.#lines.push(`${indentation}repeta`);
        this.#emitStatements(statement.body, depth + 1);
        this.#lines.push(`${indentation}pana cand ${this.#expression(statement.condition)}`);
        return;
      case 'ForStatement': {
        const step = statement.step === undefined ? '' : `, ${this.#expression(statement.step)}`;
        this.#lines.push(
          `${indentation}pentru ${statement.variable.name} ${this.#options.assignmentOperator} ${this.#expression(statement.start)}, ${this.#expression(statement.end)}${step} executa`,
        );
        this.#emitStatements(statement.body, depth + 1);
        this.#lines.push(`${indentation}sfarsit pentru`);
        return;
      }
      case 'CommentStatement':
        this.#lines.push(
          `${indentation}//${statement.text.length === 0 ? '' : ` ${statement.text}`}`,
        );
        return;
      case 'ErrorStatement': {
        const text = statement.text.trim();
        this.#lines.push(`${indentation}${text.length === 0 ? '// instructiune invalida' : text}`);
        return;
      }
    }
  }

  #expression(expression: Expression): string {
    return this.#expressionWithContext(expression, 0, 'none', undefined);
  }

  #expressionWithContext(
    expression: Expression,
    parentPrecedence: number,
    side: 'left' | 'right' | 'none',
    parentOperator: BinaryOperator | undefined,
  ): string {
    let text: string;
    switch (expression.kind) {
      case 'Identifier':
        text = expression.name;
        break;
      case 'Literal':
        if (expression.valueType === 'boolean') {
          text = expression.value === true ? 'adevarat' : 'fals';
        } else if (expression.valueType === 'string') {
          text = JSON.stringify(String(expression.value));
        } else {
          text = String(expression.value);
        }
        break;
      case 'GroupingExpression':
        text = `(${this.#expression(expression.expression)})`;
        break;
      case 'IntegerPartExpression':
        text = `[${this.#expression(expression.expression)}]`;
        break;
      case 'UnaryExpression': {
        const operand = this.#expressionWithContext(
          expression.operand,
          precedence(expression),
          'right',
          undefined,
        );
        text = expression.operator === 'nu' ? `nu ${operand}` : `${expression.operator}${operand}`;
        break;
      }
      case 'BinaryExpression': {
        const ownPrecedence = precedence(expression);
        const left = this.#expressionWithContext(
          expression.left,
          ownPrecedence,
          'left',
          expression.operator,
        );
        const right = this.#expressionWithContext(
          expression.right,
          ownPrecedence,
          'right',
          expression.operator,
        );
        text = `${left} ${expression.operator} ${right}`;
        break;
      }
    }

    const ownPrecedence = precedence(expression);
    let needsParentheses = ownPrecedence < parentPrecedence;
    if (
      expression.kind === 'BinaryExpression' &&
      ownPrecedence === parentPrecedence &&
      parentOperator !== undefined
    ) {
      if (isComparison(parentOperator) || isComparison(expression.operator)) {
        needsParentheses = true;
      } else if (parentOperator === '^') {
        needsParentheses = side === 'left';
      } else if (side === 'right') {
        needsParentheses = true;
      }
    }

    return needsParentheses ? `(${text})` : text;
  }
}

export const format = (program: Program, options: FormatOptions = {}): string =>
  new Formatter(options).format(program);
