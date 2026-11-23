// Derived Markdown for View Markdown and Copy Markdown. The Tiptap document stays
// canonical; the projection must keep the person's text and its structure. Plain text
// is escaped only where Markdown would read it as something else: inline syntax
// (* _ ` [ ] ~ \), "&" before an entity, "<" before a tag, and what would turn a
// line into a heading, list, quote, rule, table or code block ("# ", "- ", "1. ",
// "> ", four spaces…). "&", "<" and ">" are otherwise kept as typed, never as
// HTML entities, and each empty paragraph is one blank line.

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
export function escapeInlineMarkdown(text: string): string {
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

/** Text of a paragraph, written so that Markdown reads it back as the same text. */
function encodeParagraphText(text: string, node: JSONContent, parent: JSONContent): string {
  const lines = escapeInlineMarkdown(text).split('\n');
  const atLineStart = startsLine(node, parent);
  const firstLine = atLineStart && (parent.content ?? []).indexOf(node) === 0;
  return lines
    .map((line, index) => {
      if (index > 0) return escapeLineStart(line, false);
      if (!atLineStart) return line;
      // A paragraph made only of a non-breaking space would read back as an empty one.
      if (firstLine && line === '\u00A0' && lines.length === 1) return characterReference(line);
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

/** Encodes plain text for the Markdown serialiser; code keeps its characters exactly. */
export const encodeMarkdownText: TextEncoder = (text, node, parent) => {
  if (parent?.type === 'codeBlock' || (node.marks ?? []).some((mark) => mark.type === 'code')) return text;
  if (parent?.type === 'paragraph') return encodeParagraphText(text, node, parent);
  if (parent?.type === 'heading') return encodeHeadingText(text, node, parent);
  return escapeInlineMarkdown(text);
};

/**
 * The Markdown extension with this text encoding, and one blank line for each empty
 * top-level paragraph (instead of "&nbsp;" for the second one in a row). @tiptap/markdown
 * has no public hook for text, so its serialiser's text encoder is replaced once the
 * editor creates it; the round-trip tests in JournalEditor.test.tsx guard this.
 */
export const JournalMarkdown = Markdown.extend({
  onBeforeCreate(event) {
    this.parent?.(event);
    const serializer = this.editor.markdown as unknown as
      | { encodeTextForMarkdown?: TextEncoder; renderNodeToMarkdown?: NodeRenderer }
      | undefined;
    if (!serializer) return;
    if (typeof serializer.encodeTextForMarkdown === 'function') serializer.encodeTextForMarkdown = encodeMarkdownText;
    const renderNode = serializer.renderNodeToMarkdown?.bind(serializer);
    if (renderNode) {
      serializer.renderNodeToMarkdown = (node, parentNode, index, level, meta) =>
        node.type === 'paragraph' && (node.content ?? []).length === 0 && parentNode?.type === 'doc'
          ? ''
          : renderNode(node, parentNode, index, level, meta);
    }
  },
});
