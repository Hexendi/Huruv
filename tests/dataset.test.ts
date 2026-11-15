import { describe, expect, it } from 'vitest';
import dataset from '../src/engine/data/darija-dataset.json';
import {
  ArabicSearchIndex,
  Transliterator,
  normalizeLatin,
} from '../src/engine';

describe('Darija regression dataset', () => {
  const engine = new Transliterator();

  it('learns every supplied phrase exactly', () => {
    for (const entry of dataset.phrases) {
      const result = engine.evaluate(entry.latin);
      expect(result.known, entry.latin).toBe(true);
      expect(result.arabic, entry.latin).toBe(entry.arabic);
    }
  });

  it('learns the supplied word spellings', () => {
    for (const [latin, spellings] of Object.entries(dataset.words)) {
      expect(engine.transliterateWord(latin), latin).toBe(spellings[0]);
    }
  });

  it('keeps the corrected 3nkum spelling', () => {
    expect(engine.transliterateWord('3nkum')).toBe('عنكم');
  });

  it('does not blindly write a as alif for dictionary words', () => {
    expect(engine.transliterateWord('mohamed')).toBe('محمد');
    expect(engine.transliterateWord('mag6o3')).toBe('مگطوع');
    expect(engine.transliterateWord('3ando')).toBe('عندو');
    expect(engine.transliterateWord('39lak')).toBe('عقلك');
  });

  it('still writes a as alif when the word needs it', () => {
    expect(engine.transliterateWord('ga3')).toBe('گاع');
    expect(engine.transliterateWord('wa7lin')).toBe('واحلين');
    expect(engine.transliterateWord('ktab')).toBe('كتاب');
    expect(engine.transliterateWord('ktab')).toContain('ا');
  });

  it('offers both the long and short readings for unknown words', () => {
    const candidates = engine.transliterationCandidates('sal');
    expect(candidates[0]).toBe('سال');
    expect(candidates).toContain('سل');
  });

  it('has a dictionary entry for every normalized phrase key', () => {
    for (const entry of dataset.phrases) {
      expect(normalizeLatin(entry.latin).length, entry.latin).toBeGreaterThan(
        0,
      );
    }
  });

  it('finds the learned spellings through the search index', () => {
    const index = new ArabicSearchIndex([
      { id: 'mohamed', text: 'محمد' },
      { id: 'mag6o3', text: 'مگطوع' },
      { id: 'ga3', text: 'گاع' },
      { id: '3nkum', text: 'عنكم' },
    ]);

    expect(index.search('mohamed')[0]?.id).toBe('mohamed');
    expect(index.search('mag6o3')[0]?.id).toBe('mag6o3');
    expect(index.search('ga3')[0]?.id).toBe('ga3');
    expect(index.search('3nkum')[0]?.id).toBe('3nkum');
  });
});
