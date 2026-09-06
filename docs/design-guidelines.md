# GodDaeHee Hub — Page View UI guidelines

Design intent: reading a long Claude conversation must feel like turning pages, not like
falling down a scroll.

These rules govern the `extension/` surface. They are written to be checked, not admired:
every accessibility rule below names the artifact it is verified against.

---

## 1. Context and goals

- **Product**: GodDaeHee Hub Page View, a Chrome extension that re-groups the claude.ai
  conversation stream into fixed-size pages.
- **Surface**: an overlay on a third-party content site. The extension owns its toolbar
  completely and owns *nothing* else on the page.
- **Audience**: readers and knowledge seekers working through long conversations.
- **Goals**
  1. A reader must always know where they are (`3 / 12`) and be able to move one page,
     jump to an end, or type a page number.
  2. The host page must be returned to its original state the moment the extension is
     switched off. No leftover attributes, no leftover nodes.
  3. The overlay must never become the reason a reader cannot reach content: browser find,
     printing, and screen readers must have a way to see everything.
- **Non-goals**: restyling Claude's own message bubbles, storing conversation content,
  or any network access. The extension declares `storage` and nothing else.

> **Brand-context caveat.** The upstream extraction flagged low confidence on audience and
> product surface. The audience and surface statements above are taken from that extraction
> and should be re-confirmed with the brand owner before they are reused elsewhere.

### Host surface density (reference)

The reference page composition for this brand is: links 31, buttons 13, cards 12,
navigation 3, lists 3, inputs 1. The extension adds **1 navigation landmark, 7 buttons,
1 number input, and 1 select** on top of that. Because navigation regions are already
present on the host page, the toolbar's `<nav>` **must** carry a unique `aria-label`
(`대화 페이지 이동`) so the landmark list stays unambiguous.

---

## 2. Design tokens and foundations

Tokens live in `extension/src/content/tokens.css` in two layers.

### 2.1 Primitive layer

Foundation values, copied verbatim from the design system: `font.*`, `color.*`, `space.*`,
`radius.*`, `shadow.*`, `motion.*`. Primitives **must not** be edited to fix a component;
they are the contract with the rest of the system. All names are prefixed `--gdh-` so they
cannot collide with host-page variables.

One approved extension exists: `--gdh-font-weight-strong: 600`, because the foundation
supplies only `font.weight.base` and actionable labels need a second weight. Any further
addition **must** be raised as a foundation change, not added locally.

### 2.2 Semantic layer

Components **must** read semantic tokens only (`--gdh-accent`, `--gdh-text-muted`,
`--gdh-border-strong`, …). Components **must not** read primitives directly and **must not**
contain literal colour, spacing, or radius values. The single exception is a `var()`
fallback and 1px hairlines, which have no token.

Derived values use `color-mix(in oklab, …)` over primitives. Derivation is allowed only to
satisfy a stated contrast requirement, and each derived token **must** keep a comment saying
why. Two derivations are load-bearing:

| Derived token | Reason |
| --- | --- |
| `--gdh-accent` = `surface.raised` mixed 82% with `surface.base` | `#6366f1` with white text measures 4.46:1, below the 4.5:1 needed for the primary button label. Darkening the accent brings it to 6.88:1. |
| `--gdh-text-disabled`, `--gdh-border-strong` | Raise disabled labels and control outlines above 3:1 so state and boundaries stay perceivable. |

### 2.3 Colour-role mapping

The foundation palette is not a ready-made light theme: `color.surface.base` is `#000000`
while `color.text.primary` is `#171717`, so the two **must never** be paired. The mapping
below is the only sanctioned pairing set.

| Role | Light | Dark |
| --- | --- | --- |
| Toolbar surface | `surface.muted` | `surface.base` |
| Body text | `text.primary` | `surface.muted` |
| Secondary text | `text.secondary` | `surface.muted` mixed toward `surface.base` |
| Accent surface | derived from `surface.raised` | derived from `surface.raised` |
| Accent label | `surface.muted` | `surface.base` |

`color.text.tertiary` (L\* 7.8) and `color.text.inverse` (L\* 48) are unused here: neither
reaches 4.5:1 against the dark surface, and using them for body text would fail 1.4.3.

### 2.4 Theme selection

The toolbar palette **must** follow the page it sits on, not the operating system, because
Claude's theme switch is independent of `prefers-color-scheme`. The controller resolves the
host page's background colour through a 1×1 canvas (so `lab()`, `oklch()`, and `color-mix()`
backgrounds all resolve), computes relative luminance, and sets `data-gdh-theme` on both the
document element and the toolbar host. `prefers-color-scheme` remains as the pre-script
default. Both palettes are declared from a single list in `tokens.css`; the two blocks
**must** stay identical.

