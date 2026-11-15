import { describe, expect, it } from 'vitest';
import {
  ArabicSearchIndex,
  NUMERIC_RULES,
  Transliterator,
  createArabicSearchIndex,
  editDistance,
  normalizeArabic,
  normalizeLatin,
  normalizeLatinSearch,
  tokenizeSearchQuery,
} from '../src/engine';

describe('custom transliteration conventions', () => {
  const engine = new Transliterator();

  it('converts the regression examples', () => {
    expect(engine.transliterateWord('mu7ammad')).toBe('محمد');
    expect(engine.transliterateWord('5adija')).toBe('خديجة');
    expect(engine.transliterateWord('2l9uran')).toBe('القرآن');
  });

  it('maps g and gh to غ', () => {
    expect(engine.transliterateWord('g')).toBe('غ');
    expect(engine.transliterateWord('gh')).toBe('غ');
    expect(engine.transliterateWord('gharb')).toBe('غرب');
    expect(engine.transliterateWord('garb')).toBe('غرب');
  });

  it('maps 4 to ذ, never to ش', () => {
    const rule = NUMERIC_RULES.find((entry) => entry.from === '4');
    expect(rule?.to).toBe('ذ');
    expect(engine.literalFor('4')).toBe('ذ');
    expect(engine.transliterateWord('4hb')).toBe('ذهب');
    expect(engine.transliterateWord('4hb')).not.toContain('ش');
  });

  it('keeps the digit mappings configurable', () => {
    const custom = new Transliterator({ rules: [{ from: '4', to: 'ش' }] });
    expect(custom.literalFor('4')).toBe('ش');
  });

  it('treats 5 and kh as the same letter خ', () => {
    expect(engine.transliterateWord('khobz')).toBe('خبز');
    expect(engine.transliterateWord('5obz')).toBe('خبز');
    expect(engine.transliterateWord('khdija')).toBe(
      engine.transliterateWord('5dija'),
    );
  });

  it('keeps the other custom digits intact', () => {
    expect(engine.transliterateWord('7na')).toBe('حنا');
    expect(engine.transliterateWord('9alb')).toBe('قلب');
    expect(engine.transliterateWord('3arbi')).toBe('عربي');
    expect(engine.transliterateWord('8lm')).toBe('ظلم');
  });

  it('writes a doubled letter twice instead of a shadda', () => {
    expect(engine.transliterateWord('mudd')).toBe('مدد');
    expect(engine.transliterateWord('2ddedw')).toBe('أدددو');
    expect(engine.transliterateWord('2ddedw')).not.toContain('ّ');
  });

  it('writes a as alif unless the learned spelling says it is short', () => {
    expect(engine.transliterateWord('bab')).toBe('باب');
    expect(engine.transliterateWord('dar')).toBe('دار');
    expect(engine.transliterateWord('katab')).toBe('كاتاب');
    expect(engine.transliterateWord('mohamed')).toBe('محمد');
    expect(engine.transliterateWord('mag6o3')).toBe('مگطوع');
  });

  it('produces the ta marbuta and long vowel in 5adija', () => {
    const result = engine.transliterateWord('5adija');
    expect(result).toContain('ة');
    expect(result).toBe('خديجة');
  });

  it('uses the definite article for 2l-/al-/el- words', () => {
    expect(engine.transliterateWord('2l9uran')).toBe('القرآن');
    expect(engine.transliterateWord('al9uran')).toContain('ال');
    expect(engine.transliterateWord('el9uran')).toContain('ال');
  });

  it('generates ranked candidates for ambiguous letters', () => {
    const g = engine.transliterationCandidates('g');
    expect(g[0]).toBe('غ');
    expect(g).toContain('ج');

    const h = engine.transliterationCandidates('h');
    expect(h).toContain('ه');
    expect(h).toContain('ح');
  });
});

describe('normalization', () => {
  it('lowercases, trims, collapses spaces and removes accents', () => {
    expect(normalizeLatin('  ÉCOLE  ')).toBe('ecole');
    expect(normalizeLatinSearch('  5A-DIJA  ')).toBe('5a dija');
    expect(normalizeLatin('5A-DIJA')).toBe('5adija');
  });

  it('strips Arabic diacritics, tatweel and unifies letter variants', () => {
    expect(normalizeArabic('مُحَمَّد')).toBe('محمد');
    expect(normalizeArabic('مـــحمد')).toBe('محمد');
    expect(normalizeArabic('أحمد')).toBe('احمد');
    expect(normalizeArabic('إسلام')).toBe('اسلام');
    expect(normalizeArabic('خديجة')).toBe('خديجه');
    expect(normalizeArabic('القرآن')).toBe('القران');
  });

  it('does not remove meaningful digits', () => {
    expect(normalizeArabic('3لا 5بار')).toBe('3لا 5بار');
    expect(normalizeLatinSearch('mu7ammad')).toBe('mu7ammad');
  });

  it('tokenizes mixed Arabic and Latin queries', () => {
    expect(tokenizeSearchQuery('محمد 5adija')).toEqual([
      { kind: 'arabic', value: 'محمد' },
      { kind: 'latin', value: '5adija' },
    ]);
  });
});

