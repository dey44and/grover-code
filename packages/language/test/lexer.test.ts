import { describe, expect, it } from 'vitest';

import {
  TokenKind,
  foldDiacritics,
  lex,
  normalizeOperator,
  normalizeSource,
  normalizeWord,
} from '../src/index.js';

const must = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new Error('Valoarea asteptata lipseste din test.');
  }
  return value;
};

describe('normalizare', () => {
  it('normalizeaza formele romanesti si operatorii Unicode', () => {
    expect(normalizeWord('SFÂRȘIT')).toBe('sfarsit');
    expect(normalizeWord('citeşte')).toBe('citeste');
    expect(foldDiacritics('până când')).toBe('pana cand');
    expect(normalizeOperator('←')).toBe('<-');
    expect(normalizeOperator('≠')).toBe('!=');
  });

  it('normalizeaza numai token-urile limbajului, nu comentariile si string-urile', () => {
    const source = 'CITEȘTE șir\nDacă șir ≠ "Dacă ←" atunci // Dacă ←\n';
    expect(normalizeSource(source)).toBe('citeste șir\ndaca șir != "Dacă ←" atunci // Dacă ←\n');
  });
});

describe('lexer', () => {
  it('recunoaste keyword-uri cu diacritice si pastreaza span-uri UTF-16 exacte', () => {
    const result = lex('Citește n\r\nDacă n ≤ 10 și n ≠ 0 atunci');
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      TokenKind.Citeste,
      TokenKind.Identifier,
      TokenKind.Newline,
      TokenKind.Daca,
      TokenKind.Identifier,
      TokenKind.LessEqual,
      TokenKind.Integer,
      TokenKind.Si,
      TokenKind.Identifier,
      TokenKind.NotEqual,
      TokenKind.Integer,
      TokenKind.Atunci,
      TokenKind.EndOfFile,
    ]);

    const newline = must(result.tokens[2]);
    expect(newline.lexeme).toBe('\r\n');
    expect(newline.span).toEqual({
      start: { offset: 9, line: 1, column: 10 },
      end: { offset: 11, line: 2, column: 1 },
    });
    expect(must(result.tokens[5]).value).toBe('<=');
    expect(must(result.tokens[9]).value).toBe('!=');
  });

  it('accepta keyword-uri cu diacritice decomposed', () => {
    const source = `sfa\u0302rs\u0326it daca`;
    const result = lex(source);
    expect(result.diagnostics).toEqual([]);
    expect(must(result.tokens[0]).kind).toBe(TokenKind.Sfarsit);
    expect(must(result.tokens[0]).span.end.offset).toBe(9);
  });

  it('decodeaza literali fara pierdere de precizie', () => {
    const result = lex('0 001 12.50 .5 1. 6.02e23 "a\\n b" \'ok\'');
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.slice(0, -1).map((token) => token.value)).toEqual([
      '0',
      '001',
      '12.50',
      '0.5',
      '1.0',
      '6.02e23',
      'a\n b',
      'ok',
    ]);
  });

  it('decodeaza escape-urile emise de formatter pentru control characters', () => {
    const result = lex('"a\\b\\f\\u0000"');

    expect(result.diagnostics).toEqual([]);
    expect(result.tokens[0]?.value).toBe('a\b\f\0');
  });

  it('raporteaza caractere invalide si string-uri neincheiate fara sa se blocheze', () => {
    const result = lex('@ "abc\n?');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'LEX001',
      'LEX003',
      'LEX001',
    ]);
    expect(result.tokens.at(-1)?.kind).toBe(TokenKind.EndOfFile);
  });

  it('trateaza U+0000 ca input invalid, nu ca sentinel de final', () => {
    const result = lex('\0');

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['LEX001']);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      TokenKind.Invalid,
      TokenKind.EndOfFile,
    ]);
    expect(result.tokens[0]?.span.end.offset).toBe(1);
  });

  it('trateaza // ca un comentariu pana la sfarsitul liniei', () => {
    const result = lex('x <- 10 / 2 // impartire\ny <- 1');
    const comment = result.tokens.find((token) => token.kind === TokenKind.Comment);
    expect(comment?.value).toBe('impartire');
    expect(comment?.span.start.line).toBe(1);
    expect(result.tokens.filter((token) => token.kind === TokenKind.Slash)).toHaveLength(1);
  });
});
