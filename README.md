# Grover

Grover is an interactive editor, interpreter, and reversible debugger for the Romanian
Baccalaureate pseudocode notation. The executable dialect is versioned as **BAC-RO 1** and uses
Romanian keywords without diacritics while accepting the accented forms found in official papers.

The project is deliberately browser-first: programs execute in the local deterministic runtime,
not through JavaScript `eval` or generated Pascal/C++ code.

## Workspace

```text
apps/web/                 React application, editor, debugger, and Romanian documentation
packages/language/        Normalization, lexer, parser, AST, diagnostics, and formatter
packages/runtime/         Tagged values, interpreter, input tape, trace, and reversible state
docs/                     Architecture and language decisions
```

## Requirements

- Node.js 24 LTS or newer
- npm 11 or newer

## Commands

```bash
npm install
npm run dev
npm run test
npm run test:coverage
npm run typecheck
npm run lint
npm run build
npm run check
```

`npm run check` is the complete local quality gate: formatting, linting, strict type checking,
coverage-enforced tests, and the production build. The global floor is 85% for statements/lines,
75% for branches, and 87% for functions.

## Current language scope

BAC-RO 1 includes scalar values, assignment, input/output, expressions, `daca`, `cat timp`,
`repeta`, and `pentru`. Arrays and matrices are intentionally reserved for the next language
version so that index bounds, index base, input syntax, and debugger presentation can be specified
as one coherent feature.

See the in-application **Documentatie** page for the student-facing reference and
[`docs/language-spec.md`](docs/language-spec.md) for the executable contract. The package boundaries
and implementation invariants are documented in [`docs/architecture.md`](docs/architecture.md).
The interface principles, visual tokens, and research references are recorded in
[`docs/design-system.md`](docs/design-system.md).