describe('Arabic search index', () => {
  const corpus = [
    { id: 'muhammad', text: 'من هو محمد رسول الله' },
    { id: 'khadija', text: 'خديجة بنت خويلد زوجة النبي' },
    { id: 'quran', text: 'القرآن الكريم كتاب الله' },
    { id: 'fiqh', text: 'مسألة في الفقه المالكي' },
    { id: 'salah', text: 'كيف أصلي الصلاة' },
    { id: 'ghar', text: 'غار حراء' },
    { id: 'dhahab', text: 'ذهب إلى السوق' },
    { id: 'greeting', text: 'صباح الخير والبركة' },
    { id: 'ahmad', text: 'أحمد بن حنبل' },
    { id: 'unrelated', text: 'تفاحة حمراء' },
  ];

  const index = createArabicSearchIndex(corpus);

  it('finds Arabic documents from Latin transliterations', () => {
    expect(index.search('mu7ammad')[0]?.id).toBe('muhammad');
    expect(index.search('5adija')[0]?.id).toBe('khadija');
    expect(index.search('2l9uran')[0]?.id).toBe('quran');
  });

  it('finds the same documents with alternative spellings', () => {
    expect(index.search('mohamed')[0]?.id).toBe('muhammad');
    expect(index.search('mohammed')[0]?.id).toBe('muhammad');
    expect(index.search('khadijah')[0]?.id).toBe('khadija');
    expect(index.search('alquran')[0]?.id).toBe('quran');
    expect(index.search('elquran')[0]?.id).toBe('quran');
    expect(index.search('quran')[0]?.id).toBe('quran');
  });

  it('finds documents from Arabic queries', () => {
    expect(index.search('خديجة')[0]?.id).toBe('khadija');
    expect(index.search('مُحَمَّد')[0]?.id).toBe('muhammad');
    expect(index.search('القرآن')[0]?.id).toBe('quran');
  });

  it('handles uppercase letters and extra spacing', () => {
    expect(index.search('  MU7AMMAD  ')[0]?.id).toBe('muhammad');
    expect(index.search('5A-DIJA')[0]?.id).toBe('khadija');
    expect(index.search('  khadiija   ')[0]?.id).toBe('khadija');
  });

  it('handles mixed Arabic and Latin queries', () => {
    const hits = index.search('محمد mu7ammad');
    expect(hits[0]?.id).toBe('muhammad');
    expect(hits[0]?.coverage).toBe(1);
  });

  it('handles multi-word phrases and optional spaces in words', () => {
    expect(index.search('sabah el khir')[0]?.id).toBe('greeting');
    expect(index.search('mu7 ammad')[0]?.id).toBe('muhammad');
  });

  it('reads 2 as hamza / alif-with-hamza', () => {
    expect(index.search('2hmad')[0]?.id).toBe('ahmad');
    expect(index.search('ahmad')[0]?.id).toBe('ahmad');
  });

  it('matches single meaningful digits and letters', () => {
    expect(index.search('4')[0]?.id).toBe('dhahab');
    expect(index.search('g')[0]?.id).toBe('ghar');
    expect(index.search('gh')[0]?.id).toBe('ghar');
    expect(index.search('5')[0]?.id).toBe('khadija');
    expect(index.search('kh')[0]?.id).toBe('khadija');
  });

  it('ranks exact matches above prefix, partial and fuzzy matches', () => {
    const exactIndex = new ArabicSearchIndex([
      { id: 'exact', text: 'محمد' },
      { id: 'prefix', text: 'محمدون' },
      { id: 'fuzzy', text: 'محمود' },
    ]);
    expect(exactIndex.search('محمد').map((hit) => hit.id)).toEqual([
      'exact',
      'prefix',
      'fuzzy',
    ]);
  });

  it('never lets a full fuzzy match outrank a correct exact match', () => {
    const exactIndex = new ArabicSearchIndex([
      { id: 'exact-one-word', text: 'محمد' },
      { id: 'fuzzy-both-words', text: 'محمود خديه' },
    ]);
    const hits = exactIndex.search('محمد خديجة');
    expect(hits[0]?.id).toBe('exact-one-word');
  });

  it('does not return unrelated documents', () => {
    const hits = index.search('quran');
    expect(hits.map((hit) => hit.id)).not.toContain('unrelated');
    expect(hits.map((hit) => hit.id)).not.toContain('fiqh');
    expect(index.search('yyyyyy')).toEqual([]);
  });

  it('uses custom rules in the search layer', () => {
    const custom = new ArabicSearchIndex([{ id: 'shams', text: 'شمس' }], {
      rules: [{ from: '4', to: 'ش' }],
    });
    expect(custom.search('4')[0]?.id).toBe('shams');
  });

  it('can disable fuzzy matching', () => {
    const strict = new ArabicSearchIndex(
      [{ id: 'muhammad', text: 'محمد' }],
      { fuzzy: false },
    );
    expect(strict.search('yyyyyy')).toEqual([]);
    expect(strict.search('محمد')).toHaveLength(1);
  });

  it('exposes edit distance for debugging', () => {
    expect(editDistance('محمد', 'محمد')).toBe(0);
    expect(editDistance('محمد', 'محمود')).toBe(1);
    expect(editDistance('كتاب', 'كتب')).toBe(1);
  });
});
