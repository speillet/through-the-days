import { describe, expect, it } from 'vitest';
import { textSizeStep } from './textSize';

function command(key: string, code: string) {
  return { key, code, metaKey: true, ctrlKey: false, altKey: false };
}

describe('textSizeStep', () => {
  it('steps by the character on a US keyboard', () => {
    expect(textSizeStep(command('=', 'Equal'))).toBe(1);
    expect(textSizeStep(command('+', 'Equal'))).toBe(1);
    expect(textSizeStep(command('-', 'Minus'))).toBe(-1);
    expect(textSizeStep(command('0', 'Digit0'))).toBe(0);
    expect(textSizeStep(command('+', 'NumpadAdd'))).toBe(1);
    expect(textSizeStep(command('-', 'NumpadSubtract'))).toBe(-1);
    expect(textSizeStep(command('0', 'Numpad0'))).toBe(0);
  });

  it('steps by the character on a French keyboard, whatever key sits there on a US one', () => {
    // The key labelled "-" is where US keyboards have "=", and ")" is where they have "-".
    expect(textSizeStep(command('-', 'Equal'))).toBe(-1);
    expect(textSizeStep(command(')', 'Minus'))).toBeNull();
    // "=" and "+" share the key where US keyboards have "/".
    expect(textSizeStep(command('=', 'Slash'))).toBe(1);
    expect(textSizeStep(command('+', 'Slash'))).toBe(1);
    // Deliberate multilingual synthetic fixture: the key that holds 0 types "à" without Shift.
    expect(textSizeStep(command('à', 'Digit0'))).toBe(0);
  });

  it('falls back to the key position when the key types no ASCII character', () => {
    // Deliberate multilingual synthetic fixture: on the Thai Kedmanee layout, the keys
    // where US keyboards have "-" and "=".
    expect(textSizeStep(command('ข', 'Minus'))).toBe(-1);
    expect(textSizeStep(command('ช', 'Equal'))).toBe(1);
    expect(textSizeStep(command('Unidentified', 'Equal'))).toBe(1);
    expect(textSizeStep(command('ข', 'KeyA'))).toBeNull();
  });

  it('needs Command or Control, without Option', () => {
    expect(textSizeStep({ ...command('-', 'Minus'), metaKey: false })).toBeNull();
    expect(textSizeStep({ ...command('-', 'Minus'), metaKey: false, ctrlKey: true })).toBe(-1);
    expect(textSizeStep({ ...command('-', 'Minus'), altKey: true })).toBeNull();
    expect(textSizeStep(command('a', 'KeyA'))).toBeNull();
  });
});
