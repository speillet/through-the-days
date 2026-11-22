# Writing workspace

The first workspace is a quiet Mac journal. The page of writing is the focal point; check-in answers sit beside it and can be skipped or hidden.

Palette: Paper `#F9FAFC`, Mist `#EDF0F6`, Ink `#25314A`, Iris `#5755A4`, Sage `#38775E`, Slate `#657086`. Dark mode uses deep blue paper with light ink. Muted text uses `#5A6478` in light mode, which keeps WCAG AA contrast on every light surface; Slate remains the muted text in dark mode. Emotion accents are secondary to explicit English labels and values.

Typography: the local macOS system font for navigation and controls; Charter with Georgia fallback for writing and the date heading. No network fonts or assets. Left-aligned text, a writing measure near 65 characters, comfortable paragraph spacing. Type sizes are rem-based, so the Text size setting (100, 115, 130 or 150%) scales every text without changing layout spacing.

Layout: a narrow collapsible navigation rail, a date/slot header, and a broad writing page with a skippable check-in at the side. At smaller widths the check-in flows above the page. Focus mode leaves the writing and save status visible.

```text
Navigation | Date, Morning / Evening       Save state
           | Optional check-in | Journal page
           |                   | Your own words
```

The initial design review removed dashboard tiles and decorative progress indicators: neither helps this personal writing task. The distinctive element is the spacious journal page and its date, with a restrained iris bookmark, which the app icon repeats: a paper page with an iris bookmark on ink. There are no streaks, obligatory scores, or scores inferred from colour. Keyboard focus is visible; reduced motion disables nonessential transitions.

Tiptap uses `useEditor` with `EditorContent`: the editor lives in one component, so a shared composable context adds no value. JSON is canonical; Markdown is a read-only projection for review/copying.

Verification boundaries follow the approved OpenSpec design: the public Rust journal interface against temporary SQLite stores, and the renderer's public writing/save/navigation controls. Native macOS verification covers the window, keyboard and assistive technology that browser checks cannot establish.
