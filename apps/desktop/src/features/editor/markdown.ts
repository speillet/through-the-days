// Derived Markdown for View Markdown and Copy Markdown. The Tiptap document stays
// canonical; the projection must keep the person's text and its structure. Plain text
// is escaped only where Markdown would read it as something else: inline syntax
// (* _ ` [ ] ~ \), "&" before an entity, "<" before a tag, and what would turn a
// line into a heading, list, quote, rule, table or code block ("# ", "- ", "1. ",
// "> ", four spaces…). "&", "<" and ">" are otherwise kept as typed, never as
// HTML entities, and each empty paragraph is one blank line.
//
// Blocks are written so that a CommonMark reader finds the same structure: a code
// block's fence is longer than every backtick run in its code, a line break is a
// backslash at the end of its line (or "<br>" in a heading and where no text but white
// space follows it in its block), and an ordered list keeps its first number, 0 included.

import type { JSONContent } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';

type TextEncoder = (text: string, node: JSONContent, parent?: JSONContent) => string;
type NodeRenderer = (
  node: JSONContent,
  parentNode?: JSONContent,
  index?: number,
  level?: number,
  meta?: Record<string, unknown>,
) => string;

const INLINE_SYNTAX = /[\\`*_[\]~]/g;
const ENTITY_START = /&(?=#\d{1,7};|#[xX][\da-fA-F]{1,6};|[A-Za-z][A-Za-z\d]{1,31};)/g;
const TAG_START = /<(?=[A-Za-z/!?])/g;
const LEADING_SPACE = /^[ \t]*/;
const TABLE_DELIMITER_ROW = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

/** Escapes inline Markdown syntax, keeping every other character as typed. */
function escapeInlineMarkdown(text: string): string {
  return text.replace(INLINE_SYNTAX, '\\$&').replace(ENTITY_START, '\\&').replace(TAG_START, '\\<');
}

function characterReference(character: string): string {
  return `&#${character.codePointAt(0) ?? 32};`;
}

/** Escapes the marker that would make a line (without its indentation) start a block. */
function escapeBlockMarker(line: string): string {
  // ATX heading, block quote, bullet list item, thematic break or setext underline.
  if (/^#{1,6}(?:[ \t]|$)/.test(line) || line.startsWith('>')) return `\\${line}`;
  if (/^[-+](?:[ \t]|$)/.test(line) || /^-[ \t-]*$/.test(line) || /^=+[ \t]*$/.test(line)) return `\\${line}`;
  // Ordered list item: escape its delimiter.
  const ordered = /^(\d{1,9})([.)])(?=[ \t]|$)/.exec(line);
  if (ordered) return `${ordered[1]}\\${line.slice(ordered[1].length)}`;
  // A table's delimiter row under a line of text.
  if (line.includes('|') && TABLE_DELIMITER_ROW.test(line)) return line.replace(/\|/g, '\\|');
  return line;
}

/**
 * Escapes one line of inline-escaped paragraph text. `first` is the paragraph's first
 * line, where indentation of four columns would start a code block; a later line
 * (after a line break) continues the paragraph, so only its markers matter.
 */
export function escapeLineStart(line: string, first: boolean): string {
  const indent = LEADING_SPACE.exec(line)?.[0] ?? '';
  if (indent.includes('\t') || indent.length >= 4) {
    // An entity keeps the indentation without starting a code block, and nothing after
    // it can be read as a marker. A later line keeps its indentation as typed.
    return first ? `${characterReference(indent[0])}${line.slice(1)}` : line;
  }
  return `${indent}${escapeBlockMarker(line.slice(indent.length))}`;
}

/** Whether a text node begins a line of its paragraph or heading. */
function startsLine(node: JSONContent, parent: JSONContent): boolean {
  const siblings = parent.content ?? [];
  const index = siblings.indexOf(node);
  return index === 0 || (index > 0 && siblings[index - 1]?.type === 'hardBreak');
}

/** Whether a node is text made only of white space, which Markdown drops at the end of a block. */
function isWhiteSpaceText(node: JSONContent | undefined): boolean {
  return node?.type === 'text' && (node.text ?? '').trim() === '';
}

