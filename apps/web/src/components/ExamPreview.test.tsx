import { fireEvent, render, screen } from '@testing-library/react';
import { parse } from '@grover/language';
import { describe, expect, it, vi } from 'vitest';
import { ExamPreview } from './ExamPreview';
import { buildExamLayout, moveCloserLine, validBoundaries } from './exam-layout';

const nestedSource = `citeste n
repeta
  daca n > 0 atunci
    n <- n - 1
  sfarsit daca
pana cand n = 0
scrie n`;
const nestedProgram = parse(nestedSource);

describe('buildExamLayout', () => {
  it('models nested rails and the special repeat footer', () => {
    const layout = buildExamLayout(nestedSource, nestedProgram.program, nestedProgram.tokens);

    expect(layout.blocks.map((block) => block.kind)).toEqual(['repeat', 'if']);
    expect(layout.lines[3]).toMatchObject({ depth: 2, kind: 'statement' });
    expect(layout.lines[4]).toMatchObject({ depth: 1, kind: 'close', repeatClose: false });
    expect(layout.lines[5]).toMatchObject({ depth: 0, kind: 'close', repeatClose: true });
  });
});

describe('moveCloserLine', () => {
  it('moves a textual closer as one structural edit', () => {
    const source = `daca x > 0 atunci
  x <- x - 1
sfarsit daca
scrie x`;

    expect(moveCloserLine(source, 2, 4)).toBe(`daca x > 0 atunci
  x <- x - 1
scrie x
sfarsit daca`);
  });
});

describe('ExamPreview', () => {
  it('renders square and condition end markers with accessible controls', () => {
    render(
      <ExamPreview
        source={nestedSource}
        program={nestedProgram.program}
        tokens={nestedProgram.tokens}
        onMoveCloser={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Final pentru blocul inceput la linia 3')).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Conditia finala a blocului inceput la linia 2: pana cand n = 0/u),
    ).toHaveTextContent('pana cand n = 0');
  });

  it('offers a keyboard equivalent for resizing a block', () => {
    const onMoveCloser = vi.fn();
    const source = `daca x > 0 atunci
  x <- 1
  y <- 2
sfarsit daca
scrie x`;
    const parsed = parse(source);
    render(
      <ExamPreview
        source={source}
        program={parsed.program}
        tokens={parsed.tokens}
        onMoveCloser={onMoveCloser}
      />,
    );

    fireEvent.keyDown(screen.getByLabelText('Final pentru blocul inceput la linia 1'), {
      altKey: true,
      key: 'ArrowUp',
    });

    expect(onMoveCloser).toHaveBeenCalledWith(3, 2);
  });

  it('supports touch-style selection followed by an explicit destination', () => {
    const onMoveCloser = vi.fn();
    const source = `daca x > 0 atunci
  x <- 1
  y <- 2
sfarsit daca
scrie x`;
    const parsed = parse(source);
    const { rerender } = render(
      <ExamPreview
        source={source}
        program={parsed.program}
        tokens={parsed.tokens}
        onMoveCloser={onMoveCloser}
      />,
    );
    const marker = screen.getByLabelText('Final pentru blocul inceput la linia 1');

    fireEvent.click(marker);
    const destinations = screen.getAllByRole('button', { name: /Muta finalul blocului inainte/u });
    expect(destinations.length).toBeGreaterThan(0);
    fireEvent.click(destinations[0] as HTMLButtonElement);

    expect(onMoveCloser).toHaveBeenCalledOnce();
    rerender(
      <ExamPreview
        source={source}
        program={parsed.program}
        tokens={parsed.tokens}
        onMoveCloser={onMoveCloser}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /Muta finalul blocului inainte/u }),
    ).not.toBeInTheDocument();
    expect(marker).toHaveFocus();
  });

  it('derives a block from the AST when its header has an inline comment', () => {
    const source = `daca adevarat atunci // comentariu
  scrie 1
sfarsit daca`;
    const parsed = parse(source);
    expect(parsed.ok).toBe(true);

    const layout = buildExamLayout(source, parsed.program, parsed.tokens);

    expect(layout.blocks).toHaveLength(1);
    expect(layout.blocks[0]).toMatchObject({ kind: 'if', openLine: 0, closeLine: 2 });
  });

  it('offers statement boundaries for a block nested through multiple ancestors', () => {
    const source = `daca adevarat atunci
  cat timp adevarat executa
    repeta
      scrie 1
    pana cand adevarat
  sfarsit cat timp
sfarsit daca`;
    const parsed = parse(source);
    const layout = buildExamLayout(source, parsed.program, parsed.tokens);
    const innermost = layout.blocks.find((block) => block.kind === 'repeat');
    expect(innermost).toBeDefined();
    if (innermost === undefined) return;

    expect(
      validBoundaries(innermost, layout.blocks, layout.lines.length, layout.boundaries),
    ).toContain(4);
  });
});