### 2.5 Measured contrast

Measured in Chromium at the default page size, on the fixture page, in both schemes
(`node test/pager.test.mjs` covers behaviour; contrast was measured with the same harness):

| Pair | Light | Dark | Requirement |
| --- | --- | --- | --- |
| Ghost button label / toolbar | 17.9 | 21.0 | ≥ 4.5 |
| Primary button label / primary surface | 6.9 | 8.2 | ≥ 4.5 |
| Page total, field label / toolbar | 7.6 | 9.1 | ≥ 4.5 |
| Page caption text / caption surface | 7.2 | 9.0 | ≥ 4.5 |
| Toolbar border / page background | 3.1 | 4.9 | ≥ 3 |
| Input border / toolbar | 3.1 | 4.3 | ≥ 3 |
| Focus ring / toolbar | 12.2 | 12.4 | ≥ 3 |
| Disabled label / toolbar | 3.6 | 3.8 | exempt, kept ≥ 3 |

Any token change **must** be re-measured against this table before it ships.

---

## 3. Component rules

### 3.1 Pager toolbar

**Anatomy** (in DOM order)

1. `nav.pager` — the landmark. Carries `aria-label`, `data-state`, `data-collapsed`.
2. `.pager__collapsible` — first, previous, page field, next, last, divider, size label,
   size select, show-all toggle, off.
3. `.pager__summary` — `3 / 12`, shown only while collapsed.
4. `[data-act="collapse"]` — collapse/expand toggle, always visible.
5. `.pager__message` — the loading / empty / error row, with an optional retry button.
6. `.pager__live` — visually hidden `role="status"` region.

**Variants**

| Variant | Use |
| --- | --- |
| `.pager__btn` (ghost) | Every secondary move: first, previous, last, show all, collapse, off. |
| `.pager__btn--primary` | Next only. Exactly one primary action **must** exist in the toolbar. |
| `.pager__btn--icon` | Square icon-only button; **must** carry `aria-label` and `title`. |
| `.pager--collapsed` | Density fallback; **must** keep the page position readable. |

**States** — every interactive element **must** define all seven:

| State | Rule |
| --- | --- |
| default | `--gdh-surface-toolbar`, `--gdh-border-strong`, `--gdh-text-strong`. |
| hover | `--gdh-surface-hover` (primary: `--gdh-accent-hover`). Pointer only; **must not** be the sole carrier of any information. |
| focus-visible | 2px `--gdh-focus-ring` outline, 2px offset. **Must never** be removed or replaced by a background change. |
| active | `--gdh-surface-active` (primary: `--gdh-accent-active`). |
| disabled | Native `disabled`, `--gdh-text-disabled`, `cursor: not-allowed`. Edge buttons are disabled at the first and last page; every control except show-all and collapse is disabled while `data-state` is not `ready`. |
| loading | `data-state="loading"`, `aria-busy="true"`, spinner plus the sentence "대화 구조를 확인하는 중입니다." Motion **must** stop under `prefers-reduced-motion`. |
| error | `data-state="error"`, a bordered message row, an explicit cause, and a `다시 찾기` button. Error **must not** be signalled by colour alone — it carries an icon and a sentence. |

The toggle state of show-all **must** be exposed with `aria-pressed`, and its accessible name
**must** flip between `전체 보기 켜기` and `전체 보기 끄기`.

**Responsive behaviour**

- ≥ 601px: floating pill, max width `min(92vw, 720px)`, position from settings
  (bottom-right default, plus bottom-center, top-right, top-center).
- ≤ 600px: the toolbar spans the viewport gutters, centres its controls, and hides the
  `페이지` / `묶음 크기` text labels — which are then carried by the controls' `aria-label`
  and associated `<label>` elements, so nothing is lost to assistive technology.
- The toolbar **must** wrap rather than clip; the message row occupies its own line.

**Pointer, keyboard, touch**

- Every control **must** be at least 44×44 CSS px (`--gdh-control-size`), touch targets included.
- Controls **must** be reachable in DOM order with `Tab`. The toolbar deliberately uses
  `<nav>` with plain tab order rather than `role="toolbar"`; a toolbar role implies roving
  tabindex, which conflicts with the arrow-key behaviour of the number input inside it.
