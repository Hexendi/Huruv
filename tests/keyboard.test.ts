import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYBOARD_OPACITY,
  normalizeKeyboardOpacity,
} from '../src/shared/keyboard';

describe('keyboard opacity', () => {
  it('uses the default for missing or malformed values', () => {
    expect(normalizeKeyboardOpacity(undefined)).toBe(DEFAULT_KEYBOARD_OPACITY);
    expect(normalizeKeyboardOpacity(null)).toBe(DEFAULT_KEYBOARD_OPACITY);
    expect(normalizeKeyboardOpacity('nope')).toBe(DEFAULT_KEYBOARD_OPACITY);
  });

  it('accepts both fractional and percentage values', () => {
    expect(normalizeKeyboardOpacity(0.7)).toBe(0.7);
    expect(normalizeKeyboardOpacity(70)).toBe(0.7);
    expect(normalizeKeyboardOpacity('0.55')).toBe(0.55);
  });

  it('clamps values to the usable range', () => {
    expect(normalizeKeyboardOpacity(0.05)).toBe(0.35);
    expect(normalizeKeyboardOpacity(180)).toBe(1);
  });
});
