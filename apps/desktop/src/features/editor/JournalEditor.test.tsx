import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Editor, type JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canEditExactly } from './content';
import { countWords, journalExtensions, JOURNAL_MARK_TYPES, JOURNAL_NODE_TYPES } from './extensions';
import { JournalEditor, PROTECTED_DOCUMENT_MESSAGE } from './JournalEditor';
import { documentDepth, MAX_DOCUMENT_DEPTH } from './nesting';

const editors: Editor[] = [];

function headlessEditor(content: JSONContent | string = '') {
  const editor = new Editor({ extensions: journalExtensions('Write'), content });
  editors.push(editor);
  return editor;
}

function paragraph(text?: string): JSONContent {
  return text === undefined ? { type: 'paragraph' } : { type: 'paragraph', content: [{ type: 'text', text }] };
}

function doc(...content: JSONContent[]): JSONContent {
  return { type: 'doc', content };
}

/** A document as the editor schema represents it, so equal documents compare equal. */
function normalised(editor: Editor, json: JSONContent): JSONContent {
  return editor.schema.nodeFromJSON(json).toJSON() as JSONContent;
}

/** The document Tiptap's own Markdown parser reads back from the derived Markdown. */
function readBack(editor: Editor, markdown: string): JSONContent {
  const parsed = editor.markdown?.parse(markdown);
  if (!parsed) throw new Error('The Markdown extension is missing.');
  return normalised(editor, parsed);
}

/** jsdom has no ClipboardEvent; ProseMirror's paste helpers only need an event to pass on. */
function pasteEvent(): ClipboardEvent {
  return Object.assign(new Event('paste'), { clipboardData: null }) as unknown as ClipboardEvent;
}