- `Esc` inside the toolbar collapses it.
- Global shortcuts: `Alt+Shift+←/→` for previous/next, `Alt+Shift+Home/End` for first/last.
  They **must** be ignored while focus is in a text field or contenteditable, and while an
  IME composition is active (`event.isComposing`, `keyCode === 229`).
- `touch-action: manipulation` and a transparent tap highlight **must** stay set so taps do
  not double-fire or flash the host page's highlight colour.

**Long content, overflow, empty states**

- A single turn longer than the viewport **must** stay scrollable inside the host page's own
  scroller; pagination never clips a turn.
- A conversation with no turns **must** render `data-state="empty"` with the sentence
  "페이지로 나눌 대화가 아직 없습니다." — an empty conversation is not an error.
- When the adapter cannot find a conversation region within 20 seconds, the toolbar
  **must** enter `error`, not stay in `loading`.
- The turn list **must** be re-read when the host page adds or removes turns, and the reader
  **must not** be moved off the page they are on. Following the newest turn is allowed only
  when they were already on the last page and `followLatest` is on.

### 3.2 Page caption (`::before` on the page's first turn)

- Renders `3 / 12 페이지 · 메시지 13–18` above the first turn of the current page.
- **Must** be generated content, never an injected element, so the host page's own layout
  and React reconciliation are untouched.
- **Must** be suppressed in print, and **must** be switchable off in settings.

### 3.3 Options form

- Every control **must** have a visible `<label>` bound with `for`, plus help text bound
  through `aria-describedby`.
- The selector field **must** validate on input, expose `aria-invalid="true"`, and render an
  error row that names the expected format. It **must not** block typing.
- Saving is automatic and debounced; the result **must** be reported in a `role="status"`
  region ("저장 중…", "저장했습니다.", or the failure reason).
- The reset button **must** restore documented defaults and say so.

---

## 4. Accessibility requirements and acceptance criteria

Target: WCAG 2.2 AA.

| # | Criterion | Test | Pass |
| --- | --- | --- | --- |
| A1 | Text contrast (1.4.3) | Measure every pair in §2.5 in both themes | All ≥ 4.5:1 |
| A2 | Non-text contrast (1.4.11) | Measure control borders and the focus ring | All ≥ 3:1 |
| A3 | Keyboard operable (2.1.1) | `Tab` through the toolbar; operate every control with `Enter`/`Space`; type a page number and press `Enter` | Every action reachable without a pointer |
| A4 | No keyboard trap (2.1.2) | `Tab` past the last control | Focus leaves the toolbar |
| A5 | Focus visible (2.4.7) | `Tab` onto each control in both themes | 2px ring visible on every control, never clipped |
| A6 | Focus not obscured (2.4.11) | Move to a page whose first turn sits under the toolbar | `scroll-padding-block-end` keeps the focused turn clear |
| A7 | Status messages (4.1.3) | Change page with a screen reader running | "12페이지 중 3페이지, 메시지 13부터 18까지" announced without moving focus |
| A8 | Name, role, value (4.1.2) | Inspect the accessibility tree | `nav` has a unique label; icon buttons have names; show-all exposes `aria-pressed`; the page field is labelled and described by the total |
| A9 | Hidden content is really hidden | Read the page with a screen reader while paginated | Off-page turns are absent from the a11y tree and from tab order (`display: none`) |
| A10 | Content is always reachable | Turn on show all; print the page | All turns return, in both cases |
| A11 | Reduced motion (2.3.3) | Set `prefers-reduced-motion: reduce` | No spinner rotation, no smooth scroll, no button transitions |
| A12 | Forced colours | Turn on a forced-colours theme | Borders, text and focus ring follow the system palette |
| A13 | Target size (2.5.8) | Measure every control | ≥ 44×44 px |
| A14 | Input method | Type Korean into the composer while pressing shortcut modifiers | Shortcuts stay inert during IME composition |
| A15 | Reflow (1.4.10) | 320px-wide viewport at 400% zoom | Toolbar wraps, nothing is clipped, no horizontal scroll |

A1–A2 and A9–A10 are covered by the automated fixture run and the contrast measurement.
A3–A8 and A11–A15 are manual checks and **must** be repeated before each release.

---

## 5. Content and tone standards

Concise, confident, implementation-focused. Korean UI copy, sentence case, no exclamation
marks. Labels name the action or the object; they never name the mechanism.

