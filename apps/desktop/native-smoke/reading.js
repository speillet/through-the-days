// Native reading journey over the throwaway SQLite journal created by write.js.
(() => {
  const WRITING = 'Synthetic native smoke entry. Multilingual fixture: une journée paisible 🌿';
  const NOTES = 'Synthetic native weekly reflection to restore.';
  const MILESTONE = 'Synthetic native milestone';
  const state = (window.__ttdSmoke = { done: false, scenario: 'reading' });
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
  const button = (name) => [...document.querySelectorAll('button')].find((element) => text(element) === name || element.getAttribute('aria-label') === name);
  const field = (name) => [...document.querySelectorAll('input,textarea')].find((element) => [...(element.labels ?? [])].some((label) => text(label) === name));
  function fill(element, value) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
  async function open(name) {
    (await waitFor(() => button(name), name)).click();
    await waitFor(() => text(document.querySelector('h1')) === name, `${name} heading`);
  }
  (async () => {
    try {
      await waitFor(() => document.querySelector('nav[aria-label="Main"]'), 'navigation');
      await open('Calendar');
      (await waitFor(() => button('Read Morning in Book View'), 'Morning source')).click();
      await waitFor(() => text(document.querySelector('.book-page article')).includes(WRITING), 'complete saved writing');
      await waitFor(() => text(document.querySelector('.book-page article')).includes('Energy 3/10'), 'saved Book check-in');
      await open('Trends');
      await waitFor(() => text(document.body).includes('Mean 2/10, n=1') && text(document.body).includes('Mean 3/10, n=1'), 'native descriptive report');
      await open('Weekly Review');
      fill(await waitFor(() => field('Your notes'), 'weekly notes'), NOTES);
      await sleep(100);
      (await waitFor(() => button('Save notes'), 'Save notes')).click();
      await waitFor(() => [...document.querySelectorAll('[role="status"]')].some((element) => text(element) === 'Saved'), 'acknowledged notes');
      (await waitFor(() => button('Recalculate local summary'), 'local summary')).click();
      await waitFor(() => text(document.querySelector('[aria-label="Optional local summary"]')).includes('1 recorded day out of 7'), 'local summary');
      await open('The Path So Far');
      await waitFor(() => text(document.body).includes(WRITING), 'timeline source');
      (await waitFor(() => button('Add milestone'), 'Add milestone')).click();
      fill(await waitFor(() => field('Title'), 'milestone title'), MILESTONE);
      await sleep(100);
      (await waitFor(() => button('Save milestone'), 'Save milestone')).click();
      await waitFor(() => [...document.querySelectorAll('h3')].some((element) => text(element) === MILESTONE), 'saved milestone');
      Object.assign(state, { done: true, ok: true, bookValues: true, report: true, weeklyNotes: true, milestone: true });
    } catch (error) {
      Object.assign(state, { done: true, ok: false, error: String(error), visibleText: text(document.body).slice(0, 600) });
    }
  })();
})();
