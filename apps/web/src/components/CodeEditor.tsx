import { useEffect, useRef } from 'react';
import { normalizeWord } from '@grover/language';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { Annotation, EditorState, StateEffect, StateField, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

export interface EditorDiagnostic {
  readonly from: number;
  readonly message: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly to: number;
}

export interface EditorSpan {
  readonly end: number;
  readonly start: number;
}

interface CodeEditorProps {
  readonly activeSpan?: EditorSpan;
  readonly diagnostics: readonly EditorDiagnostic[];
  readonly onChange: (source: string) => void;
  readonly value: string;
}

const keywords = new Set([
  'adevarat',
  'altfel',
  'atunci',
  'cat',
  'cand',
  'citeste',
  'daca',
  'executa',
  'fals',
  'nu',
  'pentru',
  'pana',
  'repeta',
  'sau',
  'scrie',
  'sfarsit',
  'si',
]);

const findCommentStart = (line: string): number => {
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '/' && line[index + 1] === '/') {
      return index;
    }
  }
  return -1;
};

const keywordDecoration = Decoration.mark({ class: 'cm-bac-keyword' });
const numberDecoration = Decoration.mark({ class: 'cm-bac-number' });
const stringDecoration = Decoration.mark({ class: 'cm-bac-string' });
const stringDelimiterDecoration = Decoration.mark({ class: 'cm-bac-string-delimiter' });
const commentDecoration = Decoration.mark({ class: 'cm-bac-comment' });
const operatorDecoration = Decoration.mark({ class: 'cm-bac-operator' });
const activeDecoration = Decoration.mark({ class: 'cm-bac-executing' });

const isProtected = (index: number, protectedRanges: readonly EditorSpan[]): boolean =>
  protectedRanges.some((range) => index >= range.start && index < range.end);

const syntaxDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }

    private build(view: EditorView): DecorationSet {
      const ranges: Range<Decoration>[] = [];
      const visitedLines = new Set<number>();

      for (const visible of view.visibleRanges) {
        let cursor = visible.from;
        while (cursor <= visible.to) {
          const line = view.state.doc.lineAt(cursor);
          cursor = line.to + 1;
          if (visitedLines.has(line.number)) continue;
          visitedLines.add(line.number);

          const protectedRanges: EditorSpan[] = [];
          const commentStart = findCommentStart(line.text);
          const codeText = commentStart < 0 ? line.text : line.text.slice(0, commentStart);
          const stringPattern = /(['"])(?:\\.|(?!\1).)*\1/g;
          for (const match of codeText.matchAll(stringPattern)) {
            const start = match.index;
            const end = start + match[0].length;
            protectedRanges.push({ start, end });
            ranges.push(stringDelimiterDecoration.range(line.from + start, line.from + start + 1));
            if (end - start > 2) {
              ranges.push(stringDecoration.range(line.from + start + 1, line.from + end - 1));
            }
            ranges.push(stringDelimiterDecoration.range(line.from + end - 1, line.from + end));
          }

          if (commentStart >= 0) {
            protectedRanges.push({ start: commentStart, end: line.text.length });
            ranges.push(commentDecoration.range(line.from + commentStart, line.to));
          }

          for (const match of codeText.matchAll(/[\p{L}_][\p{L}\p{M}\p{N}_]*/gu)) {
            if (!keywords.has(normalizeWord(match[0]))) continue;
            if (isProtected(match.index, protectedRanges)) continue;
            ranges.push(
              keywordDecoration.range(
                line.from + match.index,
                line.from + match.index + match[0].length,
              ),
            );
          }

          for (const match of codeText.matchAll(/\b\d+(?:\.\d+)?\b/g)) {
            if (isProtected(match.index, protectedRanges)) continue;
            ranges.push(
              numberDecoration.range(
                line.from + match.index,
                line.from + match.index + match[0].length,
              ),
            );
          }

          for (const match of codeText.matchAll(/<-|<=|>=|!=|[←≠≤≥+*/%^=<>-]/g)) {
            if (isProtected(match.index, protectedRanges)) continue;
            ranges.push(
              operatorDecoration.range(
                line.from + match.index,
                line.from + match.index + match[0].length,
              ),
            );
          }
        }
      }

      return Decoration.set(ranges, true);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const setActiveSpan = StateEffect.define<EditorSpan | undefined>();
const externalDocumentUpdate = Annotation.define<boolean>();

const activeSpanField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setActiveSpan)) continue;
      const span = effect.value;
      next =
        span === undefined || span.end <= span.start
          ? Decoration.none
          : Decoration.set([activeDecoration.range(span.start, span.end)]);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--surface-code)',
    color: 'var(--code-ink)',
    fontSize: '14px',
    height: '100%',
  },
  '&.cm-focused': {
    boxShadow: 'inset 0 0 0 2px var(--focus)',
    outline: 'none',
  },
  '.cm-content': {
    caretColor: 'var(--lilac)',
    fontFamily: 'var(--font-mono)',
    fontVariantLigatures: 'none',
    lineHeight: '1.75',
    padding: '12px 0 48px',
  },
  '.cm-line': { padding: '0 16px' },
  '.cm-gutters': {
    backgroundColor: 'var(--surface-code-gutter)',
    borderRight: '1px solid var(--surface-code-border)',
    color: 'var(--code-muted)',
    fontFamily: 'var(--font-mono)',
    fontVariantLigatures: 'none',
    paddingTop: '12px',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--active-line)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--selection)',
  },
  '.cm-cursor': { borderLeftColor: 'var(--lilac)' },
  '.cm-bac-keyword': { color: 'var(--syntax-keyword)' },
  '.cm-bac-number': { color: 'var(--syntax-number)' },
  '.cm-bac-string': { color: 'var(--syntax-string)' },
  '.cm-bac-string-delimiter': { color: '#d9f5dd' },
  '.cm-bac-comment': { color: 'var(--syntax-comment)' },
  '.cm-bac-operator': { color: 'var(--syntax-operator)' },
  '.cm-bac-executing': {
    backgroundColor: 'var(--executing)',
    borderBottom: '2px solid var(--accent)',
    color: 'var(--ink)',
  },
  '.cm-bac-executing *': { color: 'var(--ink)' },
  '.cm-diagnosticText': { fontFamily: 'var(--font-sans)', fontSize: '12px' },
});

