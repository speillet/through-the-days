// The hideable formatting toolbar. One button is in the Tab order; arrow keys
// move between them. Each button reports its state with aria-pressed and keeps
// the selection in the editor when clicked.

import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { Bold, Heading2, Italic, List, ListOrdered, Quote, type LucideIcon } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { classNames } from '../../components/classNames';

interface Tool {
  id: string;
  label: string;
  shortcut?: string;
  Icon: LucideIcon;
  isActive(editor: Editor): boolean;
  run(editor: Editor): void;
}

const TOOLS: readonly Tool[] = [
  {
    id: 'bold',
    label: 'Bold',
    shortcut: '⌘B',
    Icon: Bold,
    isActive: (editor) => editor.isActive('bold'),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    id: 'italic',
    label: 'Italic',
    shortcut: '⌘I',
    Icon: Italic,
    isActive: (editor) => editor.isActive('italic'),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    id: 'heading',
    label: 'Heading',
    Icon: Heading2,
    isActive: (editor) => editor.isActive('heading'),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'bulletList',
    label: 'Bullet list',
    Icon: List,
    isActive: (editor) => editor.isActive('bulletList'),
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'orderedList',
    label: 'Numbered list',
    Icon: ListOrdered,
    isActive: (editor) => editor.isActive('orderedList'),
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: 'blockquote',
    label: 'Quote',
    Icon: Quote,
    isActive: (editor) => editor.isActive('blockquote'),
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
];

export function EditorToolbar({ editor, controls }: { editor: Editor; controls?: string }) {
  const [current, setCurrent] = useState(0);
  const active = useEditorState({
    editor,
    selector: ({ editor: instance }) => TOOLS.map((tool) => tool.isActive(instance)),
  });

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      Home: 0,
      End: TOOLS.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = (moves[event.key] + TOOLS.length) % TOOLS.length;
    setCurrent(next);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-controls={controls}
      className="editor-toolbar"
      onKeyDown={handleKeyDown}
    >
      {TOOLS.map((tool, index) => {
        const pressed = active[index] ?? false;
        return (
          <button
            key={tool.id}
            type="button"
            tabIndex={index === current ? 0 : -1}
            className={classNames('editor-toolbar__button', pressed && 'editor-toolbar__button--pressed')}
            aria-pressed={pressed}
            aria-label={tool.label}
            aria-keyshortcuts={tool.shortcut ? tool.shortcut.replace('⌘', 'Meta+') : undefined}
            title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
            // Keep the text selection in the editor while clicking.
            onMouseDown={(event) => event.preventDefault()}
            onFocus={() => setCurrent(index)}
            onClick={() => tool.run(editor)}
          >
            <tool.Icon aria-hidden="true" size={17} strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
