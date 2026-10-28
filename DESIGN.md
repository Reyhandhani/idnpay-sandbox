# Design direction

Direction for the dashboard in `public/`. This is a tool, not a landing page, so the job is to make the state of a transaction readable at a glance.

## Identity

A form you would fill at a bank counter: paper, ink, straight rules, nothing floating. It matches the product (payments) and stays out of the way of the data.

Reading this as: internal developer console for engineers testing payment flows, in a utilitarian Swiss style, dial ENERGY 1 / RHYTHM 2 / MOTION 1.

## Dials

| Dial   | Value | Reason                                                                                                         |
| ------ | ----- | -------------------------------------------------------------------------------------------------------------- |
| ENERGY | 1     | A console should not greet you. The data is the focus.                                                         |
| RHYTHM | 2     | Sections share one grid, but forms and the table differ in composition so the page does not read as one strip. |
| MOTION | 1     | Hover and focus states only. Nothing animates on load.                                                         |

## Color

Two neutrals plus one accent.

- Paper `#f4f4f0` and ink `#111110` carry everything. A warm paper tone reduces glare compared with pure white and reads as a printed form.
- Accent green `#14663f` marks payment success, links, and focus. It appears only where state or action matters, never as decoration.
- Status colors are semantic and separate from the accent: amber for pending, green for paid, red for failed and expired. Every status also carries its word, so color is never the only signal.
- Control borders use `#7a7a72`, which reaches 3.9:1 against the paper. The lighter `#d6d6cf` is used only for table rules, where a boundary is not required to identify a control.

## Typography

- System UI stack. No web font, because the tool must work offline and start instantly.
- Monospace for identifiers and amounts, because aligned digits make a column of numbers scannable.
- Sentence case everywhere. No wide-tracked uppercase labels: they read as decoration and slow reading.

## Shape and depth

- Zero border radius. The form metaphor is rectangular, and a single radius value avoids the pill default.
- No shadows and no glow. Nothing floats, so elevation never has to be explained.
- One-pixel rules separate sections instead of cards, so the page reads as one document.

## Theme

Light by default, with a manual dark toggle kept in local storage. The first visit follows the operating system preference.
