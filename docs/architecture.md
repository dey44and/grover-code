# Architecture

## Design objective

Grover must make a paper-oriented pseudocode notation executable without teaching accidental
JavaScript, C++, or Pascal semantics. The system therefore owns a small language specification and
a deterministic runtime. Visual BAC rails are a projection of semantic blocks; they are never
stored as pixel coordinates.

```text
source
  -> normalization / lexer / parser
  -> immutable AST with source spans and stable node ids
       -> canonical formatter
       -> exam-layout projection
       -> interpreter control frames
            -> semantic execution events
            -> reversible machine history
```

## Package boundaries

### `@grover/language`

- Has no browser or React dependency.
- Normalizes Romanian Unicode variants and mathematical operator aliases.
- Produces diagnostics with exact source spans.
- Owns the AST and canonical printer.
- Does not evaluate expressions or attach host-language meaning to them.

### `@grover/runtime`

- Depends only on `@grover/language`.
- Uses tagged values; integers are represented by `bigint`.
- Never calls `eval`, `Function`, or a generated host-language program.
- Makes input position, output, user variables, control frames, and hidden loop values part of the
  machine state.
- Records a reversible transition for every pedagogical step.

### `@grover/web`

- Parses the current source and refuses to execute source with error diagnostics.
- Never silently executes a previously valid AST after the editor becomes invalid.
- Maps runtime node ids/spans back to editor highlights.
- Derives exam rails and end markers from AST nesting.
- Keeps student-facing copy in Romanian, using established English technical terms where they are
  clearer (`runtime`, `debugger`, `step`, `trace`, `token`, `parser`).

## Runtime invariants

1. A step either commits completely or leaves the observable state unchanged.
2. `citeste a, b` consumes both values atomically or enters `waiting-input`.
3. `stepBack()` restores variables, input position, output, control state, status, and trace.
4. Repeated `step()` calls and `run()` produce identical final states for the same source/input.
5. A condition evaluation is observable even when its branch/body is not entered.
6. Execution limits terminate through a typed state rather than freezing the UI.
7. Internal control values never appear as student variables.

## Editor invariants

1. A rail corresponds to exactly one control AST node.
2. Drag targets snap to boundaries between complete statements.
3. A nested block moves as one subtree; ranges cannot cross.
4. `altfel` remains owned by its corresponding `daca`.
5. `repeta` ends with `pana cand`; other core blocks end with the filled square in exam view.
6. Structural edits are single undoable editor transactions.

## Extension boundary for arrays and matrices

Indexed values will add an l-value/r-value expression kind and a persistent aggregate runtime
value. Before that implementation begins, the language version must freeze:

- syntax for one- and two-dimensional access;
- index base and bounds;
- array creation and input conventions;
- assignment/copy semantics;
- trace deltas for individual cells;
- compact and expanded debugger presentations.

This boundary avoids baking a JavaScript-array model into a Romanian pseudocode dialect.