| Do | Don't |
| --- | --- |
| `다음 페이지` | `>>` , `클릭` |
| `전체 보기 켜기` / `전체 보기 끄기` | `토글` |
| `페이지로 나눌 대화가 아직 없습니다.` | `데이터 없음` |
| `이 화면에서 대화 영역을 찾지 못했습니다. 설정에서 선택자를 지정하거나 다시 찾기를 눌러 주세요.` | `오류가 발생했습니다.` |
| `한 페이지에 넣을 메시지 수` | `pageSize` |
| `3 / 12 페이지 · 메시지 13–18` | `p.3/12 (13-18)` |

Rules

- Error copy **must** say what failed and what the reader can do next, in that order.
- Toggle labels **must** describe the effect of pressing, not the current state, and the
  current state **must** be carried by `aria-pressed`.
- Numbers **must** use tabular figures so the indicator does not jitter while paging.
- Copy **must not** address the reader's competence ("잘못 누르셨습니다") or apologise.

---

## 6. Anti-patterns and prohibited implementations

- **Prohibited**: removing or restyling host-page nodes beyond the `data-gdh-pager-*`
  attributes this extension owns. Layout must survive the host page's own re-renders.
- **Prohibited**: `visibility: hidden`, `opacity: 0`, `height: 0`, or off-screen positioning
  to hide off-page turns. They stay in the tab order and in the accessibility tree.
  `display: none` is the only sanctioned mechanism.
- **Prohibited**: `innerHTML` for toolbar construction. The host page may enforce Trusted
  Types, and string-built markup would break there.
- **Prohibited**: styling the toolbar from the document stylesheet. Everything except the
  `data-gdh-pager-*` rules in `page.css` lives in the shadow root.
- **Prohibited**: raw hex, px, or ms values in component CSS; one-off spacing or type sizes;
  a second primary button; hover-only affordances; colour as the only carrier of state.
- **Prohibited**: focus rings removed, replaced by a shadow, or dependent on a background
  change; `outline: none` without a same-element replacement.
- **Anti-pattern**: re-running detection on a timer after it has succeeded. This shipped as a
  bug during development — a `setInterval` armed after a synchronous success kept re-adopting
  the DOM and threw the reader back to the last page every 400 ms. Detection now polls only
  while it is unsettled.
- **Anti-pattern**: announcing every re-index. The live region fires on reader-initiated page
  changes only; streaming updates **must not** speak.
- **Anti-pattern**: hard-coding one selector for the host page. Selector candidates are
  scored at runtime and overridable in settings.

### Migration notes

- Consumers moving onto this token set from raw values **must** re-map
  `color.surface.base` → toolbar surface only in dark contexts, and **must not** pair it with
  `color.text.primary`.
- `--gdh-accent` is not `#6366f1`. Anything relying on the exact brand indigo for a *text*
  background **must** move to the derived token or state a large-text exemption.
- `radius.lg` (`16777200px`) is a pill radius, not a value to interpolate; use it only on
  fully rounded controls.

---

## 7. QA checklist

Structure and behaviour

- [ ] Toolbar appears on `https://claude.ai/*` within a few seconds of a conversation loading.
- [ ] Page indicator matches the visible turns; totals recompute when the size changes.
- [ ] First / previous / next / last, page entry, and clamping of out-of-range numbers.
- [ ] A streaming reply keeps the reader on the last page only when they were already there.
- [ ] Reading page 1 while replies arrive does not move the reader.
- [ ] Switching conversations restarts at that conversation's newest page.
- [ ] Empty conversation shows the empty state, not an error.
- [ ] Show all reveals everything and disables navigation; turning it off restores the page.
- [ ] Collapse keeps the page indicator readable; `Esc` collapses.
- [ ] Turning the extension off removes the toolbar and every `data-gdh-*` attribute.

Design system

- [ ] No literal colour, spacing, radius, or duration in component CSS.
- [ ] All seven states present on every interactive element.
- [ ] Contrast table in §2.5 re-measured after any token change.
- [ ] Light and dark verified against the *page* background, not just the OS setting.
- [ ] Forced-colours mode verified.

Accessibility

- [ ] A1–A15 in §4 executed; manual rows re-run for this release.
- [ ] Screen-reader pass: page change announced, off-page turns absent, icon buttons named.
- [ ] Keyboard-only pass: every action reachable, focus always visible, no trap.
- [ ] Korean IME pass: shortcuts inert while composing.

Regression

- [ ] `node test/pager.test.mjs` passes (36 checks).
- [ ] No uncaught page errors during the run.
- [ ] Selector candidates re-confirmed against the current claude.ai markup.
