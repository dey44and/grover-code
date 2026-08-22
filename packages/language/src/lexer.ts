import type { SourcePosition, SourceSpan } from './ast.js';
import type { Diagnostic } from './diagnostics.js';
import { normalizeOperator, normalizeWord } from './normalization.js';
import { TokenKind, type Token, type TokenKind as TokenKindType } from './token.js';

export interface LexResult {
  readonly tokens: readonly Token[];
  readonly diagnostics: readonly Diagnostic[];
}

const keywords: Readonly<Record<string, TokenKindType>> = {
  citeste: TokenKind.Citeste,
  scrie: TokenKind.Scrie,
  daca: TokenKind.Daca,
  atunci: TokenKind.Atunci,
  altfel: TokenKind.Altfel,
  sfarsit: TokenKind.Sfarsit,
  cat: TokenKind.Cat,
  timp: TokenKind.Timp,
  executa: TokenKind.Executa,
  repeta: TokenKind.Repeta,
  pana: TokenKind.Pana,
  cand: TokenKind.Cand,
  pentru: TokenKind.Pentru,
  pas: TokenKind.Pas,
  si: TokenKind.Si,
  sau: TokenKind.Sau,
  nu: TokenKind.Nu,
  adevarat: TokenKind.Adevarat,
  fals: TokenKind.Fals,
};

const isDigit = (character: string): boolean => character >= '0' && character <= '9';
const isIdentifierStart = (character: string): boolean => /[\p{L}\p{Nl}_]/u.test(character);
const isIdentifierPart = (character: string): boolean =>
  /[\p{L}\p{Nl}\p{M}\p{Nd}\p{Pc}]/u.test(character);

class Lexer {
  readonly #source: string;
  readonly #tokens: Token[] = [];
  readonly #diagnostics: Diagnostic[] = [];
  #offset = 0;
  #line = 1;
  #column = 1;

  public constructor(source: string) {
    this.#source = source;
  }

