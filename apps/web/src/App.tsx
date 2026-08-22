import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { parse } from '@grover/language';
import {
  createInterpreter,
  formatRuntimeValue,
  parseInputTape,
  type Interpreter,
  type MachineState,
  type RuntimeValue,
  type TraceRecord,
} from '@grover/runtime';

import type { EditorDiagnostic, EditorSpan } from './components/CodeEditor';
import { ExamPreview } from './components/ExamPreview';
import { moveCloserLine } from './components/exam-layout';
import { examples } from './examples';

const CodeEditor = lazy(async () => {
  const module = await import('./components/CodeEditor');
  return { default: module.CodeEditor };
});

const DocsPage = lazy(async () => {
  const module = await import('./components/DocsPage');
  return { default: module.DocsPage };
});

type Page = 'workspace' | 'docs';
type EditorMode = 'source' | 'exam';
type ControlIconName = 'back' | 'pause' | 'play' | 'reset' | 'step';

interface DebugSession {
  readonly interpreter: Interpreter;
  readonly state: MachineState;
}

const requireInitialExample = () => {
  const example = examples[0];
  if (example === undefined) throw new Error('Este necesar cel putin un exemplu.');
  return example;
};

const initialExample = requireInitialExample();

const typeLabels: Readonly<Record<RuntimeValue['type'], string>> = {
  boolean: 'logic',
  integer: 'intreg',
  real: 'real',
  string: 'sir',
};

const toEditorSpan = (
  span:
    | {
        readonly start: { readonly offset: number };
        readonly end: { readonly offset: number };
      }
    | undefined,
): EditorSpan | undefined =>
  span === undefined ? undefined : { start: span.start.offset, end: span.end.offset };

const phaseLabel: Readonly<Record<TraceRecord['phase'], string>> = {
  assignment: 'atribuire',
  condition: 'conditie',
  read: 'citire',
  write: 'afisare',
};

const traceDetail = (record: TraceRecord): string => {
  if (record.conditionResult !== undefined) {
    const changes = record.variableChanges
      .map((change) => `${change.name}=${formatRuntimeValue(change.after)}`)
      .join(', ');
    return `${changes.length > 0 ? `${changes}; ` : ''}rezultat=${record.conditionResult ? 'adevarat' : 'fals'}`;
  }
  if (record.inputConsumed !== undefined) {
    return record.variableChanges
      .map((change) => `${change.name} <- ${formatRuntimeValue(change.after)}`)
      .join(', ');
  }
  if (record.outputAppended !== undefined)
    return `output += ${JSON.stringify(record.outputAppended)}`;
  return record.variableChanges
    .map((change) => {
      const before = change.before === undefined ? '∅' : formatRuntimeValue(change.before);
      return `${change.name}: ${before} -> ${formatRuntimeValue(change.after)}`;
    })
    .join(', ');
};

const describeMachineState = (state: MachineState): string => {
  if (state.error !== undefined) return `Eroare: ${state.error.message}`;
  if (state.limit !== undefined) return `Limita: ${state.limit.message}`;
  if (state.waitingForInput !== undefined) {
    return 'Executia asteapta input suplimentar.';
  }
  const record = state.trace.at(-1);
  if (record === undefined) {
    return state.status === 'completed' ? 'Executie finalizata fara pasi.' : '';
  }
  const step = `Pas ${record.index}, ${phaseLabel[record.phase]}: ${traceDetail(record)}`;
  return state.status === 'completed' ? `${step}. Executie finalizata.` : step;
};

