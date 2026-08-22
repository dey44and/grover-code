import { describe, expect, it } from 'vitest';

import type { AstNode, Expression, Statement } from '../src/index.js';
import { MAX_EXPRESSION_NODES, parse } from '../src/index.js';

const must = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new Error('Valoarea asteptata lipseste din test.');
  }
  return value;
};

const officialStyleProgram = `citește n (număr natural nenul)
x ← 0; p ← 1
cât timp n > 0 execută
  c <- n % 10
  dacă c % 2 = 0 atunci
    x <- x * 10 + c
  altfel
    p <- p * c
  sfârșit dacă
  n <- [n / 10]
sfârșit cât timp
scrie x, p
`;

const collectNodeIds = (value: unknown, ids: string[] = []): string[] => {
  if (typeof value !== 'object' || value === null) {
    return ids;
  }
  if ('kind' in value && 'id' in value) {
    ids.push((value as AstNode).id);
  }
  for (const nested of Object.values(value)) {
    collectNodeIds(nested, ids);
  }
  return ids;
};

describe('parser - programe BAC', () => {
  it('parseaza un exemplu oficial-style cu blocuri imbricate', () => {
    const result = parse(officialStyleProgram);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.program.body.map((statement) => statement.kind)).toEqual([
      'ReadStatement',
      'AssignmentStatement',
      'AssignmentStatement',
      'WhileStatement',
      'WriteStatement',
    ]);

    const read = must(result.program.body[0]);
    expect(read.kind).toBe('ReadStatement');
    if (read.kind === 'ReadStatement') {
      expect(read.targets.map((target) => target.name)).toEqual(['n']);
      expect(read.annotation?.text).toBe('număr natural nenul');
    }

    const loop = must(result.program.body[3]);
    expect(loop.kind).toBe('WhileStatement');
    if (loop.kind === 'WhileStatement') {
      expect(loop.body.map((statement) => statement.kind)).toEqual([
        'AssignmentStatement',
        'IfStatement',
        'AssignmentStatement',
      ]);
      const conditional = must(loop.body[1]);
      expect(conditional.kind).toBe('IfStatement');
      if (conditional.kind === 'IfStatement') {
        expect(conditional.thenBranch).toHaveLength(1);
        expect(conditional.elseBranch).toHaveLength(1);
      }
    }
  });

  it('genereaza ID-uri unice si deterministe pentru fiecare nod', () => {
    const first = parse(officialStyleProgram).program;
    const second = parse(officialStyleProgram).program;
    const firstIds = collectNodeIds(first);
    const secondIds = collectNodeIds(second);
    expect(firstIds).toEqual(secondIds);
    expect(new Set(firstIds).size).toBe(firstIds.length);
  });

  it('modeleaza span-uri half-open precise', () => {
    const source = 'x <- 10\r\nscrie x';
    const result = parse(source);
    const assignment = must(result.program.body[0]);
    const write = must(result.program.body[1]);
    expect(assignment.span).toEqual({
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 7, line: 1, column: 8 },
    });
    expect(write.span).toEqual({
      start: { offset: 9, line: 2, column: 1 },
      end: { offset: 16, line: 2, column: 8 },
    });
    expect(result.program.span.end.offset).toBe(source.length);
  });

  it('parseaza repeta si pentru cu pas explicit', () => {
    const result = parse(`pentru i <- 10, 1, -2 executa
  repeta
    scrie i
  pana cand i % 2 = 0
sfarsit pentru`);
    expect(result.ok).toBe(true);
    const statement = must(result.program.body[0]);
    expect(statement.kind).toBe('ForStatement');
    if (statement.kind === 'ForStatement') {
      expect(statement.variable.name).toBe('i');
      expect(statement.step?.kind).toBe('UnaryExpression');
      expect(statement.body[0]?.kind).toBe('RepeatUntilStatement');
    }
  });

  it("accepta aliasul tolerant 'pas'", () => {
    const result = parse(`pentru i <- 1, 9 pas 2 executa
  scrie i
sfarsit pentru`);
    expect(result.ok).toBe(true);
    const statement = must(result.program.body[0]);
    expect(statement.kind === 'ForStatement' ? statement.step : undefined).toBeDefined();
  });
});

