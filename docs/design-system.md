# Interface design system

## Intent

Grover uses the **Data Atelier** visual system: an academic workbench that combines the precision
of a technical instrument with the calm of a printed study manual. The pale lilac canvas separates
the product from generic gray dashboards, while the connected editor, inspector, output, and trace
continue to read as one debugger.

The identity remains derived from the official BAC rail and filled terminator. In the application
header the rail is rotated a quarter turn counter-clockwise, uses the primary violet, and ends in a
small lilac square. These shapes are product signatures, not generic decoration, and must not
replace the exact black/dark BAC notation inside the exam preview.

## Reference synthesis

The implementation adapts interaction and composition patterns, not any product's identity,
source, assets, CSS, copy, or exact proportions.

The primary visual reference is [Boobook on
Awwwards](https://www.awwwards.com/sites/boobook), a data-strategy consultancy presented through
a clean, editorial interface. Its deep plum (`#190C39`) and lilac (`#BA9AFD`) relationship informs
Data Atelier's approachable technical character, and its display/body typography contrast informs
the separation between study-manual headings and application controls. Grover translates that
direction into its own accessible palette, compact debugger geometry, and BAC-specific identity;
it does not reproduce Boobook's layouts or assets.

The following products are secondary interaction and information-architecture references:

- [Python Tutor](https://pythontutor.com/visualize.html): explicit forward/back execution and
  source next to runtime state.
- [Thonny](https://thonny.org/): a deliberately small debugger surface, a stable Variables table,
  and a visible current expression.
- [Visual Studio Code debugger](https://code.visualstudio.com/docs/editor/debugging): related
  execution actions in one toolbar and state inspection beside the source.
- [MDN writing guidance](https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines):
  predictable reference anatomy, concise examples, and semantic document structure.
- [Diataxis](https://diataxis.fr/start-here/): navigation grouped by learning intent rather than a
  flat list of equally weighted pages.
- [WCAG 2.2 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) and
  [focus appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html): minimum
  interactive geometry and focus that remains visible against light and dark regions.

The resulting layout, BAC identity, Romanian labels, component geometry, and responsive behavior
are original to Grover.

## Foundations

### Color

| Role            | Value     | Use                                                     |
| --------------- | --------- | ------------------------------------------------------- |
| Canvas          | `#F1EFF7` | Application background and browser theme color          |
| Surface         | `#FCFBFF` | Workbench, panels, documentation paper                  |
| Ink             | `#21143A` | Primary text and the dark companion to focus indicators |
| Rule            | `#D6D0E0` | Decorative divisions and table rules                    |
| Strong boundary | `#82778F` | Form controls and interactive boundaries                |
| Primary         | `#5C3FA3` | Actions, links, active navigation, runtime rail         |
| Lilac           | `#BFA9FF` | Decorative markers and dark-editor syntax only          |
| Active          | `#FFE8A3` | Current instruction and changed values                  |
| Code            | `#211A2C` | Source editor, output, and code specimens               |

Muted text is `#625873` on light surfaces. Success (`#276447`), warning (`#76520A`), and danger
(`#9A3248`) are independent semantic roles. Color is never their only signal.

Rule and lilac are decorative colors, not default text colors. Primary text must not be placed on
lilac; use Ink instead. The dark code surface uses a separately tested syntax palette: lilac
keywords, `#ADA6B5` comments, `#F5A78E` numbers, Rule operators, and `#E6C76A` strings.

### Typography

- **Public Sans** is used for navigation, controls, panel labels, tables, and long-form body text.
- **Fraunces 600** is reserved for page and documentation headings. It is not used in buttons,
  runtime panels, or branding.
- **IBM Plex Mono** is used for source, runtime values, input/output, trace metadata, and exact
  language tokens. Code ligatures are disabled so operators retain their written form.

The fonts are bundled through Fontsource and emitted by Vite as same-origin, hashed assets. Grover
does not depend on a runtime font CDN. The two variable families are loaded once; IBM Plex Mono is
limited to the required normal weights and the comment italic.

### Surfaces and geometry

- The application canvas is pale lilac; major reading and working areas use the off-white Surface.
- The desktop workbench remains one connected instrument with a neutral one-pixel outline, a
  12-pixel outer radius, and a restrained plum-tinted shadow.
- Interior divisions use one-pixel rules. Form controls use the stronger boundary token.
- Controls use a seven- or eight-pixel radius. The documentation paper uses a 16-pixel radius;
  code specimens use ten pixels.
- Shadows establish the two major layers only: workbench/document paper over the canvas. They are
  not applied independently to every runtime panel.

## Workspace hierarchy

```text
application header
  workspace context + example selector
  connected workbench
    debugger toolbar
    source / BAC projection | input / variables
    output                  | execution trace
```

The source remains the largest region. Runtime state is adjacent rather than overlaid. Output and
trace stay visible in a lower dock. Changing between Source and Format BAC never unmounts the
editor, so selection and undo history are preserved. Source mode keeps a viewport-sized, internally
scrollable editor. Format BAC instead uses the rendered program's intrinsic height, so the paper
projection grows with every line and moves the lower dock down rather than clipping the algorithm.
The source editor uses the Code surface; Format BAC deliberately returns to a light paper surface
to preserve the exam metaphor.

## Documentation hierarchy

The manual uses four navigation groups: Incepe, Limbaj, Instrumente, and Contract. On desktop the
TOC and article are separate light surfaces on the canvas. The article keeps a narrow reading
measure, unnumbered sections, labelled dark code specimens, and rule-based tables. On small
screens the TOC becomes a sticky disclosure instead of forcing every link above the content. Print
styles remove application chrome, shadows, and surface framing.

## Accessibility constraints

- Interactive controls keep visible text on narrow screens and grow to 44 pixels in the mobile
  toolbar.
- Focus uses a gold perimeter plus an Ink companion edge; neither light nor dark surfaces may
  suppress one half of the indicator.
- The debugger live region, waiting-input focus transfer, and post-input focus restoration are
  presentation-independent invariants.
- BAC drop targets remain at least 28 pixels high while their visible rule stays thin.
- Runtime state never relies on hue alone: labels, dots, table markers, and banners remain present.
- Forced-colors, print, and reduced-motion modes receive explicit fallbacks.