function ControlIcon({ name }: { readonly name: ControlIconName }) {
  const paths: Readonly<Record<ControlIconName, ReactNode>> = {
    back: (
      <>
        <path d="m10.5 5-5 5 5 5" />
        <path d="M6 10h8.5a3.5 3.5 0 0 1 0 7H13" />
      </>
    ),
    pause: (
      <>
        <path d="M7 5v10" />
        <path d="M13 5v10" />
      </>
    ),
    play: <path d="m7 5 8 5-8 5Z" />,
    reset: (
      <>
        <path d="M5.2 7.1A6 6 0 1 1 5 13" />
        <path d="M5.2 3.8v3.5H8.7" />
      </>
    ),
    step: (
      <>
        <path d="m5.5 5 7 5-7 5Z" />
        <path d="M15 5v10" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className="control-button__icon"
      fill="none"
      focusable="false"
      viewBox="0 0 20 20"
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">
        {paths[name]}
      </g>
    </svg>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand__mark" aria-hidden="true" />
      <span className="brand__copy">
        <span className="brand__name">Grover</span>
        {/* <span className="brand__descriptor">interpretor pentru pseudocod</span> */}
      </span>
      {/* <span className="brand__version">v1</span> */}
    </div>
  );
}

interface HeaderProps {
  readonly onNavigate: (page: Page) => void;
  readonly page: Page;
}

function Header({ onNavigate, page }: HeaderProps) {
  return (
    <header className="app-header">
      <Brand />
      <nav className="primary-nav" aria-label="Navigare principala">
        <button
          type="button"
          className="nav-button"
          lang="en"
          aria-current={page === 'workspace' ? 'page' : undefined}
          onClick={() => onNavigate('workspace')}
        >
          Code
        </button>
        <button
          type="button"
          className="nav-button"
          aria-current={page === 'docs' ? 'page' : undefined}
          onClick={() => onNavigate('docs')}
        >
          Documentatie
        </button>
      </nav>
    </header>
  );
}

interface VariablesProps {
  readonly state: MachineState;
}

function Variables({ state }: VariablesProps) {
  const variables = Object.entries(state.variables).sort(([left], [right]) =>
    left.localeCompare(right, 'ro'),
  );
  const lastChanges = new Map(
    state.trace.at(-1)?.variableChanges.map((change) => [change.name, change]) ?? [],
  );

  return (
    <section className="panel variables-panel" aria-labelledby="variables-title">
      <div className="panel-header">
        <h2 id="variables-title">Variabile</h2>
        <span className="panel-header__meta">{variables.length} simboluri</span>
      </div>
      {variables.length === 0 ? (
        <div className="empty-state">Variabilele apar dupa prima citire sau atribuire.</div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nume</th>
                <th>Valoare</th>
                <th>Tip</th>
                <th>Anterior</th>
              </tr>
            </thead>
            <tbody>
              {variables.map(([name, value]) => {
                const change = lastChanges.get(name);
                return (
                  <tr key={name}>
                    <td>{name}</td>
                    <td
                      className={`value-cell${change?.changed === true ? ' value-cell--changed' : ''}`}
                    >
                      {formatRuntimeValue(value)}
                    </td>
                    <td className="muted-cell">{typeLabels[value.type]}</td>
                    <td className="muted-cell">
                      {change === undefined
                        ? '—'
                        : change.before === undefined
                          ? '∅'
                          : formatRuntimeValue(change.before)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface TraceProps {
  readonly trace: readonly TraceRecord[];
}

function Trace({ trace }: TraceProps) {
  const maximumVisible = 500;
  const omitted = Math.max(0, trace.length - maximumVisible);
  const visibleTrace = omitted === 0 ? trace : trace.slice(omitted);
  return (
    <section className="panel trace-panel" aria-labelledby="trace-title">
      <div className="panel-header">
        <h2 id="trace-title" lang="en">
          Execution trace
        </h2>
        <span className="panel-header__meta">{trace.length} pasi</span>
      </div>
      {trace.length === 0 ? (
        <div className="empty-state">Fiecare pas semantic va fi inregistrat aici.</div>
      ) : (
        <ol className="trace-list">
          {omitted === 0 ? null : (
            <li className="trace-truncated">
              Primele {omitted} evenimente sunt pastrate in runtime, dar ascunse din lista pentru
              performanta.
            </li>
          )}
          {visibleTrace.map((record, index) => (
            <li
              key={record.index}
              aria-current={index === visibleTrace.length - 1 ? 'step' : undefined}
              className={`trace-item${index === visibleTrace.length - 1 ? ' trace-item--current' : ''}`}
            >
              <span className="trace-item__index">#{record.index}</span>
              <span className="trace-item__phase">{phaseLabel[record.phase]}</span>
              <span className="trace-item__detail">{traceDetail(record)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

interface ControlsProps {
  readonly canExecute: boolean;
  readonly isPlaying: boolean;
  readonly onPause: () => void;
  readonly onReset: () => void;
  readonly onRun: () => void;
  readonly onStep: () => void;
  readonly onStepBack: () => void;
  readonly state: MachineState | undefined;
  readonly stepButtonRef: Ref<HTMLButtonElement>;
}

function Controls({
  canExecute,
  isPlaying,
  onPause,
  onReset,
  onRun,
  onStep,
  onStepBack,
  state,
  stepButtonRef,
}: ControlsProps) {
  const terminal =
    state?.status === 'completed' ||
    state?.status === 'error' ||
    state?.status === 'limit' ||
    state?.status === 'waiting-input';
  return (
    <div className="run-controls" role="group" aria-label="Controale debugger">
      {isPlaying ? (
        <button
          type="button"
          className="control-button control-button--primary"
          aria-label="Pauza executiei"
          onClick={onPause}
        >
          <ControlIcon name="pause" />
          <span className="control-button__label">Pauza</span>
        </button>
      ) : (
        <button
          type="button"
          className="control-button control-button--primary"
          aria-label="Ruleaza programul"
          disabled={!canExecute || terminal}
          onClick={onRun}
        >
          <ControlIcon name="play" />
          <span className="control-button__label">Ruleaza</span>
        </button>
      )}
      <button
        ref={stepButtonRef}
        type="button"
        className="control-button"
        aria-label="Pas: executa instructiunea urmatoare"
        disabled={!canExecute || isPlaying || terminal}
        onClick={onStep}
      >
        <ControlIcon name="step" />
        <span className="control-button__label">Pas</span>
      </button>
      <button
        type="button"
        className="control-button"
        aria-label="Inapoi: revino cu un pas"
        disabled={isPlaying || state?.canStepBack !== true}
        onClick={onStepBack}
      >
        <ControlIcon name="back" />
        <span className="control-button__label">Inapoi</span>
      </button>
      <button
        type="button"
        className="control-button"
        aria-label="Reset: reseteaza executia"
        disabled={!canExecute || isPlaying}
        onClick={onReset}
      >
        <ControlIcon name="reset" />
        <span className="control-button__label">Reset</span>
      </button>
    </div>
  );
}

export function App() {
  const [page, setPage] = useState<Page>('workspace');
  const [editorMode, setEditorMode] = useState<EditorMode>('source');
  const [selectedExample, setSelectedExample] = useState(initialExample.id);
  const [source, setSource] = useState(initialExample.source);
  const [input, setInput] = useState(initialExample.input);
  const [pendingInput, setPendingInput] = useState('');
  const [appendedInputCount, setAppendedInputCount] = useState(0);
  const [session, setSession] = useState<DebugSession>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const stepButtonRef = useRef<HTMLButtonElement>(null);
  const additionalInputRef = useRef<HTMLInputElement>(null);

  const parseResult = useMemo(() => parse(source), [source]);
  const inputResult = useMemo(() => parseInputTape(input), [input]);
  const pendingInputResult = useMemo(() => parseInputTape(pendingInput), [pendingInput]);
  const canExecute = parseResult.ok && inputResult.diagnostics.length === 0;

  const interpreter = useMemo(
    () =>
      canExecute
        ? createInterpreter(parseResult.program, {
            executionLimit: 100_000,
            input,
          })
        : undefined,
    [canExecute, input, parseResult.program],
  );

  const machineState =
    interpreter === undefined
      ? undefined
      : session?.interpreter === interpreter
        ? session.state
        : interpreter.state;

  useEffect(() => {
    if (!isPlaying || interpreter === undefined) return;

    let frame = 0;
    const tick = (): void => {
      const next = interpreter.runSlice(2_048);
      setSession({ interpreter, state: next });
      if (next.status === 'ready') {
        frame = window.requestAnimationFrame(tick);
      } else {
        setAnnouncement(describeMachineState(next));
        setIsPlaying(false);
      }
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [interpreter, isPlaying]);

  useEffect(() => {
    if (machineState?.status !== 'waiting-input') return;
    const frame = window.requestAnimationFrame(() => {
      const field = additionalInputRef.current;
      if (field === null) return;
      field.focus({ preventScroll: true });
      const bounds = field.getBoundingClientRect();
      if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
        field.scrollIntoView({ behavior: 'auto', block: 'center' });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [machineState?.status, machineState?.waitingForInput?.available]);

  const traceRecord = machineState?.trace.at(-1);
  const resourceLimitSpan =
    machineState?.limit?.kind === 'resource' ? machineState.limit.span : undefined;
  const activeSpan = toEditorSpan(
    machineState?.error?.span ??
      resourceLimitSpan ??
      machineState?.waitingForInput?.span ??
      traceRecord?.span,
  );
  const editorDiagnostics: readonly EditorDiagnostic[] = parseResult.diagnostics.map(
    (diagnostic) => ({
      from: diagnostic.span.start.offset,
      message:
        diagnostic.hint === undefined
          ? diagnostic.message
          : `${diagnostic.message} ${diagnostic.hint}`,
      severity: diagnostic.severity,
      to: diagnostic.span.end.offset,
    }),
  );
  const firstDiagnostic = parseResult.diagnostics.find(
    (diagnostic) => diagnostic.severity === 'error',
  );

  const updateSession = (state: MachineState): void => {
    if (interpreter !== undefined) setSession({ interpreter, state });
  };

  const loadExample = (id: string): void => {
    const example = examples.find((candidate) => candidate.id === id);
    if (example === undefined) return;
    setIsPlaying(false);
    setSelectedExample(example.id);
    setSource(example.source);
    setInput(example.input);
    setPendingInput('');
    setAppendedInputCount(0);
    setSession(undefined);
    setAnnouncement('');
  };

  const editSource = (next: string): void => {
    setIsPlaying(false);
    setSelectedExample('custom');
    setSource(next);
    setPendingInput('');
    setAppendedInputCount(0);
    setSession(undefined);
    setAnnouncement('');
  };

  const shownState = machineState ?? {
    canStepBack: false,
    input: { length: 0, position: 0, remaining: 0 },
    output: [],
    outputCharacters: 0,
    renderedOutput: '',
    status: 'ready' as const,
    stepsExecuted: 0,
    trace: [],
    variables: {},
  };
  const inputLocked =
    shownState.stepsExecuted > 0 || shownState.status === 'waiting-input' || appendedInputCount > 0;
  const variableSummary = Object.entries(shownState.variables)
    .sort(([left], [right]) => left.localeCompare(right, 'ro'))
    .slice(0, 3);
  const changedVariables = new Set(
    shownState.trace.at(-1)?.variableChanges.map((change) => change.name) ?? [],
  );

  return (
    <div className="app-shell">
      <Header
        page={page}
        onNavigate={(next) => {
          setIsPlaying(false);
          setAnnouncement('');
          setPage(next);
          if (next === 'workspace') {
            window.requestAnimationFrame(() =>
              document.querySelector<HTMLElement>('#editor-title')?.focus(),
            );
          }
        }}
      />
      {page === 'docs' ? (
        <Suspense fallback={<div className="page-loading">Se incarca documentatia...</div>}>
          <DocsPage />
        </Suspense>
      ) : (
        <main className="workspace">
          <header className="workspace-intro">
            <div className="workspace-intro__copy">
              {/* <h1 id="workspace-title" lang="en" tabIndex={-1}>
                Working space
              </h1> */}
            </div>
            <label className="program-picker">
              <span>Programe sablon</span>
              <select
                className="program-select"
                value={selectedExample}
                onChange={(event) => loadExample(event.target.value)}
              >
                <option value="custom" disabled>
                  Program personalizat
                </option>
                {examples.map((example) => (
                  <option key={example.id} value={example.id}>
                    {example.name}
                  </option>
                ))}
              </select>
            </label>
          </header>
          <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {announcement}
          </div>

          <section className="studio-shell" aria-label="Spatiu de executie">
            <div className="command-bar">
              <Controls
                canExecute={canExecute}
                isPlaying={isPlaying}
                state={machineState}
                stepButtonRef={stepButtonRef}
                onPause={() => {
                  setIsPlaying(false);
                  setAnnouncement('Executia a fost pusa pe pauza.');
                }}
                onReset={() => {
                  if (interpreter !== undefined) {
                    setPendingInput('');
                    setAppendedInputCount(0);
                    updateSession(interpreter.reset(input));
                    setAnnouncement('Executia a fost resetata la starea initiala.');
                  }
                }}
                onRun={() => {
                  setAnnouncement('Executia a pornit.');
                  setIsPlaying(true);
                }}
                onStep={() => {
                  if (interpreter !== undefined) {
                    const next = interpreter.step();
                    updateSession(next);
                    setAnnouncement(describeMachineState(next));
                  }
                }}
                onStepBack={() => {
                  if (interpreter !== undefined) {
                    const next = interpreter.stepBack();
                    updateSession(next);
                    setAnnouncement(
                      `Inapoi: starea anterioara a fost restaurata; ${next.stepsExecuted} pasi executati raman.`,
                    );
                  }
                }}
              />
              <div className="mobile-variable-summary" role="group" aria-label="Rezumat variabile">
                <span className="mobile-variable-summary__label">Variabile</span>
                {variableSummary.length === 0 ? (
                  <span className="mobile-variable-summary__empty">nicio valoare</span>
                ) : (
                  variableSummary.map(([name, value]) => (
                    <code
                      key={name}
                      className={changedVariables.has(name) ? 'is-changed' : undefined}
                    >
                      {changedVariables.has(name) ? (
                        <span className="mobile-variable-summary__change" aria-hidden="true">
                          ●
                        </span>
                      ) : null}
                      {name} = {formatRuntimeValue(value)}
                      {changedVariables.has(name) ? (
                        <span className="visually-hidden">, modificata</span>
                      ) : null}
                    </code>
                  ))
                )}
                {Object.keys(shownState.variables).length <= 3 ? null : (
                  <span className="mobile-variable-summary__more">
                    +{Object.keys(shownState.variables).length - 3}
                  </span>
                )}
              </div>
            </div>

            {firstDiagnostic === undefined && inputResult.diagnostics.length === 0 ? null : (
              <div className="diagnostic-banner" role="alert">
                <strong>Executie blocata.</strong>
                <span>
                  {firstDiagnostic === undefined
                    ? inputResult.diagnostics[0]?.message
                    : `Linia ${firstDiagnostic.span.start.line}, coloana ${firstDiagnostic.span.start.column}: ${firstDiagnostic.message}`}
                </span>
              </div>
            )}
            {machineState?.error === undefined &&
            machineState?.limit === undefined &&
            machineState?.waitingForInput === undefined ? null : (
              <div
                className={`runtime-banner runtime-banner--${machineState.error === undefined ? 'warning' : 'error'}`}
              >
                {machineState.error?.message ??
                  machineState.limit?.message ??
                  `Mai sunt necesare ${machineState.waitingForInput?.required ?? 0} valori; disponibile: ${machineState.waitingForInput?.available ?? 0}.`}
              </div>
            )}

            <div className="workbench" data-editor-mode={editorMode}>
              <section className="panel editor-panel" aria-labelledby="editor-title">
                <div className="panel-header">
                  <div>
                    <h2 id="editor-title" tabIndex={-1}>
                      Program
                    </h2>
                    <span className="panel-header__meta">
                      {source.split('\n').length} linii ·{' '}
                      {parseResult.ok ? 'AST valid' : 'AST invalid'}
                    </span>
                  </div>
                  <div className="view-switch" role="group" aria-label="Reprezentarea programului">
                    <button
                      type="button"
                      aria-pressed={editorMode === 'source'}
                      onClick={() => setEditorMode('source')}
                    >
                      Sursa
                    </button>
                    <button
                      type="button"
                      aria-pressed={editorMode === 'exam'}
                      onClick={() => setEditorMode('exam')}
                    >
                      Format BAC
                    </button>
                  </div>
                </div>
                <div className="editor-panel__body">
                  <div className="editor-mode-pane" hidden={editorMode !== 'source'}>
                    <Suspense
                      fallback={<div className="editor-loading">Se incarca editorul...</div>}
                    >
                      <CodeEditor
                        diagnostics={editorDiagnostics}
                        onChange={editSource}
                        value={source}
                        {...(activeSpan === undefined ? {} : { activeSpan })}
                      />
                    </Suspense>
                  </div>
                  <div className="editor-mode-pane" hidden={editorMode !== 'exam'}>
                    <ExamPreview
                      program={parseResult.program}
                      source={source}
                      tokens={parseResult.tokens}
                      onMoveCloser={(closeLine, targetBoundary) =>
                        editSource(moveCloserLine(source, closeLine, targetBoundary))
                      }
                      {...(activeSpan === undefined ? {} : { activeSpan })}
                    />
                  </div>
                </div>
              </section>

              <div className="inspector">
                <section className="panel input-panel" aria-labelledby="input-title">
                  <div className="panel-header">
                    <h2 id="input-title" lang="en">
                      Input
                    </h2>
                    <span className="panel-header__meta">
                      {shownState.input.position}/{shownState.input.length} citite
                    </span>
                  </div>
                  <textarea
                    className="input-editor"
                    aria-label="Valori de intrare"
                    aria-describedby="input-lock-hint"
                    spellCheck={false}
                    readOnly={inputLocked}
                    value={input}
                    onChange={(event) => {
                      setIsPlaying(false);
                      setInput(event.target.value);
                      setPendingInput('');
                      setAppendedInputCount(0);
                      setSession(undefined);
                      setAnnouncement('');
                    }}
                  />
                  <div className="input-footer">
                    <span id="input-lock-hint">
                      {inputLocked
                        ? 'Apasa Reset pentru a modifica valorile'
                        : 'Separa valorile cu Enter, spatiu sau virgula'}
                    </span>
                  </div>
                  {machineState?.status !== 'waiting-input' ? null : (
                    <div className="input-append">
                      <label htmlFor="additional-input">Valori suplimentare</label>
                      <div className="input-append__controls">
                        <input
                          ref={additionalInputRef}
                          id="additional-input"
                          aria-describedby="additional-input-help"
                          value={pendingInput}
                          onChange={(event) => setPendingInput(event.target.value)}
                        />
                        <button
                          type="button"
                          className="quiet-button"
                          disabled={
                            pendingInputResult.values.length === 0 ||
                            pendingInputResult.diagnostics.length > 0
                          }
                          onClick={() => {
                            if (interpreter === undefined) return;
                            const next = interpreter.appendInput(pendingInput);
                            updateSession(next);
                            setAppendedInputCount(
                              (count) => count + pendingInputResult.values.length,
                            );
                            setPendingInput('');
                            setAnnouncement(
                              next.status === 'ready'
                                ? 'Input completat. Executia poate continua.'
                                : describeMachineState(next),
                            );
                            if (next.status === 'ready') {
                              window.requestAnimationFrame(() => stepButtonRef.current?.focus());
                            }
                          }}
                        >
                          Adauga
                        </button>
                      </div>
                      <span id="additional-input-help">
                        {pendingInputResult.diagnostics[0]?.message ??
                          `Necesare: ${machineState.waitingForInput?.required ?? 0}; disponibile: ${machineState.waitingForInput?.available ?? 0}.`}
                      </span>
                    </div>
                  )}
                </section>
                <Variables state={shownState} />
              </div>
            </div>

            <div className="bottom-grid">
              <section className="panel output-panel" aria-labelledby="output-title">
                <div className="panel-header">
                  <h2 id="output-title" lang="en">
                    Output
                  </h2>
                  <span className="panel-header__meta">{shownState.output.length} afisari</span>
                </div>
                <pre className="output-stream">
                  {shownState.renderedOutput.length === 0 ? (
                    <span className="output-placeholder">Niciun output.</span>
                  ) : (
                    shownState.renderedOutput
                  )}
                </pre>
              </section>
              <Trace trace={shownState.trace} />
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
