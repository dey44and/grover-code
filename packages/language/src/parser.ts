import type {
  Annotation,
  AssignmentStatement,
  BinaryExpression,
  BinaryOperator,
  CommentStatement,
  ErrorStatement,
  Expression,
  ForStatement,
  GroupingExpression,
  Identifier,
  IfStatement,
  IntegerPartExpression,
  LiteralExpression,
  Program,
  ReadStatement,
  RepeatUntilStatement,
  SourcePosition,
  SourceSpan,
  Statement,
  UnaryExpression,
  UnaryOperator,
  WhileStatement,
  WriteStatement,
} from './ast.js';
import type { Diagnostic } from './diagnostics.js';
import { hasErrors } from './diagnostics.js';
import { lex } from './lexer.js';
import { NodeIdFactory } from './node-id.js';
import { TokenKind, type Token, type TokenKind as TokenKindType } from './token.js';

export interface ParseResult {
  readonly source: string;
  readonly program: Program;
  readonly tokens: readonly Token[];
  readonly diagnostics: readonly Diagnostic[];
  readonly ok: boolean;
}

type StopPredicate = () => boolean;

const MAX_EXPRESSION_DEPTH = 128;
const MAX_CONTROL_DEPTH = 256;
export const MAX_EXPRESSION_NODES = 512;

class ExpressionDepthFault extends Error {}

class ExpressionComplexityFault extends Error {
  public constructor(public readonly span: SourceSpan) {
    super('Expression complexity limit exceeded.');
  }
}

const excessiveControlToken = (tokens: readonly Token[]): Token | undefined => {
  let depth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (token === undefined) continue;

    if (
      (token.kind === TokenKind.Sfarsit &&
        (next?.kind === TokenKind.Daca ||
          next?.kind === TokenKind.Cat ||
          next?.kind === TokenKind.Pentru)) ||
      (token.kind === TokenKind.Pana && next?.kind === TokenKind.Cand)
    ) {
      depth = Math.max(0, depth - 1);
      index += 1;
      continue;
    }

    const opensBlock =
      token.kind === TokenKind.Daca ||
      token.kind === TokenKind.Repeta ||
      token.kind === TokenKind.Pentru ||
      (token.kind === TokenKind.Cat && next?.kind === TokenKind.Timp);
    if (!opensBlock) continue;
    depth += 1;
    if (depth > MAX_CONTROL_DEPTH) return token;
  }
  return undefined;
};

const comparisonOperators: Partial<Record<TokenKindType, BinaryOperator>> = {
  [TokenKind.Equal]: '=',
  [TokenKind.NotEqual]: '!=',
  [TokenKind.Less]: '<',
  [TokenKind.LessEqual]: '<=',
  [TokenKind.Greater]: '>',
  [TokenKind.GreaterEqual]: '>=',
};

const additiveOperators: Partial<Record<TokenKindType, BinaryOperator>> = {
  [TokenKind.Plus]: '+',
  [TokenKind.Minus]: '-',
};

const multiplicativeOperators: Partial<Record<TokenKindType, BinaryOperator>> = {
  [TokenKind.Star]: '*',
  [TokenKind.Slash]: '/',
  [TokenKind.Percent]: '%',
};

class Parser {
  readonly #source: string;
  readonly #tokens: readonly Token[];
  readonly #diagnostics: Diagnostic[];
  readonly #ids: NodeIdFactory;
  #index = 0;
  #expressionDepth = 0;
  #expressionNodeCount = 0;

  public constructor(source: string, tokens: readonly Token[], diagnostics: readonly Diagnostic[]) {
    this.#source = source;
    this.#tokens = tokens;
    this.#diagnostics = [...diagnostics];
    this.#ids = new NodeIdFactory(source);
  }

