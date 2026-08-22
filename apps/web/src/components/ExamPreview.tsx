import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import type { Program, Token } from '@grover/language';
import type { EditorSpan } from './CodeEditor';
import {
  buildExamLayout,
  validBoundaries,
  type ExamLayoutLine,
  type StructuralBlock,
} from './exam-layout';

export interface ExamPreviewProps {
  readonly activeSpan?: EditorSpan;
  readonly onMoveCloser: (closeLine: number, targetBoundary: number) => void;
  readonly program: Program;
  readonly source: string;
  readonly tokens: readonly Token[];
}

const containsPosition = (line: ExamLayoutLine, span: EditorSpan | undefined): boolean =>
  span !== undefined && span.start <= line.end && span.end >= line.start;

function RailPrefix({ depth, kind }: Pick<ExamLayoutLine, 'depth' | 'kind'>) {
  return (
    <span className="exam-prefix" aria-hidden="true">
      {Array.from({ length: depth }, (_, index) => (
        <span key={index} className="exam-prefix__cell">
          │
        </span>
      ))}
      {kind === 'open' || kind === 'close' ? (
        <span className="exam-prefix__cell">{kind === 'open' ? '┌' : '└'}</span>
      ) : null}
    </span>
  );
}

export function ExamPreview({
  activeSpan,
  onMoveCloser,
  program,
  source,
  tokens,
}: ExamPreviewProps) {
  const layout = useMemo(() => buildExamLayout(source, program, tokens), [program, source, tokens]);
  const [draggingId, setDraggingId] = useState<string>();
  const previewRef = useRef<HTMLDivElement>(null);
  const restoreFocusLine = useRef<number | undefined>(undefined);
  const selectedBlock = layout.blocks.find((block) => block.id === draggingId);
  const boundaries =
    selectedBlock === undefined
      ? []
      : validBoundaries(selectedBlock, layout.blocks, layout.lines.length, layout.boundaries);

  const finishDrag = (): void => setDraggingId(undefined);
  const moveSelected = (block: StructuralBlock, targetBoundary: number): void => {
    restoreFocusLine.current = block.openLine;
    onMoveCloser(block.closeLine, targetBoundary);
    finishDrag();
  };

  useLayoutEffect(() => {
    const openLine = restoreFocusLine.current;
    if (openLine === undefined) return;
    const marker = previewRef.current?.querySelector<HTMLButtonElement>(
      `[data-block-open-line="${openLine}"]`,
    );
    if (marker !== undefined && marker !== null) {
      marker.focus();
      restoreFocusLine.current = undefined;
    }
  }, [draggingId, layout]);

  const moveWithKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    block: StructuralBlock,
  ): void => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const choices = validBoundaries(block, layout.blocks, layout.lines.length, layout.boundaries);
    const currentIndex = choices.findIndex((boundary) => boundary >= block.closeLine);
    const direction = event.key === 'ArrowUp' ? -1 : 1;
    const target = choices[currentIndex + direction];
    if (target !== undefined) moveSelected(block, target);
  };

  const renderDropZone = (boundary: number) => {
    if (!boundaries.includes(boundary) || selectedBlock === undefined) return null;
    return (
      <button
        type="button"
        className="exam-drop-zone"
        aria-label={`Muta finalul blocului inainte de linia ${boundary + 1}`}
        onDragOver={(event) => event.preventDefault()}
        onClick={() => moveSelected(selectedBlock, boundary)}
        onDrop={(event: DragEvent<HTMLButtonElement>) => {
          event.preventDefault();
          moveSelected(selectedBlock, boundary);
        }}
      >
        <span>Muta finalul aici</span>
      </button>
    );
  };

  return (
    <div ref={previewRef} className="exam-preview" data-testid="exam-preview">
      <div className="exam-preview__hint">
        Trage sau selecteaza marcajul final, apoi alege un rand. Foloseste Alt + ↑/↓ pentru keyboard
        control; instructiunile separate prin ; se muta impreuna cu randul lor.
      </div>
      {layout.lines.map((line) => {
        const block =
          line.blockId === undefined
            ? undefined
            : layout.blocks.find((candidate) => candidate.id === line.blockId);
        return (
          <div key={`${line.index}-${line.start}`}>
            {renderDropZone(line.index)}
            <div
              className={`exam-line${containsPosition(line, activeSpan) ? ' exam-line--active' : ''}`}
              data-line={line.index + 1}
            >
              <RailPrefix depth={line.depth} kind={line.kind} />
              <span className="exam-line__code">
                {line.kind === 'close' && !line.repeatClose && block !== undefined ? (
                  <button
                    type="button"
                    className="exam-end-marker"
                    draggable
                    aria-pressed={draggingId === block.id}
                    aria-label={`Final pentru blocul inceput la linia ${block.openLine + 1}`}
                    data-block-open-line={block.openLine}
                    title="Trage pentru a redimensiona blocul; Alt + sageti pentru keyboard control"
                    onDragEnd={finishDrag}
                    onClick={() =>
                      setDraggingId((current) => (current === block.id ? undefined : block.id))
                    }
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', block.id);
                      setDraggingId(block.id);
                    }}
                    onKeyDown={(event) => moveWithKeyboard(event, block)}
                  >
                    <span className="exam-end-marker__square" />
                  </button>
                ) : line.kind === 'close' && line.repeatClose && block !== undefined ? (
                  <button
                    type="button"
                    className="exam-end-marker exam-end-marker--condition"
                    draggable
                    aria-pressed={draggingId === block.id}
                    aria-label={`Conditia finala a blocului inceput la linia ${block.openLine + 1}: ${line.code}`}
                    data-block-open-line={block.openLine}
                    onDragEnd={finishDrag}
                    onClick={() =>
                      setDraggingId((current) => (current === block.id ? undefined : block.id))
                    }
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', block.id);
                      setDraggingId(block.id);
                    }}
                    onKeyDown={(event) => moveWithKeyboard(event, block)}
                  >
                    {line.code}
                  </button>
                ) : (
                  line.code || ' '
                )}
              </span>
            </div>
          </div>
        );
      })}
      {renderDropZone(layout.lines.length)}
    </div>
  );
}
