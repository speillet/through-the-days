// Native smoke scenario: in the real application window, record Morning mood 2 and energy 3,
// choose "Write directly", type a synthetic multilingual fixture, press Command-S and wait for
// "Saved". The harness (src-tauri/src/smoke.rs, debug builds only) prints window.__ttdSmoke.
(() => {
  // Deliberate multilingual synthetic fixture: French words with accents and an emoji.
  const EXPECTED_TEXT = 'Synthetic native smoke entry. Multilingual fixture: une journée paisible 🌿';
  const state = (window.__ttdSmoke = { done: false, scenario: 'write' });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const text = (element) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  async function waitFor(probe, what, timeoutMs = 20000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = probe();
      if (value) return value;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${what}`);
  }
  const button = (name) =>
    [...document.querySelectorAll('button')].find(
      (candidate) => text(candidate) === name || candidate.getAttribute('aria-label') === name,
    );
  const radio = (legend, prefix) => {
    const group = [...document.querySelectorAll('fieldset')].find(
      (candidate) => text(candidate.querySelector('legend')) === legend,
    );
    return group
      ? [...group.querySelectorAll('input[type="radio"]')].find((input) =>
          (input.getAttribute('aria-label') ?? '').startsWith(prefix),
        )
      : undefined;
  };
  const journalPage = () => document.querySelector('[role="textbox"][aria-label^="Morning journal"]');
  const saveStatus = () =>
    [...document.querySelectorAll('[role="status"]')].map(text).find((value) => /^(Saving…|Saved|Couldn't save)$/.test(value));

  (async () => {
    try {
      await waitFor(() => document.querySelector('nav[aria-label="Main"]'), 'the main navigation');
      (await waitFor(() => radio('Mood', '2,'), 'the mood scale')).click();
      (await waitFor(() => radio('How is my energy?', '3,'), 'the energy scale')).click();
      (await waitFor(() => button('Write directly'), 'Write directly')).click();
      const page = await waitFor(journalPage, 'the Morning journal page');
      page.focus();
      document.execCommand('insertText', false, EXPECTED_TEXT);
      page.dispatchEvent(
        new KeyboardEvent('keydown', { key: 's', code: 'KeyS', metaKey: true, bubbles: true, cancelable: true }),
      );
      await waitFor(() => saveStatus() === 'Saved' && text(journalPage()) === EXPECTED_TEXT, 'the Saved state');
      Object.assign(state, {
        done: true,
        ok: true,
        editorText: text(journalPage()),
        saveStatus: saveStatus(),
        heading: text(document.querySelector('h1')),
        navigatorLanguage: navigator.language,
        documentLanguage: document.documentElement.lang,
        unavailableViews: [...document.querySelectorAll('[aria-disabled="true"]')].map(text),
      });
    } catch (error) {
      Object.assign(state, { done: true, ok: false, error: String(error), visibleText: text(document.body).slice(0, 600) });
    }
  })();
})();