  public parseProgram(): ParseResult {
    const body = this.#parseStatementList(() => false);
    const start: SourcePosition = { offset: 0, line: 1, column: 1 };
    const end = this.#current().span.end;
    const span = { start, end };
    const program: Program = {
      kind: 'Program',
      id: this.#ids.create('Program', span),
      span,
      body,
    };

    return {
      source: this.#source,
      program,
      tokens: this.#tokens,
      diagnostics: this.#diagnostics,
      ok: !hasErrors(this.#diagnostics),
    };
  }

  #parseStatementList(stop: StopPredicate): Statement[] {
    const statements: Statement[] = [];

    while (true) {
      this.#skipSeparators();
      if (this.#check(TokenKind.EndOfFile) || stop()) {
        break;
      }

      const initialIndex = this.#index;
      const statement = this.#parseStatement();
      statements.push(statement);

      if (this.#check(TokenKind.Comment)) {
        statements.push(this.#parseComment());
      }

      if (this.#index === initialIndex) {
        this.#advance();
      }

      if (
        this.#check(TokenKind.Newline) ||
        this.#check(TokenKind.Semicolon) ||
        this.#check(TokenKind.EndOfFile) ||
        stop()
      ) {
        continue;
      }

      this.#report(
        'PARSE002',
        'Instructiunile de pe aceeasi linie trebuie separate prin punct si virgula.',
        this.#current().span,
        "Adauga ';' inaintea acestui token sau muta instructiunea pe linia urmatoare.",
      );
      this.#recoverToBoundary();
    }

    return statements;
  }

