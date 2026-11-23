// Shared Vitest setup: DOM matchers, cleanup between tests, and the small browser
// APIs that jsdom lacks but ProseMirror/Tiptap and the shell call.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    // Storage may be unavailable in a test that stubs it.
  }
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  root.removeAttribute('data-reduce-motion');
});

function emptyRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

function emptyRectList(): DOMRectList {
  const list: DOMRect[] = [];
  return Object.assign(list, { item: () => null }) as unknown as DOMRectList;
}

if (typeof Range !== 'undefined') {
  if (!Range.prototype.getClientRects) Range.prototype.getClientRects = emptyRectList;
  if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = emptyRect;
}

if (!Element.prototype.getClientRects) Element.prototype.getClientRects = emptyRectList;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function scrollIntoView() {};
if (!document.elementFromPoint) document.elementFromPoint = () => null;

if (typeof window.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