describe('parser - expresii', () => {
  const assignedValue = (source: string): Expression => {
    const result = parse(`x <- ${source}`);
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    const statement = must(result.program.body[0]);
    if (statement.kind !== 'AssignmentStatement') {
      throw new Error('Se astepta o atribuire.');
    }
    return statement.value;
  };

  it('aplica precedenta: sau < si < nu < comparatii < aritmetica', () => {
    const value = assignedValue('nu a = b sau c si d');
    expect(value.kind).toBe('BinaryExpression');
    if (value.kind === 'BinaryExpression') {
      expect(value.operator).toBe('sau');
      expect(value.left.kind).toBe('UnaryExpression');
      expect(value.right.kind).toBe('BinaryExpression');
      if (value.left.kind === 'UnaryExpression') {
        expect(value.left.operand.kind).toBe('BinaryExpression');
      }
    }
  });

  it('trateaza puterea ca right-associative si sub minusul unar', () => {
    const value = assignedValue('-2 ^ 2 ^ -3');
    expect(value.kind).toBe('UnaryExpression');
    if (value.kind === 'UnaryExpression') {
      expect(value.operator).toBe('-');
      expect(value.operand.kind).toBe('BinaryExpression');
      if (value.operand.kind === 'BinaryExpression') {
        expect(value.operand.operator).toBe('^');
        expect(value.operand.right.kind).toBe('BinaryExpression');
      }
    }
  });

  it('pastreaza grouping-ul si operatorul de parte intreaga', () => {
    const value = assignedValue('[(a + 1) / 2]');
    expect(value.kind).toBe('IntegerPartExpression');
    if (value.kind === 'IntegerPartExpression') {
      expect(value.expression.kind).toBe('BinaryExpression');
      if (value.expression.kind === 'BinaryExpression') {
        expect(value.expression.left.kind).toBe('GroupingExpression');
      }
    }
  });

  it('respinge comparatiile inlantuite cu un diagnostic actionabil', () => {
    const result = parse('x <- 1 < n < 10');
    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.code === 'PARSE_CHAINED_COMPARISON'),
    ).toBe(true);
  });
});

describe('parser - recovery', () => {
  it('continua cu liniile urmatoare dupa instructiuni invalide', () => {
    const result = parse(`x <-
@
scrie x`);
    expect(result.ok).toBe(false);
    expect(result.program.body.map((statement: Statement) => statement.kind)).toEqual([
      'AssignmentStatement',
      'ErrorStatement',
      'WriteStatement',
    ]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('PARSE_EXPRESSION');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('LEX001');
  });

  it('returneaza un AST partial pentru un bloc neincheiat', () => {
    const result = parse(`daca n > 0 atunci
  scrie n`);
    expect(result.ok).toBe(false);
    expect(result.program.body[0]?.kind).toBe('IfStatement');
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'PARSE_BLOCK_END')).toBe(
      true,
    );
  });

  it('recupereaza dupa lipsa separatorului dintre instructiuni', () => {
    const result = parse(`x <- 1 y <- 2
scrie x`);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'PARSE002')).toBe(true);
    expect(result.program.body.at(-1)?.kind).toBe('WriteStatement');
  });

  it.each([
    '',
    'daca atunci',
    'cat n executa',
    'repeta\npana cand',
    'pentru <- , executa',
    'scrie (1 + ]',
    'sfarsit daca\nscrie 1',
  ])('nu arunca exceptii pentru input incomplet: %j', (source) => {
    expect(() => parse(source)).not.toThrow();
  });

  it('limiteaza nesting-ul adversarial fara stack overflow', () => {
    const source = `x <- ${'('.repeat(2_000)}1${')'.repeat(2_000)}`;
    const result = parse(source);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((item) => item.code === 'PARSE_EXPRESSION_DEPTH')).toBe(true);
  });

  it('accepta o expresie exact la limita de complexitate', () => {
    const terms = MAX_EXPRESSION_NODES / 2;
    expect(Number.isInteger(terms)).toBe(true);
    // Unary minus + N literals + (N - 1) binary nodes = 2N nodes.
    const result = parse(`x <- -${Array.from({ length: terms }, () => '1').join(' + ')}`);

    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.diagnostics.some((item) => item.code === 'PARSE_EXPRESSION_COMPLEXITY')).toBe(
      false,
    );
  });

  it('respinge determinist o expresie imediat peste limita si continua programul', () => {
    const terms = MAX_EXPRESSION_NODES / 2 + 1;
    // N literals + (N - 1) binary nodes = 2N - 1 nodes.
    const result = parse(`x <- ${Array.from({ length: terms }, () => '1').join(' + ')}\nscrie x`);
    const complexityDiagnostics = result.diagnostics.filter(
      (item) => item.code === 'PARSE_EXPRESSION_COMPLEXITY',
    );

    expect(result.ok).toBe(false);
    expect(complexityDiagnostics).toHaveLength(1);
    expect(complexityDiagnostics[0]?.message).toContain(String(MAX_EXPRESSION_NODES));
    expect(result.program.body.at(-1)?.kind).toBe('WriteStatement');
    expect(() => JSON.stringify(result.program)).not.toThrow();
  });

  it('recupereaza liniar dintr-un chain binar adversarial', () => {
    const result = parse(`x <- ${Array.from({ length: 10_000 }, () => '1').join(' + ')}\nscrie x`);

    expect(
      result.diagnostics.filter((item) => item.code === 'PARSE_EXPRESSION_COMPLEXITY'),
    ).toHaveLength(1);
    expect(result.diagnostics.some((item) => item.code === 'PARSE002')).toBe(false);
    expect(result.program.body.at(-1)?.kind).toBe('WriteStatement');
  });

  it('limiteaza nesting-ul structural inainte de parser-ul recursiv', () => {
    const source = `${'daca adevarat atunci\n'.repeat(5_000)}${'sfarsit daca\n'.repeat(5_000)}`;
    const result = parse(source);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((item) => item.code === 'PARSE_CONTROL_DEPTH')).toBe(true);
  });
});
