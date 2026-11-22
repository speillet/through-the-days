import { Editor, type JSONContent } from '@tiptap/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { countWords, journalExtensions, JOURNAL_MARK_TYPES, JOURNAL_NODE_TYPES } from './extensions';
import { JournalEditor } from './JournalEditor';

const editors: Editor[] = [];

function headlessEditor(content: JSONContent | string = '') {
  const editor = new Editor({ extensions: journalExtensions('Write'), content });
  editors.push(editor);
  return editor;
}

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
