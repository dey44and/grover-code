import { describe, expect, it } from 'vitest';

import { format, parse } from '../src/index.js';

describe('formatter canonic', () => {
  it('produce keyword-uri ASCII, indentare stabila si pas BAC fara keyword suplimentar', () => {
    const source = `Citește n (număr natural)
Pentru i ← 1, n, pas 2 Execută
Dacă i % 2 = 0 Atunci
Scrie "par", i // rezultat
Altfel
Scrie 'impar'
Sfârșit Dacă
Sfârșit Pentru`;
    const parsed = parse(source);
    expect(parsed.ok, JSON.stringify(parsed.diagnostics)).toBe(true);
    expect(format(parsed.program)).toBe(`citeste n (număr natural)
pentru i <- 1, n, 2 executa
  daca i % 2 = 0 atunci
    scrie "par", i // rezultat
  altfel
    scrie "impar"
  sfarsit daca
sfarsit pentru
`);
  });

  it('este idempotent prin parse-format-parse', () => {
    const initial = parse(`repeta
x←x+1; y←[x/2]
pana cand nu x<10 sau y=4`);
    expect(initial.ok).toBe(true);
    const once = format(initial.program);
    const reparsed = parse(once);
    expect(reparsed.ok, JSON.stringify(reparsed.diagnostics)).toBe(true);
    expect(format(reparsed.program)).toBe(once);
  });

  it('pastreaza semantica precedentei si grouping-ul explicit', () => {
    const result = parse('x <- (a + b) * c ^ (d ^ e)\ny <- nu a = b sau c si d');
    expect(result.ok).toBe(true);
    expect(format(result.program, { finalNewline: false })).toBe(
      'x <- (a + b) * c ^ (d ^ e)\ny <- nu a = b sau c si d',
    );
  });

  it('suporta optiuni de output fara a modifica AST-ul', () => {
    const result = parse(`daca x atunci
scrie x
sfarsit daca`);
    const before = JSON.stringify(result.program);
    expect(
      format(result.program, {
        assignmentOperator: '←',
        indent: '\t',
        lineEnding: '\r\n',
        finalNewline: false,
      }),
    ).toBe('daca x atunci\r\n\tscrie x\r\nsfarsit daca');
    expect(JSON.stringify(result.program)).toBe(before);
  });

  it('pastreaza comentariile standalone si inline', () => {
    const result = parse(`// initializare
x <- 1 // unu
scrie x`);
    expect(result.ok).toBe(true);
    expect(format(result.program)).toBe(`// initializare
x <- 1 // unu
scrie x
`);
  });

  it('round-trips control characters din string-uri', () => {
    const initial = parse('scrie "a\\b\\f\\u0000"');
    expect(initial.ok).toBe(true);
    const reparsed = parse(format(initial.program));

    expect(reparsed.ok, JSON.stringify(reparsed.diagnostics)).toBe(true);
    expect(reparsed.program).toMatchObject({
      body: [{ kind: 'WriteStatement', values: [{ value: 'a\b\f\0' }] }],
    });
  });
});