/** A line that Markdown would read as a heading, list item, quote, rule or code block. */
const UNESCAPED_BLOCK_START = /^(?:#{1,6}(?:\s|$)|[-+*](?:\s|$)|\d{1,9}[.)](?:\s|$)|>|={1,}\s*$|-{3,}\s*$| {4}|\t)/;

function nodeAndMarkTypes(node: JSONContent, found = { nodes: new Set<string>(), marks: new Set<string>() }) {
  if (node.type) found.nodes.add(node.type);
  for (const mark of node.marks ?? []) found.marks.add(mark.type);
  for (const child of node.content ?? []) nodeAndMarkTypes(child, found);
  return found;
}

afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

describe('journal editor schema', () => {
  it('allows only the node and mark types the journal accepts', () => {
    const editor = headlessEditor();
    expect(Object.keys(editor.schema.nodes).sort()).toEqual([...JOURNAL_NODE_TYPES].sort());
    expect(Object.keys(editor.schema.marks).sort()).toEqual([...JOURNAL_MARK_TYPES].sort());
  });

  it('keeps the words but drops links, images and other unsupported content when pasting', () => {
    const editor = headlessEditor();
    editor.commands.insertContent(
      '<p>See <a href="https://example.invalid/page">this fictional page</a> <img src="photo.png" alt="x"> and <u>this</u>.</p>' +
        '<table><tr><td>Synthetic cell</td></tr></table><ul><li><input type="checkbox"> a task</li></ul>',
    );
    const document = editor.getJSON();
    const { nodes, marks } = nodeAndMarkTypes(document);
    for (const node of nodes) expect(JOURNAL_NODE_TYPES).toContain(node);
    for (const mark of marks) expect(JOURNAL_MARK_TYPES).toContain(mark);
    expect(editor.getText()).toContain('See this fictional page');
    expect(editor.getText()).toContain('Synthetic cell');
    expect(marks.has('underline')).toBe(true);
  });

  it('opens a stored document without changing it', () => {
    const stored: JSONContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Synthetic heading' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Une phrase fictive 🌿' }] },
      ],
    };
    const editor = headlessEditor(stored);
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Synthetic heading' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Une phrase fictive 🌿' }] },
      ],
    });
  });

  it('derives Markdown with headings, lists, quotes and emphasis from the document', () => {
    const editor = headlessEditor({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Synthetic day' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Plain, ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and ' },
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
          ],
        },
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }] }],
        },
        {
          type: 'orderedList',
          attrs: { start: 1 },
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] }],
        },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A fictional quote' }] }] },
      ],
    });
    const markdown = editor.getMarkdown();
    expect(markdown).toContain('## Synthetic day');
    expect(markdown).toContain('Plain, **bold** and *italic*');
    expect(markdown).toContain('- One');
    expect(markdown).toContain('1. First');
    expect(markdown).toContain('> A fictional quote');
  });

  it('keeps plain paragraphs that look like Markdown as plain text, without HTML entities', () => {
    const lines = ['# Monday', '- milk', '+ eggs', '1. call a friend', '> a quote', '    indented', 'Tom & Jerry <3', 'a > b'];
    const editor = headlessEditor(doc(...lines.map((line) => paragraph(line))));
    const markdown = editor.getMarkdown();
    for (const line of markdown.split('\n')) expect(line).not.toMatch(UNESCAPED_BLOCK_START);
    expect(markdown).toContain('Tom & Jerry <3');
    expect(markdown).toContain('a > b');
    expect(markdown).not.toMatch(/&amp;|&lt;|&gt;|&nbsp;/);
    expect(readBack(editor, markdown)).toEqual(editor.getJSON());
  });

  it('keeps pasted plain text that looks like Markdown as the same text in its Markdown', () => {
    const editor = headlessEditor();
    editor.view.pasteText('# Monday\n- milk\n1. call a friend\nTom & Jerry <3', pasteEvent());
    const document = editor.getJSON();
    expect(document.content?.map((block) => block.type)).toEqual(['paragraph', 'paragraph', 'paragraph', 'paragraph']);
    const markdown = editor.getMarkdown();
    expect(markdown).toBe('\\# Monday\n\n\\- milk\n\n1\\. call a friend\n\nTom & Jerry <3');
    expect(readBack(editor, markdown)).toEqual(document);
  });

  it('round-trips text, structure, line breaks and blank lines through its Markdown', () => {
    const stored = doc(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '  Issue #' }] },
      paragraph('a'),
      paragraph(),
      paragraph(),
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'line' },
          { type: 'hardBreak' },
          { type: 'text', text: '===' },
          { type: 'hardBreak' },
          { type: 'text', text: '- not a list' },
          { type: 'hardBreak' },
          { type: 'text', text: '--- | ---' },
        ],
      },
      paragraph('---'),
      paragraph('***'),
      paragraph('\tTabbed'),
      paragraph('\u00A0'),
      paragraph('&amp; &#32; &copy; <u>not markup</u> <3 a\\b [x]: /url ![x](y)'),
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [paragraph('- nested?'), paragraph('1. no')] }],
      },
      { type: 'blockquote', content: [paragraph('> deeper?'), paragraph(), paragraph('# h')] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '# bold', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' & ' },
          { type: 'text', text: 'a & <b>', marks: [{ type: 'code' }] },
        ],
      },
      { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: '# not a heading\n- or a list & <b>' }] },
      paragraph('end'),
    );
    const editor = headlessEditor(stored);
    const markdown = editor.getMarkdown();
    // Typed entity-like text is escaped (\\&amp;); nothing is turned into an entity.
    expect(markdown).not.toMatch(/(?<!\\)&(?:amp|lt|gt|nbsp);/);
    expect(readBack(editor, markdown)).toEqual(normalised(editor, stored));
  });

  it('writes each empty paragraph as one blank line', () => {
    const editor = headlessEditor(doc(paragraph('a'), paragraph(), paragraph(), paragraph('end')));
    expect(editor.getMarkdown()).toBe('a\n\n\n\n\n\nend');
    expect(readBack(editor, editor.getMarkdown())).toEqual(editor.getJSON());
  });

  it('counts words across any language and has no length limit', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  Synthetic   words\nhere  ')).toBe(3);
    // Deliberate multilingual synthetic fixture.
    expect(countWords('Une journée très calme 🌿')).toBe(5);
    const editor = headlessEditor();
    const long = 'mot '.repeat(50_000);
    editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: long }] }] });
    expect(editor.storage.characterCount.words()).toBe(50_000);
    expect(editor.getText()).toHaveLength(long.length);
  });
});

function nestedLists(levels: number, last: JSONContent[] = [paragraph(`Level ${levels}`)]): JSONContent {
  let list: JSONContent = { type: 'bulletList', content: [{ type: 'listItem', content: last }] };
  for (let level = levels - 1; level >= 1; level -= 1) {
    list = { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(`Level ${level}`), list] }] };
  }
  return list;
}

function nestedQuotes(levels: number): JSONContent {
  let quote: JSONContent = { type: 'blockquote', content: [paragraph()] };
  for (let level = 1; level < levels; level += 1) quote = { type: 'blockquote', content: [quote] };
  return quote;
}