/** Whether only line breaks and text made of white space follow the inline node at `index`. */
function onlyWhiteSpaceFollows(siblings: readonly JSONContent[], index: number): boolean {
  return siblings.slice(index + 1).every((sibling) => sibling.type === 'hardBreak' || isWhiteSpaceText(sibling));
}

/** Text of a paragraph, written so that Markdown reads it back as the same text. */
function encodeParagraphText(text: string, node: JSONContent, parent: JSONContent): string {
  const lines = escapeInlineMarkdown(text).split('\n');
  const siblings = parent.content ?? [];
  const index = siblings.indexOf(node);
  const atLineStart = startsLine(node, parent);
  const firstLine = atLineStart && index === 0;
  return lines
    .map((line, lineIndex) => {
      if (lineIndex > 0) return escapeLineStart(line, false);
      if (!atLineStart) return line;
      // A paragraph made only of a non-breaking space would read back as an empty one.
      if (firstLine && line === '\u00A0' && lines.length === 1) return characterReference(line);
      // White space after the block's last text follows a "<br>" (see renderHardBreak), and
      // Markdown drops it at the end of a block (or reads "<br> " alone as an HTML block).
      if (!firstLine && lines.length === 1 && isWhiteSpaceText(node) && onlyWhiteSpaceFollows(siblings, index)) {
        return `${characterReference(line[0])}${line.slice(1)}`;
      }
      return escapeLineStart(line, firstLine);
    })
    .join('\n');
}

