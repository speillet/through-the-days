// A nesting limit for the journal document. journal-core refuses documents whose
// node depth exceeds 32 (the doc node counts as level 1 and text counts as a level),
// so the editor never lets a list, quote or paste take a document deeper: indenting
// or quoting past the limit does nothing, and deeper pasted content keeps its words
// as plain blocks at the deepest level that still fits.

import { Extension, type JSONContent } from '@tiptap/core';
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/** Deepest node level journal-core accepts, counting the doc node and text nodes. */
export const MAX_DOCUMENT_DEPTH = 32;

/** Wrapping that pasting may add around pasted content (for example a list around list items). */
const PASTE_WRAPPING_MARGIN = 2;

/** Node levels in a stored document: the doc node is level 1 and a text node is a level. */
export function documentDepth(node: JSONContent): number {
  let deepest = 0;
  for (const child of node.content ?? []) deepest = Math.max(deepest, documentDepth(child));
  return 1 + deepest;
}

/**
 * Levels a node takes, counting itself. A text block always counts its text, even
 * while empty, so typing can never take a document past the limit.
 */
export function structuralDepth(node: ProseMirrorNode): number {
  if (node.isTextblock) return 2;
  if (node.isLeaf) return 1;
  let deepest = 0;
  node.forEach((child) => {
    deepest = Math.max(deepest, structuralDepth(child));
  });
  return 1 + deepest;
}

/** Text blocks and block leaves inside a node, in reading order. */
function blocksOf(node: ProseMirrorNode): ProseMirrorNode[] {
  const blocks: ProseMirrorNode[] = [];
  node.descendants((child) => {
    if (child.isTextblock || (child.isBlock && child.isLeaf)) {
      blocks.push(child);
      return false;
    }
    return true;
  });
  return blocks;
}

/**
 * The node rebuilt to take at most `levels` levels. A container that cannot keep its
 * children within the limit is unwrapped: its words stay, as the blocks it contained.
 */
function fitNode(node: ProseMirrorNode, levels: number): ProseMirrorNode[] {
  if (structuralDepth(node) <= levels || node.isTextblock || node.isLeaf) return [node];
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => {
    children.push(...fitNode(child, levels - 1));
  });
  try {
    const rebuilt = node.type.createChecked(node.attrs, children, node.marks);
    if (structuralDepth(rebuilt) <= levels) return [rebuilt];
  } catch {
    // The flattened children are not valid inside this container (list items outside a list).
  }
  return blocksOf(node);
}

/** How many nodes along one edge of a fragment can stay open. */
function edgeDepth(fragment: Fragment, side: 'start' | 'end'): number {
  let depth = 0;
  let node = side === 'start' ? fragment.firstChild : fragment.lastChild;
  while (node && !node.isLeaf) {
    depth += 1;
    node = side === 'start' ? node.firstChild : node.lastChild;
  }
  return depth;
}

/** Flattens a pasted slice so that each of its nodes takes at most `levels` levels. */
export function fitSlice(slice: Slice, levels: number): Slice {
  const allowed = Math.max(levels, 2);
  const nodes: ProseMirrorNode[] = [];
  let changed = false;
  slice.content.forEach((node) => {
    const fitted = fitNode(node, allowed);
    if (fitted.length !== 1 || fitted[0] !== node) changed = true;
    nodes.push(...fitted);
  });
  if (!changed) return slice;
  const content = Fragment.fromArray(nodes);
  return new Slice(
    content,
    Math.min(slice.openStart, edgeDepth(content, 'start')),
    Math.min(slice.openEnd, edgeDepth(content, 'end')),
  );
}

export const NestingLimit = Extension.create({
  name: 'nestingLimit',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('nestingLimit'),
        props: {
          // Pasted or dropped content lands beside the block holding the selection.
          transformPasted: (slice, view) =>
            fitSlice(slice, MAX_DOCUMENT_DEPTH - view.state.selection.$from.depth - PASTE_WRAPPING_MARGIN),
        },
        // Any other change (indenting a list item, quoting, an input rule) that would go
        // deeper than the limit is refused; a change that makes nothing deeper always passes.
        filterTransaction: (transaction, state) => {
          if (!transaction.docChanged) return true;
          const depth = structuralDepth(transaction.doc);
          return depth <= MAX_DOCUMENT_DEPTH || depth <= structuralDepth(state.doc);
        },
      }),
    ];
  },
});
