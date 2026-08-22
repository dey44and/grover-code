import type { SourceSpan } from './ast.js';

export const TokenKind = {
  EndOfFile: 'EndOfFile',
  Newline: 'Newline',
  Comment: 'Comment',
  Invalid: 'Invalid',

  Identifier: 'Identifier',
  Integer: 'Integer',
  Real: 'Real',
  String: 'String',

  Citeste: 'Citeste',
  Scrie: 'Scrie',
  Daca: 'Daca',
  Atunci: 'Atunci',
  Altfel: 'Altfel',
  Sfarsit: 'Sfarsit',
  Cat: 'Cat',
  Timp: 'Timp',
  Executa: 'Executa',
  Repeta: 'Repeta',
  Pana: 'Pana',
  Cand: 'Cand',
  Pentru: 'Pentru',
  Pas: 'Pas',
  Si: 'Si',
  Sau: 'Sau',
  Nu: 'Nu',
  Adevarat: 'Adevarat',
  Fals: 'Fals',

  LeftParen: 'LeftParen',
  RightParen: 'RightParen',
  LeftBracket: 'LeftBracket',
  RightBracket: 'RightBracket',
  Comma: 'Comma',
  Semicolon: 'Semicolon',

  Plus: 'Plus',
  Minus: 'Minus',
  Star: 'Star',
  Slash: 'Slash',
  Percent: 'Percent',
  Caret: 'Caret',
  Assign: 'Assign',
  Equal: 'Equal',
  NotEqual: 'NotEqual',
  Less: 'Less',
  LessEqual: 'LessEqual',
  Greater: 'Greater',
  GreaterEqual: 'GreaterEqual',
} as const;

export type TokenKind = (typeof TokenKind)[keyof typeof TokenKind];

export type TokenValue = string | boolean;

export interface Token {
  readonly kind: TokenKind;
  /** Exact text from the source. */
  readonly lexeme: string;
  /** Canonical spelling or decoded literal value, when applicable. */
  readonly value?: TokenValue;
  readonly span: SourceSpan;
}

export const tokenDescription = (kind: TokenKind): string => {
  const descriptions: Partial<Record<TokenKind, string>> = {
    [TokenKind.EndOfFile]: 'sfarsitul programului',
    [TokenKind.Newline]: 'sfarsit de linie',
    [TokenKind.Identifier]: 'un identificator',
    [TokenKind.Integer]: 'un numar intreg',
    [TokenKind.Real]: 'un numar real',
    [TokenKind.String]: 'un sir de caractere',
    [TokenKind.LeftParen]: "'('",
    [TokenKind.RightParen]: "')'",
    [TokenKind.LeftBracket]: "'['",
    [TokenKind.RightBracket]: "']'",
    [TokenKind.Comma]: "','",
    [TokenKind.Semicolon]: "';'",
    [TokenKind.Assign]: "'<-'",
    [TokenKind.Atunci]: "'atunci'",
    [TokenKind.Executa]: "'executa'",
  };

  return descriptions[kind] ?? `'${kind.toLowerCase()}'`;
};
