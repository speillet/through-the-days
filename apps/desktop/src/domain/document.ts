// The journal document schema, shared by the editor and the browser preview. journal-core
// accepts exactly these node and mark types and this nesting limit
// (crates/journal-core/src/model.rs, validate_node). A test on each side reads the other's
// lists, so neither can change alone.

/** Node types of the editor schema. */
export const JOURNAL_NODE_TYPES = [
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
] as const;

/** Mark types of the editor schema. Links are not part of the journal document. */
export const JOURNAL_MARK_TYPES = ['bold', 'italic', 'strike', 'code', 'underline'] as const;

/** Deepest node level journal-core accepts, counting the doc node and text nodes. */
export const MAX_DOCUMENT_DEPTH = 32;
