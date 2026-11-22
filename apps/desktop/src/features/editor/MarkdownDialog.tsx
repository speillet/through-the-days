// A read-only Markdown projection of the current document, for review or copying.
// The Tiptap document stays the only editable version.

import { Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';

export function MarkdownDialog({ markdown, onClose }: { markdown: string; onClose(): void }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  return (
    <Dialog
      open
      title="Markdown"
      description="A read-only copy of this entry in Markdown. Edit the entry itself to change it."
      onClose={onClose}
      className="markdown-dialog"
      footer={
        <>
          <Button variant="secondary" icon={<Copy size={15} />} onClick={() => void copyMarkdown()}>
            Copy Markdown
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      {markdown.trim() === '' ? (
        <p className="markdown-dialog__empty">Nothing written yet.</p>
      ) : (
        <pre className="markdown-dialog__text" tabIndex={0} aria-label="Markdown text">
          {markdown}
        </pre>
      )}
      {copy === 'copied' ? <Notice tone="success">Copied to the clipboard.</Notice> : null}
      {copy === 'failed' ? (
        <Notice tone="warning">Couldn't copy automatically. Select the text and press ⌘C.</Notice>
      ) : null}
    </Dialog>
  );
}
