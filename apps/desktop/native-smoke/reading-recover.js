// Relaunch independently: authored reading records must return from native SQLite, not page memory.
(() => {
  const NOTES = 'Synthetic native weekly reflection to restore.';
  const MILESTONE = 'Synthetic native milestone';
  const state = (window.__ttdSmoke = { done: false, scenario: 'reading-recover' });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const text = (element) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  async function waitFor(probe, label) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const result = probe();
      if (result) return result;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${label}`);
  }
  async function open(name) {
    const target = await waitFor(() => [...document.querySelectorAll('button')].find((element) => text(element) === name), name);
    target.click();
    await waitFor(() => text(document.querySelector('h1')) === name, `${name} heading`);
  }
  (async () => {
    try {
      await waitFor(() => document.querySelector('nav[aria-label="Main"]'), 'navigation');
      await open('Weekly Review');
      await waitFor(() => document.querySelector('textarea')?.value === NOTES, 'restored authored notes');
      await waitFor(() => text(document.querySelector('[aria-label="Optional local summary"]')).includes('1 recorded day out of 7'), 'restored current summary');
      await open('The Path So Far');
      await waitFor(() => [...document.querySelectorAll('h3')].some((element) => text(element) === MILESTONE), 'restored private milestone');
      Object.assign(state, { done: true, ok: true, weeklyNotesRecovered: true, milestoneRecovered: true, documentLanguage: document.documentElement.lang });
    } catch (error) {
      Object.assign(state, { done: true, ok: false, error: String(error), visibleText: text(document.body).slice(0, 600) });
    }
  })();
})();
