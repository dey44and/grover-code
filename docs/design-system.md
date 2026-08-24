# Interface design system

## Intent

Grover uses one dark technical shell for both the debugger and the language manual. The interface
is flat, dense, and predictable: navigation occupies the left rail, the primary task occupies the
center, and contextual state occupies the right. One-pixel dividers establish hierarchy; large
cards, decorative shadows, gradients, and display-serif typography are deliberately absent.

The BAC rail and filled terminator remain Grover's product mark. In the application header the
rail is rotated a quarter turn counter-clockwise and uses the documentation accent. Inside Format
BAC, the same geometry is rendered as functional exam notation rather than decoration.

## Reference and adaptation

The primary visual reference is the [Programming Languages Evolution
wiki](https://wiki.imindlabs.com.au/cs/lang/pl/5_lex_and_yacc/1_basics/), which is built with
[Astro Starlight](https://github.com/withastro/starlight). Grover recreates its dark palette,
system typography, navigation proportions, reading measure, active-link treatment, and responsive
information architecture with Grover-owned React markup and CSS. It does not reuse the reference
logo, course content, media, generated class names, or hosted assets.

The reference is useful because its visual grammar works equally well for long-form technical
material and an IDE-like tool. Grover maps that grammar to its own concepts:

- the documentation tree and example programs share the 300-pixel left rail;
- the article and source editor are the primary center surface;
- the page outline and runtime inspector are contextual right rails;
- the debugger toolbar uses the same compact control geometry as the reference search controls;
- source, BAC projection, input, variables, output, and trace remain connected by neutral rules.

## Foundations

### Color

The application uses the exact dark blue-gray family observed in the reference.

| Role                  | Value     | Use                                         |
| --------------------- | --------- | ------------------------------------------- |
| Content background    | `#17181C` | Article, runtime panels, input, trace       |
| Navigation background | `#24272F` | Header, left rails, panel headers           |
| Strong text           | `#FFFFFF` | Headings and primary panel labels           |
| Body text             | `#C0C2C7` | Paragraphs, controls, runtime values        |
| Muted text            | `#888B96` | Metadata, inactive links, empty states      |
| Boundary              | `#353841` | Dividers, fields, tables, code blocks       |
| Strong boundary       | `#545861` | Interactive control outlines                |
| Accent                | `#006CBA` | Strong actions and functional drop targets  |
| Accent high           | `#AECCEC` | Brand, links, selected navigation           |
| Accent low            | `#0C253D` | Selected-item ink and changed runtime state |

Semantic warning and error colors have independent dark surfaces and visible labels. Runtime state
never relies on hue alone.

The editor follows the reference code palette: `#D6DEEB` default text, `#C792EA` keywords,
`#ECC48D` strings, `#F78C6C` numbers, `#7FDBCA` operators, and `#919F9F` comments. The editor and
output use `#23262F`; the gutter is slightly darker so line numbers remain distinct.

### Typography

- Documentation, controls, tables, and headings use the native system sans stack.
- The Grover wordmark uses **Exo Variable 600**, bundled by Fontsource as a same-origin asset.
- Source, runtime values, input/output, and trace metadata use the native system monospace stack.
- Code ligatures are disabled so operators preserve their written form.

Body text is 16 pixels with a 1.75 line-height. Desktop documentation headings use 42 pixels for
`h1` and 35 pixels for `h2`; mobile headings use 35 and 29 pixels. Headings use weight 600 and the
same sans family as the body.

### Geometry

| Element                         | Dimension |
| ------------------------------- | --------- |
| Desktop application header      | 64 px     |
| Mobile application header       | 56 px     |
| Desktop left rail               | 300 px    |
| Article text measure            | 720 px    |
| Collapsed mobile/tablet TOC row | 48 px     |
| Tablet breakpoint               | 800 px    |
| Wide breakpoint                 | 1152 px   |

The documentation right rail grows from the remaining viewport width so the 720-pixel article is
positioned exactly as it is in the reference shell. Major surfaces have no outer radius or shadow.
Selected navigation and bounded code/callout surfaces use restrained four- to eight-pixel radii.

## Workspace hierarchy

```text
application header
  program rail | debugger workspace
                 debugger toolbar
                 source / BAC projection | input / variables
                 output                  | execution trace
```

The source remains the largest surface. Input and variables remain adjacent on wide screens;
output and execution trace stay visible in the lower dock. Switching between Source and Format
BAC does not unmount the editor, so selection and undo history are preserved. Source mode uses an
internally scrollable editor. Format BAC uses the rendered program's intrinsic height, allowing a
long algorithm to move the lower dock rather than being clipped.

On mobile, the program rail becomes a full-width disclosure, the debugger toolbar stays sticky,
and the panels form one vertical reading order: editor, input, variables, output, trace. Controls
remain horizontally scrollable at the narrowest supported widths.

## Documentation hierarchy

```text
application header
  section tree | 720 px article | reading gutter
```

The manual keeps Romanian content and unnumbered section titles. Its left tree groups concepts by
Introducere, Limbaj, Instrumente, and Extra, and provides intra-page navigation. Below 800 pixels
the tree becomes a full-width drawer. Print styles remove all application chrome and restore light
paper colors.

## Accessibility constraints

- Navigation exposes `aria-current` for both the active application page and active document
  section.
- Documentation navigation transfers focus to the selected heading after scrolling.
- Interactive controls grow to at least 44 pixels in the mobile debugger toolbar.
- Focus indicators remain visible on every dark surface.
- The debugger live region, waiting-input focus transfer, and post-input focus restoration are
  presentation-independent invariants.
- BAC drop targets remain at least 28 pixels high while the visible rule stays thin.
- Forced-colors, print, and reduced-motion modes have explicit fallbacks.
