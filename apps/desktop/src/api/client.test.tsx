import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider, isCommandError, isTauri, toCommandError, UNKNOWN_ERROR_MESSAGE, useApi } from './client';
import { createTestApi } from '../test/render';

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe('command errors', () => {
  it('keeps a native command error’s code and English message', () => {
    const error = { code: 'occupied', message: 'This date and slot already contain an entry. Choose a free slot.' };
    expect(toCommandError(error)).toEqual(error);
    expect(isCommandError(error)).toBe(true);
  });

  it('replaces anything else with a generic English message that leaks no details', () => {
    expect(toCommandError('invalid args `entry` for command `save_entry`')).toEqual({
      code: 'unknown',
      message: UNKNOWN_ERROR_MESSAGE,
    });
    expect(toCommandError(new Error('Synthetic stack trace'))).toEqual({ code: 'unknown', message: UNKNOWN_ERROR_MESSAGE });
    expect(toCommandError({ code: 'madeUp', message: 'Nope' }).code).toBe('unknown');
    expect(toCommandError({ code: 'storage', message: '' }).code).toBe('unknown');
    expect(toCommandError(null).code).toBe('unknown');
  });
});

describe('environment detection', () => {
  it('detects the Tauri webview by its internals object', () => {
    expect(isTauri()).toBe(false);
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    expect(isTauri()).toBe(true);
  });
});

describe('ApiProvider', () => {
  function Probe() {
    const api = useApi();
    return <p>{typeof api.saveEntry === 'function' ? 'Journal available' : 'Missing'}</p>;
  }

  it('provides the journal API to descendants', () => {
    render(
      <ApiProvider api={createTestApi()}>
        <Probe />
      </ApiProvider>,
    );
    expect(screen.getByText('Journal available')).toBeInTheDocument();
  });

  it('fails loudly when used outside the provider', () => {
    expect(() => render(<Probe />)).toThrow('useApi must be used inside <ApiProvider>.');
  });
});
