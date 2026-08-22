import type { SourceSpan } from './ast.js';

export type DiagnosticSeverity = 'error' | 'warning';

/** A stable, machine-readable diagnostic accompanied by a Romanian explanation. */
export interface Diagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly span: SourceSpan;
  readonly hint?: string;
}

export const hasErrors = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === 'error');
