// The editor schema. The Tiptap JSON document is canonical; Markdown is only a
// read-only projection. The schema is limited to the node and mark types that
// journal-core accepts (listed in domain/document.ts), and to its nesting limit,
// so typing, shortcuts and pasting can never produce a document the journal refuses.

import type { AnyExtension } from '@tiptap/core';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import { JournalMarkdown } from './markdown';
import { NestingLimit } from './nesting';

/** Words separated by any Unicode white space. */
export function countWords(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

export function journalExtensions(placeholder: string): AnyExtension[] {
  return [
    StarterKit.configure({
      // Links are not part of the journal document.
      link: false,
      // An automatic trailing paragraph would change a stored document merely by opening it.
      trailingNode: false,
    }),
    Placeholder.configure({ placeholder }),
    // No length limit: the count is informative only.
    CharacterCount.configure({ limit: null, wordCounter: countWords }),
    NestingLimit,
    JournalMarkdown,
  ];
}