  public scan(): LexResult {
    while (!this.#isAtEnd()) {
      this.#scanToken();
    }

    const position = this.#position();
    this.#tokens.push({
      kind: TokenKind.EndOfFile,
      lexeme: '',
      span: { start: position, end: position },
    });

    return { tokens: this.#tokens, diagnostics: this.#diagnostics };
  }

  #scanToken(): void {
    const start = this.#position();
    const character = this.#peek();

    if (
      character === ' ' ||
      character === '\t' ||
      character === '\f' ||
      character === '\v' ||
      /\p{Zs}/u.test(character)
    ) {
      this.#advance();
      return;
    }

    if (character === '\n' || character === '\r') {
      this.#scanNewline(start);
      return;
    }

    if (character === '/' && this.#peek(1) === '/') {
      this.#scanComment(start);
      return;
    }

    if (isDigit(character) || (character === '.' && isDigit(this.#peek(1)))) {
      this.#scanNumber(start);
      return;
    }

    if (isIdentifierStart(character)) {
      this.#scanIdentifier(start);
      return;
    }

    if (character === '"' || character === "'") {
      this.#scanString(start, character);
      return;
    }

    const twoCharacters = this.#source.slice(this.#offset, this.#offset + 2);
    const twoCharacterOperators: Readonly<Record<string, TokenKindType>> = {
      '<-': TokenKind.Assign,
      ':=': TokenKind.Assign,
      '!=': TokenKind.NotEqual,
      '<>': TokenKind.NotEqual,
      '<=': TokenKind.LessEqual,
      '>=': TokenKind.GreaterEqual,
    };
    const twoCharacterKind = twoCharacterOperators[twoCharacters];
    if (twoCharacterKind !== undefined) {
      this.#advance();
      this.#advance();
      this.#emit(twoCharacterKind, start, normalizeOperator(twoCharacters));
      return;
    }

    const singleCharacterTokens: Readonly<Record<string, TokenKindType>> = {
      '(': TokenKind.LeftParen,
      ')': TokenKind.RightParen,
      '[': TokenKind.LeftBracket,
      ']': TokenKind.RightBracket,
      ',': TokenKind.Comma,
      ';': TokenKind.Semicolon,
      '+': TokenKind.Plus,
      '-': TokenKind.Minus,
      '*': TokenKind.Star,
      '/': TokenKind.Slash,
      '%': TokenKind.Percent,
      '^': TokenKind.Caret,
      '=': TokenKind.Equal,
      '<': TokenKind.Less,
      '>': TokenKind.Greater,
      '←': TokenKind.Assign,
      '⟵': TokenKind.Assign,
      '≠': TokenKind.NotEqual,
      '≤': TokenKind.LessEqual,
      '≥': TokenKind.GreaterEqual,
      '×': TokenKind.Star,
      '÷': TokenKind.Slash,
    };
    const singleCharacterKind = singleCharacterTokens[character];
    if (singleCharacterKind !== undefined) {
      this.#advance();
      this.#emit(singleCharacterKind, start, normalizeOperator(character));
      return;
    }

    this.#advance();
    const span = this.#spanFrom(start);
    this.#tokens.push({ kind: TokenKind.Invalid, lexeme: this.#slice(span), span });
    this.#diagnostics.push({
      code: 'LEX001',
      severity: 'error',
      message: `Caracterul '${character}' nu este valid in pseudocod.`,
      span,
      hint: 'Elimina caracterul sau inlocuieste-l cu un operator acceptat.',
    });
  }

  #scanNewline(start: SourcePosition): void {
    if (this.#peek() === '\r' && this.#peek(1) === '\n') {
      this.#offset += 2;
    } else {
      this.#offset += 1;
    }
    this.#line += 1;
    this.#column = 1;
    this.#emit(TokenKind.Newline, start);
  }

  #scanComment(start: SourcePosition): void {
    this.#advance();
    this.#advance();
    while (!this.#isAtEnd() && this.#peek() !== '\n' && this.#peek() !== '\r') {
      this.#advance();
    }
    const span = this.#spanFrom(start);
    const lexeme = this.#slice(span);
    this.#tokens.push({
      kind: TokenKind.Comment,
      lexeme,
      value: lexeme.slice(2).trimStart(),
      span,
    });
  }

  #scanNumber(start: SourcePosition): void {
    let isReal = false;

    if (this.#peek() === '.') {
      isReal = true;
      this.#advance();
    }

    while (isDigit(this.#peek())) {
      this.#advance();
    }

    if (this.#peek() === '.') {
      isReal = true;
      this.#advance();
      while (isDigit(this.#peek())) {
        this.#advance();
      }
    }

    if (this.#peek().toLowerCase() === 'e') {
      isReal = true;
      this.#advance();
      if (this.#peek() === '+' || this.#peek() === '-') {
        this.#advance();
      }
      const exponentStart = this.#position();
      while (isDigit(this.#peek())) {
        this.#advance();
      }
      if (exponentStart.offset === this.#offset) {
        const span = this.#spanFrom(start);
        this.#diagnostics.push({
          code: 'LEX002',
          severity: 'error',
          message: 'Exponentul numarului real trebuie sa contina cel putin o cifra.',
          span,
          hint: 'Exemplu valid: 1.5e-3.',
        });
      }
    }

    const span = this.#spanFrom(start);
    const lexeme = this.#slice(span);
    let value = lexeme.toLowerCase();
    if (value.startsWith('.')) {
      value = `0${value}`;
    }
    if (value.endsWith('.')) {
      value = `${value}0`;
    }
    this.#tokens.push({
      kind: isReal ? TokenKind.Real : TokenKind.Integer,
      lexeme,
      value,
      span,
    });
  }

  #scanIdentifier(start: SourcePosition): void {
    this.#advance();
    while (isIdentifierPart(this.#peek())) {
      this.#advance();
    }

    const span = this.#spanFrom(start);
    const lexeme = this.#slice(span);
    const normalized = normalizeWord(lexeme);
    const keywordKind = keywords[normalized];

    if (keywordKind === undefined) {
      this.#tokens.push({
        kind: TokenKind.Identifier,
        lexeme,
        value: lexeme.normalize('NFC'),
        span,
      });
      return;
    }

    const value =
      keywordKind === TokenKind.Adevarat
        ? true
        : keywordKind === TokenKind.Fals
          ? false
          : normalized;
    this.#tokens.push({ kind: keywordKind, lexeme, value, span });
  }

  #scanString(start: SourcePosition, quote: string): void {
    this.#advance();
    let value = '';
    let terminated = false;

    while (!this.#isAtEnd() && this.#peek() !== '\n' && this.#peek() !== '\r') {
      const character = this.#peek();
      if (character === quote) {
        this.#advance();
        terminated = true;
        break;
      }

      if (character !== '\\') {
        value += character;
        this.#advance();
        continue;
      }

      this.#advance();
      if (this.#isAtEnd() || this.#peek() === '\n' || this.#peek() === '\r') {
        break;
      }

      const escape = this.#peek();
      this.#advance();
      if (escape === 'u') {
        const digits = this.#source.slice(this.#offset, this.#offset + 4);
        if (/^[\dA-Fa-f]{4}$/u.test(digits)) {
          value += String.fromCharCode(Number.parseInt(digits, 16));
          for (let index = 0; index < 4; index += 1) this.#advance();
          continue;
        }
      }
      const escapeValues: Readonly<Record<string, string>> = {
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
        '\\': '\\',
        '"': '"',
        "'": "'",
      };
      const decoded = escapeValues[escape];
      if (decoded === undefined) {
        value += escape;
        const escapeSpan: SourceSpan = {
          start: {
            offset: this.#offset - escape.length - 1,
            line: this.#line,
            column: this.#column - 2,
          },
          end: this.#position(),
        };
        this.#diagnostics.push({
          code: 'LEX004',
          severity: 'warning',
          message: `Secventa de escape '\\${escape}' nu este recunoscuta.`,
          span: escapeSpan,
          hint: 'Sunt acceptate escape-urile JSON pentru control characters, Unicode, ghilimele si backslash.',
        });
      } else {
        value += decoded;
      }
    }

    const span = this.#spanFrom(start);
    if (!terminated) {
      this.#diagnostics.push({
        code: 'LEX003',
        severity: 'error',
        message: 'Sirul de caractere nu este inchis.',
        span,
        hint: `Adauga caracterul ${quote} inainte de sfarsitul liniei.`,
      });
    }
    this.#tokens.push({ kind: TokenKind.String, lexeme: this.#slice(span), value, span });
  }

  #emit(kind: TokenKindType, start: SourcePosition, value?: string | boolean): void {
    const span = this.#spanFrom(start);
    const token =
      value === undefined
        ? { kind, lexeme: this.#slice(span), span }
        : { kind, lexeme: this.#slice(span), value, span };
    this.#tokens.push(token);
  }

  #peek(relativeOffset = 0): string {
    const offset = this.#offset + relativeOffset;
    if (offset >= this.#source.length) {
      return '\0';
    }
    const codePoint = this.#source.codePointAt(offset);
    return codePoint === undefined ? '\0' : String.fromCodePoint(codePoint);
  }

  #advance(): string {
    if (this.#isAtEnd()) {
      return '\0';
    }
    const character = this.#peek();
    this.#offset += character.length;
    this.#column += character.length;
    return character;
  }

  #isAtEnd(): boolean {
    return this.#offset >= this.#source.length;
  }

  #position(): SourcePosition {
    return { offset: this.#offset, line: this.#line, column: this.#column };
  }

  #spanFrom(start: SourcePosition): SourceSpan {
    return { start, end: this.#position() };
  }

  #slice(span: SourceSpan): string {
    return this.#source.slice(span.start.offset, span.end.offset);
  }
}

export const lex = (source: string): LexResult => new Lexer(source).scan();