/** Puts the caret at the end of the text block whose text is `text` (or in the deepest empty one). */
function placeCaret(editor: Editor, text: string | null) {
  let target = -1;
  editor.state.doc.descendants((node, position) => {
    if (node.isTextblock && (text === null ? node.content.size === 0 : node.textContent === text)) {
      target = position + 1 + node.content.size;
    }
  });
  if (target < 0) throw new Error(`No text block ${text ?? '(empty)'}.`);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, target)));
}

describe('journal document nesting limit', () => {
  it('matches the depth limit journal-core enforces', () => {
    const model = readFileSync(resolve(import.meta.dirname, '../../../../../crates/journal-core/src/model.rs'), 'utf8');
    expect(model).toContain(`const MAXIMUM_DOCUMENT_DEPTH: usize = ${MAX_DOCUMENT_DEPTH};`);
  });

  it('refuses to indent a list item or add a quote past the limit, while typing still works', () => {
    // 29 quote levels: text typed in the deepest paragraph is at level 32.
    const quoted = headlessEditor(doc(nestedQuotes(29)));
    placeCaret(quoted, null);
    quoted.commands.insertContent('Synthetic deepest words');
    expect(documentDepth(quoted.getJSON())).toBe(MAX_DOCUMENT_DEPTH);
    const deepest = quoted.getJSON();
    quoted.commands.wrapIn('blockquote');
    expect(quoted.getJSON()).toEqual(deepest);

    // 14 list levels: the deepest text is at level 31, and a 15th level would reach 33.
    const deepestList: JSONContent = {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [paragraph('First')] },
        { type: 'listItem', content: [paragraph('Second')] },
      ],
    };
    const listed = headlessEditor(doc(nestedLists(13, [paragraph('Level 13'), deepestList])));
    expect(documentDepth(listed.getJSON())).toBe(31);
    const flat = listed.getJSON();
    placeCaret(listed, 'Second');
    listed.commands.sinkListItem('listItem');
    expect(listed.getJSON()).toEqual(flat);
    listed.commands.insertContent(' still typed');
    expect(listed.getText()).toContain('Second still typed');
  });

  it('flattens deeper pasted lists and quotes, keeping every word within the limit', () => {
    const editor = headlessEditor();
    let list = '';
    for (let level = 40; level >= 1; level -= 1) list = `<ul><li><p>Level ${level}</p>${list}</li></ul>`;
    let quotes = '<p>Quote 70</p>';
    for (let level = 69; level >= 1; level -= 1) quotes = `<blockquote><p>Quote ${level}</p>${quotes}</blockquote>`;
    editor.view.pasteHTML(`${list}<blockquote>${quotes}</blockquote>`, pasteEvent());
    const text = editor.getText();
    for (let level = 1; level <= 40; level += 1) expect(text).toContain(`Level ${level}`);
    for (let level = 1; level <= 70; level += 1) expect(text).toContain(`Quote ${level}`);
    expect(documentDepth(editor.getJSON())).toBeLessThanOrEqual(MAX_DOCUMENT_DEPTH);
    // Shallow levels keep their structure.
    expect(editor.getJSON().content?.[0]?.type).toBe('bulletList');
  });
});

