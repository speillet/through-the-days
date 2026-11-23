// The journal page editor: Tiptap with useEditor and EditorContent in one
// component. The person's words change only through their own editing; the
// document reaches autosave through onChange after every edit. A stored document
// the editor cannot represent exactly opens read-only with an explanation, and
// nothing it shows is ever reported, so autosave can never overwrite the original.

import type { JSONContent } from '@tiptap/core';
import { Selection } from '@tiptap/pm/state';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import { Notice } from '../../components/Notice';
import { canEditExactly, readableCopy } from './content';
import { EditorToolbar } from './EditorToolbar';
import { journalExtensions } from './extensions';
import './editor.css';

export const PROTECTED_DOCUMENT_MESSAGE =
  "This entry contains content that this version of Through the Days can't edit without changing it, so it is read-only. The saved version stays exactly as it is, and you can still read and copy it.";

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
  const [opened] = useState(() =>
    canEditExactly(initialContent)
      ? { editable: true, content: initialContent }
      : { editable: false, content: readableCopy(initialContent) },
  );
  const [extensions] = useState(() => journalExtensions(placeholder));
  const protectedNoticeId = useId();
  const editorProps = useMemo(
    () => ({
      attributes: {
        ...(id ? { id } : {}),
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        // Read-only writing stays reachable with Tab, so it can be read and selected.
        ...(opened.editable ? {} : { 'aria-readonly': 'true', 'aria-describedby': protectedNoticeId, tabindex: '0' }),
        class: 'journal-editor__content prose',
        spellcheck: 'true',
      },
    }),
    [id, label, opened.editable, protectedNoticeId],
  );

  const editor = useEditor({
    extensions,
    content: opened.content,
    editable: opened.editable,
    editorProps,
    onUpdate: ({ editor: instance }) => {
      // A read-only copy is never the stored document, so it must never reach autosave.
      if (opened.editable) onChangeRef.current(instance.getJSON());
    },
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
      {opened.editable ? null : (
        <Notice id={protectedNoticeId} tone="warning" politeness="off" className="journal-editor__protected">
          {PROTECTED_DOCUMENT_MESSAGE}
        </Notice>
      )}
      {showToolbar && opened.editable && editor ? <EditorToolbar editor={editor} controls={id} /> : null}
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
