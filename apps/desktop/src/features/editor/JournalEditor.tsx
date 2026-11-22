// The journal page editor: Tiptap with useEditor and EditorContent in one
// component. The person's words change only through their own editing; the
// document reaches autosave through onChange after every edit.

import type { JSONContent } from '@tiptap/core';
import { Selection } from '@tiptap/pm/state';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import { EditorToolbar } from './EditorToolbar';
import { journalExtensions } from './extensions';
import './editor.css';

export interface JournalEditorHandle {
  focus(position?: 'start' | 'end'): void;
  /** Markdown derived from the current document. */
  getMarkdown(): string;
}

export interface JournalEditorProps {
  /** The document when the editor opens; later edits flow out through onChange only. */
  initialContent: JSONContent;
  /** Accessible name of the writing area. */
  label: string;
  placeholder: string;
  showToolbar: boolean;
  showWordCount: boolean;
  onChange(document: JSONContent): void;
  id?: string;
  ref?: Ref<JournalEditorHandle>;
}

export function JournalEditor({
  initialContent,
  label,
  placeholder,
  showToolbar,
  showWordCount,
  onChange,
  id,
  ref,
}: JournalEditorProps) {
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });
  // Stable options, so the editor is configured once and never reloads its content.
  const [content] = useState(initialContent);
  const [extensions] = useState(() => journalExtensions(placeholder));
  const editorProps = useMemo(
    () => ({
      attributes: {
        ...(id ? { id } : {}),
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        class: 'journal-editor__content prose',
        spellcheck: 'true',
      },
    }),
    [id, label],
  );

  const editor = useEditor({
    extensions,
    content,
    editorProps,
    onUpdate: ({ editor: instance }) => onChangeRef.current(instance.getJSON()),
  });

  useImperativeHandle(
    ref,
    () => ({
      focus: (position = 'end') => {
        if (!editor || editor.isDestroyed) return;
        // Place the caret and focus at once. (Tiptap's focus command defers focusing to
        // the next frame outside WebKit, which could pull focus back later.)
        const { state, view } = editor;
        const selection = position === 'start' ? Selection.atStart(state.doc) : Selection.atEnd(state.doc);
        view.dispatch(state.tr.setSelection(selection).scrollIntoView());
        view.focus();
      },
      getMarkdown: () => editor?.getMarkdown() ?? '',
    }),
    [editor],
  );

  return (
    <div className="journal-editor">
      {showToolbar && editor ? <EditorToolbar editor={editor} controls={id} /> : null}
      <EditorContent editor={editor} className="journal-editor__surface" />
      {showWordCount && editor ? <WordCount editor={editor} /> : null}
    </div>
  );
}

function WordCount({ editor }: { editor: Editor }) {
  const words = useEditorState({ editor, selector: ({ editor: instance }) => instance.storage.characterCount.words() });
  return (
    <p className="journal-editor__count" aria-live="off">
      {words === 1 ? '1 word' : `${words.toLocaleString('en-GB')} words`}
    </p>
  );
}