describe('documents this version cannot edit exactly', () => {
  const linked = doc({
    type: 'paragraph',
    content: [
      { type: 'text', text: 'See ' },
      { type: 'text', text: 'this fictional page', marks: [{ type: 'link', attrs: { href: 'https://example.invalid/page' } }] },
      { type: 'text', text: ' today.' },
    ],
  });

  it('opens a document with a link read-only, says why, and never reports a change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <JournalEditor
        initialContent={linked}
        label="Synthetic journal"
        placeholder="Write freely."
        showToolbar
        showWordCount={false}
        onChange={onChange}
      />,
    );
    const editor = screen.getByRole('textbox', { name: 'Synthetic journal' });
    expect(editor).toHaveAttribute('aria-readonly', 'true');
    expect(editor).toHaveAccessibleDescription(PROTECTED_DOCUMENT_MESSAGE);
    expect(screen.getByText(PROTECTED_DOCUMENT_MESSAGE)).toBeInTheDocument();
    expect(editor).toHaveTextContent('See this fictional page today.');
    expect(screen.queryByRole('toolbar', { name: 'Formatting' })).not.toBeInTheDocument();
    editor.focus();
    await user.keyboard('x{Backspace}{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(editor).toHaveTextContent('See this fictional page today.');
  });

  it('shows the words of a document with an empty text node or an unknown node, read-only', () => {
    const onChange = vi.fn();
    render(
      <JournalEditor
        initialContent={doc(
          { type: 'paragraph', content: [{ type: 'text', text: '' }, { type: 'text', text: 'Synthetic kept words' }] },
          { type: 'table', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Synthetic cell' }] }] },
        )}
        label="Synthetic journal"
        placeholder="Write freely."
        showToolbar={false}
        showWordCount={false}
        onChange={onChange}
      />,
    );
    const editor = screen.getByRole('textbox', { name: 'Synthetic journal' });
    expect(editor).toHaveAttribute('aria-readonly', 'true');
    expect(editor).toHaveTextContent('Synthetic kept words');
    expect(editor).toHaveTextContent('Synthetic cell');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('edits exactly the documents the editor represents without loss', () => {
    expect(canEditExactly(doc(paragraph()))).toBe(true);
    expect(canEditExactly(doc(paragraph('Une phrase fictive 🌿')))).toBe(true);
    expect(
      canEditExactly(
        doc(
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Synthetic heading' }] },
          { type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [paragraph('First')] }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Split ' }, { type: 'text', text: 'text' }] },
        ),
      ),
    ).toBe(true);
    expect(canEditExactly(doc(nestedQuotes(29)))).toBe(true);

    expect(canEditExactly(linked)).toBe(false);
    expect(canEditExactly(doc({ type: 'paragraph', content: [{ type: 'text', text: '' }] }))).toBe(false);
    expect(canEditExactly(doc({ type: 'image', attrs: { src: 'synthetic.png' } }))).toBe(false);
    expect(canEditExactly(doc({ type: 'heading', attrs: { level: 2, id: 'synthetic' }, content: [{ type: 'text', text: 'x' }] }))).toBe(false);
    expect(canEditExactly(doc({ type: 'paragraph', content: [{ type: 'heading', attrs: { level: 2 } }] }))).toBe(false);
    expect(canEditExactly(doc(nestedQuotes(30)))).toBe(false);
    expect(canEditExactly({ type: 'doc', content: [] })).toBe(false);
  });

  it('accepts exactly the node and mark types journal-core accepts', () => {
    const model = readFileSync(resolve(import.meta.dirname, '../../../../../crates/journal-core/src/model.rs'), 'utf8');
    const list = (name: string) => {
      const items = new RegExp(`const ${name}: \\[&str; \\d+\\] = \\[([^\\]]*)\\]`).exec(model)?.[1] ?? '';
      return Array.from(items.matchAll(/"([A-Za-z]+)"/g), (match) => match[1]);
    };
    expect(list('NODE_TYPES')).toEqual([...JOURNAL_NODE_TYPES]);
    expect(list('MARK_TYPES')).toEqual([...JOURNAL_MARK_TYPES]);
  });
});

describe('JournalEditor', () => {
  it('reports each edit and never reports merely opening a document', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <JournalEditor
        initialContent={{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Stored' }] }] }}
        label="Synthetic journal"
        placeholder="Write freely."
        showToolbar
        showWordCount={false}
        onChange={onChange}
      />,
    );
    const editor = screen.getByRole('textbox', { name: 'Synthetic journal' });
    expect(editor).toHaveAttribute('aria-multiline', 'true');
    expect(onChange).not.toHaveBeenCalled();
    editor.focus();
    // A formatting toggle with nothing selected changes no words.
    await user.keyboard('{Control>}b{/Control}');
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard('A');
    expect(onChange).toHaveBeenCalledTimes(1);
    const reported = onChange.mock.calls[0][0] as JSONContent;
    expect(JSON.stringify(reported)).toContain('Stored');
    expect(JSON.stringify(reported)).toContain('"marks":[{"type":"bold"}]');
  });

  it('moves between toolbar buttons with the arrow keys', async () => {
    const user = userEvent.setup();
    render(
      <JournalEditor
        initialContent={{ type: 'doc', content: [{ type: 'paragraph' }] }}
        label="Synthetic journal"
        placeholder="Write freely."
        showToolbar
        showWordCount={false}
        onChange={() => {}}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Bold',
      'Italic',
      'Heading',
      'Bullet list',
      'Numbered list',
      'Quote',
    ]);
    expect(buttons.map((button) => button.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
    buttons[0].focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(buttons[2]).toHaveFocus();
    await user.keyboard('{End}');
    expect(buttons[5]).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(buttons[0]).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(buttons[5]).toHaveFocus();
    expect(buttons[5]).toHaveAttribute('tabindex', '0');
  });
});
