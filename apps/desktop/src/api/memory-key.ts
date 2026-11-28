// The Web Storage key of the browser preview's synthetic journal (memory.ts). It has a module
// of its own so the Playwright fixtures can import it: memory.ts loads the emotion vocabulary
// JSON, which Node cannot import without an import attribute.

export const MEMORY_STORAGE_KEY = 'ttd-preview-v1';
