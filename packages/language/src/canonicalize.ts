import { lex } from './lexer.js';
import { TokenKind, type Token } from './token.js';

const canonicalTokenText = (token: Token): string => {
  const spellings: Partial<Record<Token['kind'], string>> = {
    [TokenKind.Citeste]: 'citeste',
    [TokenKind.Scrie]: 'scrie',
    [TokenKind.Daca]: 'daca',
    [TokenKind.Atunci]: 'atunci',
    [TokenKind.Altfel]: 'altfel',
    [TokenKind.Sfarsit]: 'sfarsit',
    [TokenKind.Cat]: 'cat',
    [TokenKind.Timp]: 'timp',
    [TokenKind.Executa]: 'executa',
    [TokenKind.Repeta]: 'repeta',
    [TokenKind.Pana]: 'pana',
    [TokenKind.Cand]: 'cand',
    [TokenKind.Pentru]: 'pentru',
    [TokenKind.Pas]: 'pas',
    [TokenKind.Si]: 'si',
    [TokenKind.Sau]: 'sau',
    [TokenKind.Nu]: 'nu',
    [TokenKind.Adevarat]: 'adevarat',
    [TokenKind.Fals]: 'fals',
    [TokenKind.Assign]: '<-',
    [TokenKind.NotEqual]: '!=',
    [TokenKind.LessEqual]: '<=',
    [TokenKind.GreaterEqual]: '>=',
    [TokenKind.Star]: '*',
    [TokenKind.Slash]: '/',
  };
  return spellings[token.kind] ?? token.lexeme;
};

/**
 * Normalizes keyword and operator spellings while preserving whitespace,
 * comments, string contents, identifier spelling and line endings.
 */
export const normalizeSource = (source: string): string => {
  const { tokens } = lex(source);
  let result = '';
  let previousOffset = 0;

  for (const token of tokens) {
    if (token.kind === TokenKind.EndOfFile) {
      break;
    }
    result += source.slice(previousOffset, token.span.start.offset);
    result += canonicalTokenText(token);
    previousOffset = token.span.end.offset;
  }

  return result + source.slice(previousOffset);
};
