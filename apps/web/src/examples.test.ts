import { parse } from '@grover/language';
import { createInterpreter } from '@grover/runtime';
import { describe, expect, it } from 'vitest';

import { examples } from './examples';

const expectedOutput: Readonly<Record<string, string>> = {
  'cifre-pare': '2026',
  cmmdc: '6',
  suma: '55',
};

describe('programe integrate', () => {
  it.each(examples)('parseaza si executa exemplul $name', (example) => {
    const parsed = parse(example.source);
    expect(parsed.ok, JSON.stringify(parsed.diagnostics)).toBe(true);

    const state = createInterpreter(parsed.program, { input: example.input }).run();

    expect(state.status).toBe('completed');
    expect(state.renderedOutput).toBe(expectedOutput[example.id]);
    expect(state.trace.length).toBeGreaterThan(0);
  });
});
