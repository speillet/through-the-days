// Whether the editor can open a stored document without changing it. A document it
// cannot represent exactly (a node or mark this version does not have, an empty
// text node, an attribute it would drop, nesting deeper than the journal accepts)
// opens read-only, so no edit can replace the saved version with a lossy copy.

import { getSchema, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import { documentText } from '../../domain/entry';
import { journalExtensions } from './extensions';
import { MAX_DOCUMENT_DEPTH, structuralDepth } from './nesting';

let schema: Schema | null = null;

/** The editor's schema, built once from the same extensions as the editor. */
export function journalSchema(): Schema {
  schema ??= getSchema(journalExtensions(''));
  return schema;
}

const NODE_KEYS: ReadonlySet<string> = new Set(['type', 'attrs', 'content', 'marks', 'text']);

type Mark = NonNullable<JSONContent['marks']>[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Every stored attribute survives loading with the same value. */
function keepsAttrs(stored: unknown, loaded: unknown): boolean {
  if (stored === undefined || stored === null) return true;
  if (!isRecord(stored)) return false;
  const known = isRecord(loaded) ? loaded : {};
  return Object.entries(stored).every(([key, value]) => key in known && sameValue(value, known[key]));
}

function markKey(mark: Mark): string {
  return `${mark.type}:${JSON.stringify(mark.attrs ?? {})}`;
}

function sameMarkSet(left: readonly Mark[] = [], right: readonly Mark[] = []): boolean {
  if (left.length !== right.length) return false;
  const keys = new Set(left.map(markKey));
  return right.every((mark) => keys.has(markKey(mark)));
}

function keepsMarks(stored: readonly Mark[] = [], loaded: readonly Mark[] = []): boolean {
  return (
    stored.length === loaded.length &&
    stored.every((mark) => loaded.some((other) => other.type === mark.type && keepsAttrs(mark.attrs, other.attrs)))
  );
}

/** Adjacent text with the same marks becomes one text node when loaded; that changes nothing. */
function joinText(children: readonly JSONContent[]): JSONContent[] {
  const joined: JSONContent[] = [];
  for (const child of children) {
    const last = joined[joined.length - 1];
    if (last?.type === 'text' && child.type === 'text' && sameMarkSet(last.marks, child.marks)) {
      joined[joined.length - 1] = { ...last, text: `${last.text ?? ''}${child.text ?? ''}` };
    } else {
      joined.push(child);
    }
  }
  return joined;
}

/** Loading kept every type, text, attribute, mark and child of the stored node. */
function keeps(stored: JSONContent, loaded: JSONContent): boolean {
  const children = stored.content ?? [];
  if (!children.every((child) => isRecord(child) && Object.keys(child).every((key) => NODE_KEYS.has(key)))) {
    return false;
  }
  if (stored.type !== loaded.type || stored.text !== loaded.text) return false;
  if (!keepsAttrs(stored.attrs, loaded.attrs) || !keepsMarks(stored.marks, loaded.marks)) return false;
  const storedChildren = joinText(children);
  const loadedChildren = loaded.content ?? [];
  return (
    storedChildren.length === loadedChildren.length &&
    storedChildren.every((child, index) => keeps(child, loadedChildren[index]))
  );
}

function load(stored: JSONContent): ProseMirrorNode | null {
  try {
    const node = journalSchema().nodeFromJSON(stored);
    node.check();
    return node;
  } catch {
    return null;
  }
}

/** True when the editor shows and saves exactly what is stored. */
export function canEditExactly(stored: JSONContent): boolean {
  if (!isRecord(stored) || stored.type !== 'doc' || Object.keys(stored).some((key) => !NODE_KEYS.has(key))) {
    return false;
  }
  const node = load(stored);
  if (!node || structuralDepth(node) > MAX_DOCUMENT_DEPTH) return false;
  return keeps(stored, node.toJSON() as JSONContent);
}

/** The stored document without what this version cannot show: unknown marks and empty text. */
function withoutUnknownMarks(node: JSONContent): JSONContent | null {
  const known = journalSchema();
  if (node.type === 'text') {
    if (typeof node.text !== 'string' || node.text === '') return null;
    const marks = (node.marks ?? []).filter((mark) => mark.type in known.marks);
    return marks.length > 0 ? { type: 'text', text: node.text, marks } : { type: 'text', text: node.text };
  }
  const content = (node.content ?? []).map(withoutUnknownMarks).filter((child): child is JSONContent => child !== null);
  return { type: node.type, ...(node.attrs ? { attrs: node.attrs } : {}), ...(node.content ? { content } : {}) };
}

/**
 * A read-only copy for showing a document the editor cannot edit exactly: the
 * structure with unknown marks removed when that is valid, otherwise every line of
 * its text as a paragraph.
 */
export function readableCopy(stored: JSONContent): JSONContent {
  const lenient = isRecord(stored) ? withoutUnknownMarks(stored) : null;
  const node = lenient ? load(lenient) : null;
  if (node) return node.toJSON() as JSONContent;
  const lines = documentText(isRecord(stored) ? stored : null).split('\n');
  return {
    type: 'doc',
    content: lines.map((line) =>
      line === '' ? { type: 'paragraph' } : { type: 'paragraph', content: [{ type: 'text', text: line }] },
    ),
  };
}