  #parseStatement(): Statement {
    switch (this.#current().kind) {
      case TokenKind.Citeste:
        return this.#parseRead();
      case TokenKind.Scrie:
        return this.#parseWrite();
      case TokenKind.Daca:
        return this.#parseIf();
      case TokenKind.Cat:
        return this.#parseWhile();
      case TokenKind.Repeta:
        return this.#parseRepeatUntil();
      case TokenKind.Pentru:
        return this.#parseFor();
      case TokenKind.Comment:
        return this.#parseComment();
      case TokenKind.Identifier:
        return this.#parseAssignment();
      default:
        return this.#parseUnexpectedStatement();
    }
  }

  #parseRead(): ReadStatement {
    const keyword = this.#advance();
    const targets: Identifier[] = [];

    if (!this.#check(TokenKind.Identifier)) {
      this.#report(
        'PARSE_READ_TARGET',
        "Instructiunea 'citeste' necesita cel putin o variabila.",
        this.#current().span,
        'Exemplu: citeste n, m',
      );
    } else {
      while (true) {
        targets.push(this.#parseIdentifier());
        if (!this.#match(TokenKind.Comma)) {
          break;
        }
        if (!this.#check(TokenKind.Identifier)) {
          this.#report(
            'PARSE_READ_TARGET',
            "Dupa ',' trebuie sa urmeze numele unei variabile.",
            this.#current().span,
          );
          break;
        }
      }
    }

    const annotation = this.#check(TokenKind.LeftParen) ? this.#parseAnnotation() : undefined;
    const end = annotation?.span.end ?? targets.at(-1)?.span.end ?? keyword.span.end;
    const span = this.#span(keyword.span.start, end);

    return {
      kind: 'ReadStatement',
      id: this.#ids.create('ReadStatement', span),
      span,
      targets,
      ...(annotation === undefined ? {} : { annotation }),
    };
  }

  #parseAnnotation(): Annotation {
    const leftParen = this.#advance();
    let depth = 1;
    let rightParen: Token | undefined;

    while (!this.#check(TokenKind.EndOfFile) && !this.#check(TokenKind.Newline)) {
      const token = this.#advance();
      if (token.kind === TokenKind.LeftParen) {
        depth += 1;
      } else if (token.kind === TokenKind.RightParen) {
        depth -= 1;
        if (depth === 0) {
          rightParen = token;
          break;
        }
      }
    }

    if (rightParen === undefined) {
      this.#report(
        'PARSE_ANNOTATION_END',
        'Adnotarea inceputa dupa citire nu este inchisa.',
        this.#pointSpan(this.#current().span.start),
        "Adauga ')' inainte de sfarsitul liniei.",
      );
    }

    const end = rightParen?.span.end ?? this.#previous().span.end;
    const contentEnd = rightParen?.span.start.offset ?? end.offset;
    const text = this.#source.slice(leftParen.span.end.offset, contentEnd).trim();
    const span = this.#span(leftParen.span.start, end);
    return {
      kind: 'Annotation',
      id: this.#ids.create('Annotation', span),
      span,
      text,
    };
  }

  #parseWrite(): WriteStatement {
    const keyword = this.#advance();
    const values: Expression[] = [];

    if (this.#isExpressionBoundary(this.#current().kind)) {
      this.#report(
        'PARSE_WRITE_VALUE',
        "Instructiunea 'scrie' necesita cel putin o expresie.",
        this.#current().span,
        'Exemplu: scrie rezultat',
      );
    } else {
      values.push(this.#parseExpression());
      while (this.#match(TokenKind.Comma)) {
        values.push(this.#parseExpression());
      }
    }

    const end = values.at(-1)?.span.end ?? keyword.span.end;
    const span = this.#span(keyword.span.start, end);
    return {
      kind: 'WriteStatement',
      id: this.#ids.create('WriteStatement', span),
      span,
      values,
    };
  }

  #parseAssignment(): AssignmentStatement {
    const target = this.#parseIdentifier();
    if (!this.#match(TokenKind.Assign)) {
      this.#report(
        'PARSE_ASSIGN_OPERATOR',
        `Lipseste operatorul de atribuire dupa variabila '${target.name}'.`,
        this.#current().span,
        "Foloseste '<-' sau '←' pentru atribuire.",
      );
    }
    const value = this.#parseExpression();
    const span = this.#span(target.span.start, value.span.end);
    return {
      kind: 'AssignmentStatement',
      id: this.#ids.create('AssignmentStatement', span),
      span,
      target,
      value,
    };
  }

  #parseIf(): IfStatement {
    const keyword = this.#advance();
    const condition = this.#parseExpression();
    this.#expect(
      TokenKind.Atunci,
      'PARSE_IF_ATUNCI',
      "Lipseste cuvantul-cheie 'atunci' dupa conditia instructiunii 'daca'.",
      'Exemplu: daca x > 0 atunci',
    );

    const thenBranch = this.#parseStatementList(
      () => this.#check(TokenKind.Altfel) || this.#checkCompound(TokenKind.Sfarsit, TokenKind.Daca),
    );
    let elseBranch: Statement[] = [];
    if (this.#match(TokenKind.Altfel)) {
      elseBranch = this.#parseStatementList(() =>
        this.#checkCompound(TokenKind.Sfarsit, TokenKind.Daca),
      );
    }

    const end = this.#consumeBlockEnd(
      TokenKind.Daca,
      "Blocul 'daca' nu este inchis cu 'sfarsit daca'.",
    );
    const span = this.#span(keyword.span.start, end);
    return {
      kind: 'IfStatement',
      id: this.#ids.create('IfStatement', span),
      span,
      condition,
      thenBranch,
      elseBranch,
    };
  }

  #parseWhile(): WhileStatement {
    const catKeyword = this.#advance();
    this.#expect(
      TokenKind.Timp,
      'PARSE_WHILE_TIMP',
      "Dupa 'cat' trebuie sa urmeze cuvantul-cheie 'timp'.",
      'Exemplu: cat timp n > 0 executa',
    );
    const condition = this.#parseExpression();
    this.#expect(
      TokenKind.Executa,
      'PARSE_WHILE_EXECUTA',
      "Lipseste cuvantul-cheie 'executa' dupa conditia buclei.",
    );
    const body = this.#parseStatementList(() =>
      this.#checkCompound(TokenKind.Sfarsit, TokenKind.Cat),
    );
    const end = this.#consumeWhileEnd();
    const span = this.#span(catKeyword.span.start, end);
    return {
      kind: 'WhileStatement',
      id: this.#ids.create('WhileStatement', span),
      span,
      condition,
      body,
    };
  }

  #parseRepeatUntil(): RepeatUntilStatement {
    const keyword = this.#advance();
    const body = this.#parseStatementList(() =>
      this.#checkCompound(TokenKind.Pana, TokenKind.Cand),
    );

    if (!this.#match(TokenKind.Pana)) {
      this.#report(
        'PARSE_REPEAT_END',
        "Blocul 'repeta' nu este inchis cu 'pana cand <conditie>'.",
        this.#current().span,
      );
    }
    this.#expect(
      TokenKind.Cand,
      'PARSE_REPEAT_CAND',
      "Dupa 'pana' trebuie sa urmeze cuvantul-cheie 'cand'.",
    );
    const condition = this.#parseExpression();
    const span = this.#span(keyword.span.start, condition.span.end);
    return {
      kind: 'RepeatUntilStatement',
      id: this.#ids.create('RepeatUntilStatement', span),
      span,
      body,
      condition,
    };
  }

  #parseFor(): ForStatement {
    const keyword = this.#advance();
    const variable = this.#parseRequiredIdentifier(
      'PARSE_FOR_VARIABLE',
      "Dupa 'pentru' trebuie sa urmeze variabila contor.",
    );
    this.#expect(
      TokenKind.Assign,
      'PARSE_FOR_ASSIGN',
      'Lipseste operatorul de atribuire pentru valoarea initiala a contorului.',
      'Exemplu: pentru i <- 1, n executa',
    );
    const start = this.#parseExpression();
    this.#expect(
      TokenKind.Comma,
      'PARSE_FOR_COMMA',
      "Valorile initiala si finala din 'pentru' trebuie separate prin ','.",
    );
    const endValue = this.#parseExpression();

    let step: Expression | undefined;
    if (this.#match(TokenKind.Comma)) {
      this.#match(TokenKind.Pas);
      step = this.#parseExpression();
    } else if (this.#match(TokenKind.Pas)) {
      step = this.#parseExpression();
    }

    this.#expect(
      TokenKind.Executa,
      'PARSE_FOR_EXECUTA',
      "Lipseste cuvantul-cheie 'executa' din antetul buclei 'pentru'.",
    );
    const body = this.#parseStatementList(() =>
      this.#checkCompound(TokenKind.Sfarsit, TokenKind.Pentru),
    );
    const blockEnd = this.#consumeBlockEnd(
      TokenKind.Pentru,
      "Blocul 'pentru' nu este inchis cu 'sfarsit pentru'.",
    );
    const span = this.#span(keyword.span.start, blockEnd);

    return {
      kind: 'ForStatement',
      id: this.#ids.create('ForStatement', span),
      span,
      variable,
      start,
      end: endValue,
      ...(step === undefined ? {} : { step }),
      body,
    };
  }

  #parseComment(): CommentStatement {
    const previous = this.#previous();
    const token = this.#advance();
    const inline =
      previous.kind !== TokenKind.Newline &&
      previous.kind !== TokenKind.Semicolon &&
      previous.kind !== TokenKind.EndOfFile &&
      previous.span.end.line === token.span.start.line;
    return {
      kind: 'CommentStatement',
      id: this.#ids.create('CommentStatement', token.span),
      span: token.span,
      text: typeof token.value === 'string' ? token.value : '',
      inline,
    };
  }

  #parseUnexpectedStatement(): ErrorStatement {
    const startToken = this.#current();
    this.#report(
      'PARSE001',
      `Nu poate incepe o instructiune cu '${startToken.lexeme || 'sfarsitul programului'}'.`,
      startToken.span,
      'Foloseste citeste, scrie, o atribuire sau o instructiune de control.',
    );
    this.#recoverToBoundary();
    const end =
      this.#previous().span.end.offset >= startToken.span.end.offset
        ? this.#previous().span.end
        : startToken.span.end;
    const span = this.#span(startToken.span.start, end);
    return {
      kind: 'ErrorStatement',
      id: this.#ids.create('ErrorStatement', span),
      span,
      text: this.#source.slice(span.start.offset, span.end.offset),
    };
  }

  #parseExpression(): Expression {
    const isRoot = this.#expressionDepth === 0;
    if (isRoot) {
      this.#expressionNodeCount = 0;
    }
    try {
      return this.#withExpressionFrame(() => this.#parseOr());
    } catch (error) {
      if (!isRoot) throw error;
      const position = this.#current().span.start;
      if (error instanceof ExpressionDepthFault) {
        this.#report(
          'PARSE_EXPRESSION_DEPTH',
          `Expresia depaseste limita de nesting de ${MAX_EXPRESSION_DEPTH} niveluri.`,
          this.#pointSpan(position),
          'Imparte expresia in mai multe atribuiri intermediare.',
        );
      } else if (error instanceof ExpressionComplexityFault) {
        this.#report(
          'PARSE_EXPRESSION_COMPLEXITY',
          `Expresia depaseste limita de complexitate de ${MAX_EXPRESSION_NODES} noduri sintactice.`,
          error.span,
          'Imparte calculul in mai multe atribuiri intermediare.',
        );
      } else {
        throw error;
      }
      this.#recoverExpressionTail();
      return this.#placeholderExpression(position);
    }
  }

  #parseOr(): Expression {
    let expression = this.#parseAnd();
    while (this.#match(TokenKind.Sau)) {
      const right = this.#parseAnd();
      expression = this.#binary(expression, 'sau', right);
    }
    return expression;
  }

  #parseAnd(): Expression {
    let expression = this.#parseNot();
    while (this.#match(TokenKind.Si)) {
      const right = this.#parseNot();
      expression = this.#binary(expression, 'si', right);
    }
    return expression;
  }

  #parseNot(): Expression {
    if (this.#match(TokenKind.Nu)) {
      const operator = this.#previous();
      return this.#unary(
        operator,
        'nu',
        this.#withExpressionFrame(() => this.#parseNot()),
      );
    }
    return this.#parseComparison();
  }

  #parseComparison(): Expression {
    let expression = this.#parseAdditive();
    let comparisonCount = 0;
    while (true) {
      const operator = comparisonOperators[this.#current().kind];
      if (operator === undefined) {
        break;
      }
      const operatorToken = this.#advance();
      comparisonCount += 1;
      if (comparisonCount > 1) {
        this.#report(
          'PARSE_CHAINED_COMPARISON',
          'Comparatiile inlantuite sunt ambigue in dialectul BAC-RO.',
          operatorToken.span,
          "Combina explicit comparatiile cu 'si'.",
        );
      }
      expression = this.#binary(expression, operator, this.#parseAdditive());
    }
    return expression;
  }

  #parseAdditive(): Expression {
    let expression = this.#parseMultiplicative();
    while (true) {
      const operator = additiveOperators[this.#current().kind];
      if (operator === undefined) {
        break;
      }
      this.#advance();
      expression = this.#binary(expression, operator, this.#parseMultiplicative());
    }
    return expression;
  }

  #parseMultiplicative(): Expression {
    let expression = this.#parseArithmeticUnary();
    while (true) {
      const operator = multiplicativeOperators[this.#current().kind];
      if (operator === undefined) {
        break;
      }
      this.#advance();
      expression = this.#binary(expression, operator, this.#parseArithmeticUnary());
    }
    return expression;
  }

  #parseArithmeticUnary(): Expression {
    if (this.#match(TokenKind.Plus)) {
      return this.#unary(
        this.#previous(),
        '+',
        this.#withExpressionFrame(() => this.#parseArithmeticUnary()),
      );
    }
    if (this.#match(TokenKind.Minus)) {
      return this.#unary(
        this.#previous(),
        '-',
        this.#withExpressionFrame(() => this.#parseArithmeticUnary()),
      );
    }
    return this.#parsePower();
  }

  #parsePower(): Expression {
    const left = this.#parsePrimary();
    if (!this.#match(TokenKind.Caret)) {
      return left;
    }
    return this.#binary(
      left,
      '^',
      this.#withExpressionFrame(() => this.#parseArithmeticUnary()),
    );
  }

  #parsePrimary(): Expression {
    if (this.#match(TokenKind.Integer)) {
      return this.#literal(this.#previous(), 'integer');
    }
    if (this.#match(TokenKind.Real)) {
      return this.#literal(this.#previous(), 'real');
    }
    if (this.#match(TokenKind.String)) {
      return this.#literal(this.#previous(), 'string');
    }
    if (this.#match(TokenKind.Adevarat, TokenKind.Fals)) {
      return this.#literal(this.#previous(), 'boolean');
    }
    if (this.#check(TokenKind.Identifier)) {
      return this.#parseIdentifier();
    }
    if (this.#match(TokenKind.LeftParen)) {
      const left = this.#previous();
      const expression = this.#parseExpression();
      const right = this.#expect(
        TokenKind.RightParen,
        'PARSE_GROUP_END',
        "Expresia dintre paranteze nu este inchisa cu ')'.",
      );
      const span = this.#span(left.span.start, right?.span.end ?? expression.span.end);
      this.#countExpressionNode(span);
      const grouping: GroupingExpression = {
        kind: 'GroupingExpression',
        id: this.#ids.create('GroupingExpression', span),
        span,
        expression,
      };
      return grouping;
    }
    if (this.#match(TokenKind.LeftBracket)) {
      const left = this.#previous();
      const expression = this.#parseExpression();
      const right = this.#expect(
        TokenKind.RightBracket,
        'PARSE_INTEGER_PART_END',
        "Partea intreaga inceputa cu '[' nu este inchisa cu ']'.",
      );
      const span = this.#span(left.span.start, right?.span.end ?? expression.span.end);
      this.#countExpressionNode(span);
      const integerPart: IntegerPartExpression = {
        kind: 'IntegerPartExpression',
        id: this.#ids.create('IntegerPartExpression', span),
        span,
        expression,
      };
      return integerPart;
    }

    const token = this.#current();
    this.#report(
      'PARSE_EXPRESSION',
      'Se astepta o expresie valida.',
      token.span,
      'Foloseste o valoare, o variabila sau o expresie intre paranteze.',
    );
    if (!this.#isExpressionBoundary(token.kind)) {
      this.#advance();
    }
    return this.#placeholderExpression(token.span.start);
  }

  #parseIdentifier(): Identifier {
    const token = this.#advance();
    const name = typeof token.value === 'string' ? token.value : token.lexeme;
    if (this.#expressionDepth > 0) {
      this.#countExpressionNode(token.span);
    }
    return {
      kind: 'Identifier',
      id: this.#ids.create('Identifier', token.span),
      span: token.span,
      name,
    };
  }

  #parseRequiredIdentifier(code: string, message: string): Identifier {
    if (this.#check(TokenKind.Identifier)) {
      return this.#parseIdentifier();
    }
    this.#report(code, message, this.#current().span);
    return this.#placeholderIdentifier(this.#current().span.start);
  }

  #literal(token: Token, valueType: LiteralExpression['valueType']): LiteralExpression {
    const fallback = valueType === 'boolean' ? false : token.lexeme;
    const value = token.value ?? fallback;
    this.#countExpressionNode(token.span);
    return {
      kind: 'Literal',
      id: this.#ids.create('Literal', token.span),
      span: token.span,
      valueType,
      value,
      raw: token.lexeme,
    };
  }

  #unary(token: Token, operator: UnaryOperator, operand: Expression): UnaryExpression {
    const span = this.#span(token.span.start, operand.span.end);
    this.#countExpressionNode(span);
    return {
      kind: 'UnaryExpression',
      id: this.#ids.create('UnaryExpression', span),
      span,
      operator,
      operand,
    };
  }

  #binary(left: Expression, operator: BinaryOperator, right: Expression): BinaryExpression {
    const span = this.#span(left.span.start, right.span.end);
    this.#countExpressionNode(span);
    return {
      kind: 'BinaryExpression',
      id: this.#ids.create('BinaryExpression', span),
      span,
      operator,
      left,
      right,
    };
  }

  #placeholderExpression(position: SourcePosition): LiteralExpression {
    const span = this.#pointSpan(position);
    return {
      kind: 'Literal',
      id: this.#ids.create('Literal', span),
      span,
      valueType: 'boolean',
      value: false,
      raw: '',
    };
  }

  #placeholderIdentifier(position: SourcePosition): Identifier {
    const span = this.#pointSpan(position);
    return {
      kind: 'Identifier',
      id: this.#ids.create('Identifier', span),
      span,
      name: '_eroare',
    };
  }

  #consumeWhileEnd(): SourcePosition {
    if (!this.#match(TokenKind.Sfarsit)) {
      this.#report(
        'PARSE_BLOCK_END',
        "Blocul 'cat timp' nu este inchis cu 'sfarsit cat timp'.",
        this.#current().span,
      );
      return this.#current().span.start;
    }
    const sfarsit = this.#previous();
    this.#expect(
      TokenKind.Cat,
      'PARSE_WHILE_END_CAT',
      "Dupa 'sfarsit' trebuie sa urmeze 'cat timp'.",
    );
    const timp = this.#expect(
      TokenKind.Timp,
      'PARSE_WHILE_END_TIMP',
      "Inchiderea buclei trebuie sa fie 'sfarsit cat timp'.",
    );
    return timp?.span.end ?? this.#previous().span.end ?? sfarsit.span.end;
  }

  #consumeBlockEnd(expectedKind: TokenKindType, message: string): SourcePosition {
    if (!this.#match(TokenKind.Sfarsit)) {
      this.#report('PARSE_BLOCK_END', message, this.#current().span);
      return this.#current().span.start;
    }
    const sfarsit = this.#previous();
    const expected = this.#expect(
      expectedKind,
      'PARSE_BLOCK_END_KIND',
      `Dupa 'sfarsit' trebuie sa urmeze '${this.#canonicalKeyword(expectedKind)}'.`,
    );
    return expected?.span.end ?? sfarsit.span.end;
  }

  #canonicalKeyword(kind: TokenKindType): string {
    const words: Partial<Record<TokenKindType, string>> = {
      [TokenKind.Daca]: 'daca',
      [TokenKind.Cat]: 'cat',
      [TokenKind.Pentru]: 'pentru',
    };
    return words[kind] ?? kind.toLowerCase();
  }

  #expect(kind: TokenKindType, code: string, message: string, hint?: string): Token | undefined {
    if (this.#check(kind)) {
      return this.#advance();
    }
    this.#report(code, message, this.#current().span, hint);
    return undefined;
  }

  #report(code: string, message: string, span: SourceSpan, hint?: string): void {
    this.#diagnostics.push({
      code,
      severity: 'error',
      message,
      span,
      ...(hint === undefined ? {} : { hint }),
    });
  }

  #recoverToBoundary(): void {
    while (
      !this.#check(TokenKind.EndOfFile) &&
      !this.#check(TokenKind.Newline) &&
      !this.#check(TokenKind.Semicolon) &&
      !this.#check(TokenKind.Comment)
    ) {
      this.#advance();
    }
  }

  #recoverExpressionTail(): void {
    while (
      !this.#check(TokenKind.EndOfFile) &&
      !this.#check(TokenKind.Newline) &&
      !this.#check(TokenKind.Semicolon) &&
      !this.#check(TokenKind.Comment) &&
      !this.#check(TokenKind.Comma) &&
      !this.#check(TokenKind.Atunci) &&
      !this.#check(TokenKind.Executa) &&
      !this.#check(TokenKind.Altfel) &&
      !this.#check(TokenKind.Sfarsit) &&
      !this.#check(TokenKind.Pana) &&
      !this.#check(TokenKind.Pas)
    ) {
      this.#advance();
    }
  }

  #withExpressionFrame(parseFrame: () => Expression): Expression {
    if (this.#expressionDepth >= MAX_EXPRESSION_DEPTH) {
      throw new ExpressionDepthFault();
    }
    this.#expressionDepth += 1;
    try {
      return parseFrame();
    } finally {
      this.#expressionDepth -= 1;
    }
  }

  #countExpressionNode(span: SourceSpan): void {
    if (this.#expressionNodeCount >= MAX_EXPRESSION_NODES) {
      throw new ExpressionComplexityFault(span);
    }
    this.#expressionNodeCount += 1;
  }

  #skipSeparators(): void {
    while (this.#match(TokenKind.Newline, TokenKind.Semicolon)) {
      // Intentional: consume all empty statement separators.
    }
  }

  #isExpressionBoundary(kind: TokenKindType): boolean {
    return (
      kind === TokenKind.EndOfFile ||
      kind === TokenKind.Newline ||
      kind === TokenKind.Semicolon ||
      kind === TokenKind.Comment ||
      kind === TokenKind.Comma ||
      kind === TokenKind.RightParen ||
      kind === TokenKind.RightBracket ||
      kind === TokenKind.Atunci ||
      kind === TokenKind.Executa ||
      kind === TokenKind.Altfel ||
      kind === TokenKind.Sfarsit ||
      kind === TokenKind.Pana ||
      kind === TokenKind.Pas
    );
  }

  #checkCompound(first: TokenKindType, second: TokenKindType): boolean {
    return this.#check(first) && this.#peekToken(1).kind === second;
  }

  #match(...kinds: readonly TokenKindType[]): boolean {
    for (const kind of kinds) {
      if (this.#check(kind)) {
        this.#advance();
        return true;
      }
    }
    return false;
  }

  #check(kind: TokenKindType): boolean {
    return this.#current().kind === kind;
  }

  #advance(): Token {
    const token = this.#current();
    if (token.kind !== TokenKind.EndOfFile) {
      this.#index += 1;
    }
    return token;
  }

  #current(): Token {
    return this.#tokens[this.#index] ?? this.#lastToken();
  }

  #previous(): Token {
    return this.#tokens[Math.max(0, this.#index - 1)] ?? this.#current();
  }

  #peekToken(distance: number): Token {
    return this.#tokens[this.#index + distance] ?? this.#lastToken();
  }

  #lastToken(): Token {
    const token = this.#tokens.at(-1);
    if (token === undefined) {
      throw new Error('Parserul necesita cel putin token-ul EndOfFile.');
    }
    return token;
  }

  #span(start: SourcePosition, end: SourcePosition): SourceSpan {
    return { start, end };
  }

  #pointSpan(position: SourcePosition): SourceSpan {
    return { start: position, end: position };
  }
}

export const parse = (source: string): ParseResult => {
  const lexical = lex(source);
  const excessive = excessiveControlToken(lexical.tokens);
  if (excessive !== undefined) {
    const start: SourcePosition = { offset: 0, line: 1, column: 1 };
    const end = lexical.tokens.at(-1)?.span.end ?? start;
    const span: SourceSpan = { start, end };
    const diagnostic: Diagnostic = {
      code: 'PARSE_CONTROL_DEPTH',
      severity: 'error',
      message: `Programul depaseste limita de nesting de ${MAX_CONTROL_DEPTH} blocuri.`,
      span: excessive.span,
      hint: 'Extrage parti ale algoritmului sau simplifica structurile de control imbricate.',
    };
    const program: Program = {
      kind: 'Program',
      id: new NodeIdFactory(source).create('Program', span),
      span,
      body: [],
    };
    return {
      source,
      program,
      tokens: lexical.tokens,
      diagnostics: [...lexical.diagnostics, diagnostic],
      ok: false,
    };
  }
  return new Parser(source, lexical.tokens, lexical.diagnostics).parseProgram();
};