export function CodeEditor({ activeSpan, diagnostics, onChange, value }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (hostRef.current === null) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        syntaxDecorations,
        activeSpanField,
        placeholder('Scrie sau lipeste aici un algoritm in pseudocod...'),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          'aria-label': 'Editor de pseudocod',
          spellcheck: 'false',
        }),
        EditorView.updateListener.of((update) => {
          const isExternal = update.transactions.some(
            (transaction) => transaction.annotation(externalDocumentUpdate) === true,
          );
          if (update.docChanged && !isExternal) onChangeRef.current(update.state.doc.toString());
        }),
        editorTheme,
      ],
    });

    const view = new EditorView({ parent: hostRef.current, state });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // CodeMirror owns its document after initialization. Prop updates are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    const current = view.state.doc.toString();
    if (current === value) return;

    let from = 0;
    const commonLength = Math.min(current.length, value.length);
    while (from < commonLength && current[from] === value[from]) from += 1;

    let currentEnd = current.length;
    let valueEnd = value.length;
    while (
      currentEnd > from &&
      valueEnd > from &&
      current[currentEnd - 1] === value[valueEnd - 1]
    ) {
      currentEnd -= 1;
      valueEnd -= 1;
    }

    view.dispatch({
      annotations: externalDocumentUpdate.of(true),
      changes: { from, to: currentEnd, insert: value.slice(from, valueEnd) },
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    const safeSpan =
      activeSpan === undefined
        ? undefined
        : {
            start: Math.max(0, Math.min(activeSpan.start, view.state.doc.length)),
            end: Math.max(0, Math.min(activeSpan.end, view.state.doc.length)),
          };
    view.dispatch({ effects: setActiveSpan.of(safeSpan) });
  }, [activeSpan]);

  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    const mapped: Diagnostic[] = diagnostics.map((diagnostic) => ({
      from: Math.max(0, Math.min(diagnostic.from, view.state.doc.length)),
      message: diagnostic.message,
      severity: diagnostic.severity,
      to: Math.max(0, Math.min(diagnostic.to, view.state.doc.length)),
    }));
    view.dispatch(setDiagnostics(view.state, mapped));
  }, [diagnostics]);

  return <div ref={hostRef} className="code-editor" data-testid="code-editor" />;
}
