/** UTF-16 source coordinates. `line` and `column` are one-based; `offset` is zero-based. */
export interface SourcePosition {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

/** A half-open source range: `start` is inclusive and `end` is exclusive. */
export interface SourceSpan {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

/**
 * A deterministic identifier assigned by the parser. IDs are unique inside one
 * syntax tree and remain identical when the same source is parsed again.
 */
export type NodeId = string;

export interface AstNode {
  readonly id: NodeId;
  readonly kind: string;
  readonly span: SourceSpan;
}

export interface Program extends AstNode {
  readonly kind: 'Program';
  readonly body: readonly Statement[];
}

export interface Identifier extends AstNode {
  readonly kind: 'Identifier';
  readonly name: string;
}

export type LiteralValueType = 'integer' | 'real' | 'boolean' | 'string';

/** Integer and real values are kept as canonical strings to avoid precision loss. */
export interface LiteralExpression extends AstNode {
  readonly kind: 'Literal';
  readonly valueType: LiteralValueType;
  readonly value: string | boolean;
  readonly raw: string;
}

export type UnaryOperator = '+' | '-' | 'nu';

export interface UnaryExpression extends AstNode {
  readonly kind: 'UnaryExpression';
  readonly operator: UnaryOperator;
  readonly operand: Expression;
}

export type BinaryOperator =
  '+' | '-' | '*' | '/' | '%' | '^' | '=' | '!=' | '<' | '<=' | '>' | '>=' | 'si' | 'sau';

export interface BinaryExpression extends AstNode {
  readonly kind: 'BinaryExpression';
  readonly operator: BinaryOperator;
  readonly left: Expression;
  readonly right: Expression;
}

export interface GroupingExpression extends AstNode {
  readonly kind: 'GroupingExpression';
  readonly expression: Expression;
}

/** BAC notation `[expresie]`: the integer part of an expression. */
export interface IntegerPartExpression extends AstNode {
  readonly kind: 'IntegerPartExpression';
  readonly expression: Expression;
}

export type Expression =
  | Identifier
  | LiteralExpression
  | UnaryExpression
  | BinaryExpression
  | GroupingExpression
  | IntegerPartExpression;

export interface Annotation extends AstNode {
  readonly kind: 'Annotation';
  /** Text inside the parentheses, trimmed but otherwise preserved. */
  readonly text: string;
}

export interface ReadStatement extends AstNode {
  readonly kind: 'ReadStatement';
  readonly targets: readonly Identifier[];
  readonly annotation?: Annotation;
}

export interface WriteStatement extends AstNode {
  readonly kind: 'WriteStatement';
  readonly values: readonly Expression[];
}

export interface AssignmentStatement extends AstNode {
  readonly kind: 'AssignmentStatement';
  readonly target: Identifier;
  readonly value: Expression;
}

export interface IfStatement extends AstNode {
  readonly kind: 'IfStatement';
  readonly condition: Expression;
  readonly thenBranch: readonly Statement[];
  readonly elseBranch: readonly Statement[];
}

export interface WhileStatement extends AstNode {
  readonly kind: 'WhileStatement';
  readonly condition: Expression;
  readonly body: readonly Statement[];
}

export interface RepeatUntilStatement extends AstNode {
  readonly kind: 'RepeatUntilStatement';
  readonly body: readonly Statement[];
  readonly condition: Expression;
}

export interface ForStatement extends AstNode {
  readonly kind: 'ForStatement';
  readonly variable: Identifier;
  readonly start: Expression;
  readonly end: Expression;
  readonly step?: Expression;
  readonly body: readonly Statement[];
}

export interface CommentStatement extends AstNode {
  readonly kind: 'CommentStatement';
  /** Comment content without the leading `//`. */
  readonly text: string;
  readonly inline: boolean;
}

/** A recovery node. A program containing one is never valid for execution. */
export interface ErrorStatement extends AstNode {
  readonly kind: 'ErrorStatement';
  readonly text: string;
}

export type Statement =
  | ReadStatement
  | WriteStatement
  | AssignmentStatement
  | IfStatement
  | WhileStatement
  | RepeatUntilStatement
  | ForStatement
  | CommentStatement
  | ErrorStatement;

export const isExpression = (node: AstNode): node is Expression =>
  node.kind === 'Identifier' ||
  node.kind === 'Literal' ||
  node.kind === 'UnaryExpression' ||
  node.kind === 'BinaryExpression' ||
  node.kind === 'GroupingExpression' ||
  node.kind === 'IntegerPartExpression';
