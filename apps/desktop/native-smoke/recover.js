// Native smoke scenario: after a relaunch, the Morning entry written by write.js must come back
// exactly (text, mood 2, energy 3) from the SQLite journal, and the interface must stay English
// with an en-GB date even when the system language is French. Reports through window.__ttdSmoke.
(() => {
  // Deliberate multilingual synthetic fixture, identical to write.js.
  const EXPECTED_TEXT = 'Synthetic native smoke entry. Multilingual fixture: une journée paisible 🌿';
  const FRENCH_UI_WORDS = /\b(aujourd|enregistr|matin|soir|humeur|énergie|paramètres|corbeille|sauvegarde|écrire|annuler|mardi|dimanche|novembre)\w*/i;
  const EN_GB_LONG_DATE =
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/;
  const state = (window.__ttdSmoke = { done: false, scenario: 'recover' });
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
  const checkedScore = (legend) => {
    const group = [...document.querySelectorAll('fieldset')].find(
      (candidate) => text(candidate.querySelector('legend')) === legend,
    );
    const checked = group?.querySelector('input[type="radio"]:checked');
    return checked ? Number(checked.value) : null;
  };
  const journalPage = () => document.querySelector('[role="textbox"][aria-label^="Morning journal"]');

  (async () => {
    try {
      await waitFor(() => document.querySelector('nav[aria-label="Main"]'), 'the main navigation');
      const page = await waitFor(() => (text(journalPage()) ? journalPage() : null), 'the restored Morning page');
      const interfaceText = text(document.body).replace(text(page), ' ');
      const heading = text(document.querySelector('h1'));
      const frenchMatch = interfaceText.match(FRENCH_UI_WORDS);
      const result = {
        editorText: text(page),
        mood: checkedScore('Mood'),
        energy: checkedScore('How is my energy?'),
        heading,
        navigatorLanguage: navigator.language,
        documentLanguage: document.documentElement.lang,
        frenchInterfaceWord: frenchMatch ? frenchMatch[0] : null,
      };
      const ok =
        result.editorText === EXPECTED_TEXT &&
        result.mood === 2 &&
        result.energy === 3 &&
        EN_GB_LONG_DATE.test(heading) &&
        result.documentLanguage === 'en-GB' &&
        result.frenchInterfaceWord === null;
      Object.assign(state, { done: true, ok, ...result });
    } catch (error) {
      Object.assign(state, { done: true, ok: false, error: String(error), visibleText: text(document.body).slice(0, 600) });
    }
  })();
})();