/** Text of a heading: its leading spaces and a trailing "#" run would otherwise be dropped. */
function encodeHeadingText(text: string, node: JSONContent, parent: JSONContent): string {
  let encoded = escapeInlineMarkdown(text);
  const siblings = parent.content ?? [];
  const index = siblings.indexOf(node);
  if (index === 0 && /^[ \t]/.test(encoded)) encoded = `${characterReference(encoded[0])}${encoded.slice(1)}`;
  if (index === siblings.length - 1) {
    encoded = encoded.replace(
      /(^|[ \t])(#+)([ \t]*)$/,
      (_match, before: string, run: string, after: string) => `${before}\\${run}${after}`,
    );
  }
  return encoded;
}

/**
 * The level a heading is written at, from 1 to 6. Tiptap's renderer writes "#" `level`
 * times, which fails on a negative level, and journal-core does not check attributes, so
 * a crafted document can hold one. Such a level is written as the nearest of 1 to 6; a
 * level that is not a number is written as 1, as Tiptap writes a missing one.
 */
function markdownHeadingLevel(level: unknown): number {
  return Math.min(6, Math.max(1, Number.parseInt(String(level), 10) || 1));
}

/** Writes every heading at a level Markdown has; the document itself keeps its stored level. */
function keepHeadingLevelsInRange(serializer: { renderNodeToMarkdown?: NodeRenderer }): void {
  const renderNode = serializer.renderNodeToMarkdown?.bind(serializer);
  if (!renderNode) return;
  serializer.renderNodeToMarkdown = (node, parentNode, index, nesting, meta) =>
    renderNode(
      node.type === 'heading'
        ? { ...node, attrs: { ...node.attrs, level: markdownHeadingLevel(node.attrs?.level) } }
        : node,
      parentNode,
      index,
      nesting,
      meta,
    );
}

/** Encodes plain text for the Markdown serialiser; code keeps its characters exactly. */
export const encodeMarkdownText: TextEncoder = (text, node, parent) => {
  if (parent?.type === 'codeBlock' || (node.marks ?? []).some((mark) => mark.type === 'code')) return text;
  if (parent?.type === 'paragraph') return encodeParagraphText(text, node, parent);
  if (parent?.type === 'heading') return encodeHeadingText(text, node, parent);
  return escapeInlineMarkdown(text);
};

/**
 * A code block in a fence of more backticks than any run in its code, so that no line
 * of the code (a "```" line, say) closes it. An empty code block keeps its blank line.
 */
function renderCodeBlock(node: JSONContent): string {
  const code = (node.content ?? []).map((child) => child.text ?? '').join('');
  let longestRun = 0;
  for (const [run] of code.matchAll(/`+/g)) longestRun = Math.max(longestRun, run.length);
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  return `${fence}${node.attrs?.language ?? ''}\n${code}\n${fence}`;
}

/**
 * A line break: a backslash at the end of the line, which works wherever text follows
 * in the block, even at its start or after another break (two trailing spaces would
 * leave a blank line there). A heading is a single line, and a backslash is literal at
 * the end of a block, which a line of only white space also ends, as Markdown reads it
 * as blank; so a break that no text but white space follows is "<br>" on the same line.
 */
function renderHardBreak(parent: JSONContent | undefined, index: number): string {
  return parent?.type === 'heading' || onlyWhiteSpaceFollows(parent?.content ?? [], index) ? '<br>' : '\\\n';
}

/** The number an ordered list starts at. */
function listStart(list: JSONContent): number {
  const start: unknown = list.attrs?.start;
  return typeof start === 'number' ? start : 1;
}

/** An ordered list numbered with digits from 0, which @tiptap/extension-list writes from 1 (`start || 1`). */
function numbersFromZero(list: JSONContent): boolean {
  const type: unknown = list.attrs?.type;
  return list.type === 'orderedList' && listStart(list) === 0 && (!type || type === '1');
}

/**
 * Whether the child of a list item at `index` needs a blank line before it. Children
 * after the first are one line apart (paragraphs excepted), and Markdown can read such
 * a line as more of the block above: an ordered list that does not start at 1 cannot
 * interrupt a paragraph, so it would continue one (or a quotation, in Tiptap's own
 * reader), and a paragraph that is only a line break, perhaps with white space ("<br>"),
 * can be an HTML block, which only a blank line ends.
 */
function needsBlankLine(item: JSONContent, index: number, node: JSONContent): boolean {
  if (index === 0 || node.type === 'paragraph') return false;
  if (node.type === 'orderedList' && listStart(node) !== 1) return true;
  const previous = item.content?.[index - 1];
  const inline = previous?.type === 'paragraph' ? (previous.content ?? []) : [];
  const breaks = inline.filter((child) => child.type === 'hardBreak').length;
  return breaks === 1 && inline.every((child) => child.type === 'hardBreak' || isWhiteSpaceText(child));
}

/** Markdown for one node, or the default where that keeps its text and structure. */
function renderJournalNode(
  renderNode: NodeRenderer,
  node: JSONContent,
  parent: JSONContent | undefined,
  index: number,
  level?: number,
  meta?: Record<string, unknown>,
): string {
  // One blank line for each empty top-level paragraph, instead of "&nbsp;" for the second one in a row.
  if (node.type === 'paragraph' && (node.content ?? []).length === 0 && parent?.type === 'doc') return '';
  if (node.type === 'codeBlock') return renderCodeBlock(node);
  if (node.type === 'hardBreak') return renderHardBreak(parent, index);
  if (node.type === 'listItem' && parent && numbersFromZero(parent)) {
    // Numbering from 1, one item earlier, starts the list at 0.
    return renderNode(node, parent, index - 1, level, { ...meta, parentAttrs: { ...parent.attrs, start: 1 } });
  }
  return renderNode(node, parent, index, level, meta);
}

/**
 * The Markdown extension with this text encoding and these node renderings (see the
 * top of this file). @tiptap/markdown has no public hook for text, and a node's own
 * renderer cannot see the siblings that follow it, so the serialiser's text encoder
 * and node renderer are replaced once the editor creates them; the round-trip tests
 * in JournalEditor.test.tsx guard this.
 */
export const JournalMarkdown = Markdown.extend({
  onBeforeCreate(event) {
    this.parent?.(event);
    const serializer = this.editor.markdown as unknown as
      | { encodeTextForMarkdown?: TextEncoder; renderNodeToMarkdown?: NodeRenderer }
      | undefined;
    if (!serializer) return;
    if (typeof serializer.encodeTextForMarkdown === 'function') serializer.encodeTextForMarkdown = encodeMarkdownText;
    keepHeadingLevelsInRange(serializer);
    const renderNode = serializer.renderNodeToMarkdown?.bind(serializer);
    if (renderNode) {
      serializer.renderNodeToMarkdown = (node, parentNode, index = 0, level, meta) => {
        const markdown = renderJournalNode(renderNode, node, parentNode, index, level, meta);
        return parentNode?.type === 'listItem' && needsBlankLine(parentNode, index, node) ? `\n${markdown}` : markdown;
      };
    }
  },
});
