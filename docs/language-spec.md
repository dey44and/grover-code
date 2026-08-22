# BAC-RO 1 Language Contract

Status: implemented dialect contract. This document specifies the behavior owned by the project;
official Romanian sources specify conventions and exam scope, but do not define a complete grammar
or runtime.

## Source model

- Source positions use UTF-16 offsets, one-based lines and one-based columns. Spans are half-open.
- Keywords are case-insensitive and Romanian diacritics are folded for recognition. Identifiers retain
  their spelling and are case-sensitive.
- The canonical formatter emits ASCII keywords and operators.
- Newlines and `;` delimit statements. `//` starts a comment ending at the physical line boundary.
- Assignment aliases `←`, `⟵`, and `:=` normalize to `<-`. Mathematical comparison and arithmetic
  glyphs normalize to their ASCII equivalents.

## Core grammar

The notation below is descriptive EBNF. Parser recovery nodes and diagnostics are intentionally not
part of the executable grammar.

```ebnf
program         = { separator | statement } EOF ;
separator       = NEWLINE | ";" ;

statement       = read | write | assignment | if | while | repeat | for | comment ;
read            = "citeste" identifier { "," identifier } [ annotation ] ;
write           = "scrie" expression { "," expression } ;
assignment      = identifier "<-" expression ;
if              = "daca" expression "atunci" statement-list
                  [ "altfel" statement-list ] "sfarsit" "daca" ;
while           = "cat" "timp" expression "executa" statement-list
                  "sfarsit" "cat" "timp" ;
repeat          = "repeta" statement-list "pana" "cand" expression ;
for             = "pentru" identifier "<-" expression "," expression
                  [ ( "," [ "pas" ] expression ) | ( "pas" expression ) ]
                  "executa" statement-list
                  "sfarsit" "pentru" ;

expression      = or-expression ;
or-expression   = and-expression { "sau" and-expression } ;
and-expression  = not-expression { "si" not-expression } ;
not-expression  = [ "nu" not-expression ] comparison ;
comparison      = additive [ comparison-op additive ] ;
additive        = multiplicative { ( "+" | "-" ) multiplicative } ;
multiplicative  = arithmetic-unary { ( "*" | "/" | "%" ) arithmetic-unary } ;
arithmetic-unary= ( "+" | "-" ) arithmetic-unary | power ;
power           = primary [ "^" arithmetic-unary ] ;
primary         = literal | identifier | "(" expression ")" | "[" expression "]" ;
```

Power is right-associative. Chained comparisons are rejected as ambiguous; write them explicitly
with `si`. The brackets in `[expression]` are an integer-part expression, not array indexing in
BAC-RO 1.

## Values and operations

The runtime uses tagged `integer`, `real`, `boolean`, and `string` values. Integers use arbitrary
precision within the configured resource limit; reals use finite IEEE-754 binary64 values. No
variable is implicitly initialized.

- Integer arithmetic preserves the integer type for `+`, `-`, and `*`.
- `/` always produces a real and rejects a zero divisor.
- `%` accepts integers and follows truncated-division remainder semantics. The official convention
  does not define negative operands; programs intended for direct exam portability should use
  naturals here.
- `[real]` returns the mathematical floor. `[integer]` returns the same integer.
- Numeric equality is exact across integer and real tags when the real is an exactly integral
  binary64 value. Ordering mixed huge integers and reals does not coerce the integer to a lossy
  JavaScript number.
- `si` and `sau` short-circuit. Conditions require a boolean value; numeric truthiness does not exist.

## Control-flow semantics

- `daca` evaluates its condition once and executes one branch.
- `cat timp` tests before each iteration.
- `repeta` executes its body before testing and terminates when its condition is true.
- `pentru` evaluates start, inclusive end, and step once on entry. The default step is `1`; a zero
  step is an error. A positive step uses `<=`, and a negative step uses `>=`.

Each assignment, atomic read, write, and condition evaluation is one pedagogical debugger step.
Internal jumps are not visible in the execution trace.

## Input, output, and failures

Input values are separated by whitespace, comma, or semicolon. Quoted strings preserve separators
and support JSON-compatible escapes (`\b`, `\f`, `\n`, `\r`, `\t`, `\uXXXX`, escaped quotes, and
escaped backslashes). Bare values are classified as integer, real, boolean, then string. A
multi-target read either consumes every requested value or waits without changing state.

Within one `scrie`, rendered values are separated by one space. Distinct `scrie` instructions are
concatenated directly: the runtime inserts neither a newline nor any other separator between them.
A program that needs a line break must write it explicitly, for example with `scrie "\n"`. Each
`scrie` still remains a distinct debugger step and output event.

Execution failures are typed and source-located. A failed step is transactional: variables, input,
output, loop state, and trace remain as they were before the step. Resource exhaustion enters a
recoverable `limit` state rather than becoming a generic runtime error.

Default safeguards are 100,000 semantic steps, 512 syntax nodes per expression, 65,536 bits per
integer, 1,000,000 UTF-16 code units per string, and 1,000,000 rendered output code units. The
parser also bounds recursive expression and control-block nesting before building executable trees.
Embedders may lower the runtime value/output limits.

## Exam projection

The textual closers are semantic syntax. The exam view derives solid `┌`, `│`, and `└` rails from
the same block tree. `daca`, `cat timp`, and `pentru` use a filled-square terminator; `repeta` renders
its final condition instead. Pixel positions never carry program meaning.

Arrays, matrices, subprograms, files, records, and recursion are outside BAC-RO 1. Their absence is a
version boundary, not an assertion that they are outside the complete Informatics exam syllabus.
