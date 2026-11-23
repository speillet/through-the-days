import { createElement, Fragment, type ReactNode } from 'react';
import type { JSONContent } from '@tiptap/core';

/** React escapes every text node. No saved HTML, URLs, images or scripts are interpreted. */
export function JournalDocument({ document }: { document: JSONContent }) {
  function render(node: JSONContent, key: number): ReactNode {
    const content = node.content?.map(render);
    if (node.type === 'text') {
      let text: ReactNode = node.text ?? '';
      for (const mark of node.marks ?? []) {
        const tag = (
          { bold: 'strong', italic: 'em', strike: 's', underline: 'u', code: 'code' } as Record<
            string,
            string
          >
        )[mark.type];
        if (tag) text = createElement(tag, null, text);
      }
      return <Fragment key={key}>{text}</Fragment>;
    }
    if (node.type === 'doc') return <Fragment key={key}>{content}</Fragment>;
    if (node.type === 'hardBreak') return <br key={key} />;
    if (node.type === 'horizontalRule') return <hr key={key} />;
    if (node.type === 'codeBlock')
      return (
        <pre key={key}>
          <code>{content}</code>
        </pre>
      );
    if (node.type === 'heading') {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 2));
      return createElement(`h${level}`, { key }, content);
    }
    const tag =
      (
        {
          paragraph: 'p',
          bulletList: 'ul',
          orderedList: 'ol',
          listItem: 'li',
          blockquote: 'blockquote',
        } as Record<string, string>
      )[node.type ?? ''] ?? 'div';
    return createElement(
      tag,
      { key, ...(tag === 'ol' ? { start: Number(node.attrs?.start) || 1 } : {}) },
      content,
    );
  }
  return <div className="journal-document">{render(document, 0)}</div>;
}
