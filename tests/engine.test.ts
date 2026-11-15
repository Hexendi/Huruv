import { describe, expect, it } from 'vitest';
import {
  Transliterator,
  getPhraseWindowBeforeCaret,
  getWordBeforeCaret,
  normalizeLatin,
  parseDictionary,
  parseRules,
  tokenize,
} from '../src/engine';

describe('transliteration rules', () => {
  const engine = new Transliterator();

  it('maps multi-character digraphs longest-first', () => {
    expect(engine.transliterateWord('shams')).toBe('شمس');
    expect(engine.transliterateWord('khobz')).toBe('خبز');
    expect(engine.transliterateWord('gharb')).toBe('غرب');
    expect(engine.transliterateWord('tch')).toBe('تش');
  });

  it('supports Arabic chat digits', () => {
    expect(engine.transliterateWord('3arbi')).toBe('عربي');
    expect(engine.transliterateWord('7na')).toBe('حنا');
    expect(engine.transliterateWord('9alb')).toBe('قلب');
    expect(engine.transliterateWord('8lm')).toBe('ظلم');
  });

  it('can disable numeric conventions', () => {
    const noDigits = new Transliterator({ numeric: false });
    const result = noDigits.evaluate('3la');
    expect(result.convertible).toBe(false);
    expect(result.reason).toBe('numeric-disabled');
    expect(noDigits.transliterateText('3la')).toBe('3la');
  });

  it('lets custom rules override built-in rules', () => {
    const custom = new Transliterator({
      rules: [{ from: 'sh', to: 'ص' }],
    });
    expect(custom.transliterateWord('shab')).toBe('صاب');
  });

  it('matches accents and case through normalization', () => {
    expect(engine.transliterateWord('CHOKRAN')).toBe('شكرا');
    expect(engine.transliterateWord('chokrán')).toBe('شكرا');
    expect(normalizeLatin('  ÉCOLE  ')).toBe('ecole');
  });
});

describe('dictionary and suggestions', () => {
  const engine = new Transliterator();

  it('returns the prompt examples with correct spellings', () => {
    expect(engine.transliterateWord('salam')).toBe('سلام');
    expect(engine.transliterateWord('marhba')).toBe('مرحبا');
    expect(engine.transliterateWord('chokran')).toBe('شكرا');
    expect(engine.transliterateWord('tachevrit')).toBe('تاشفريت');
  });

  it('exposes preferred and alternative spellings', () => {
    const result = engine.evaluate('marhba');
    expect(result.known).toBe(true);
    expect(result.arabic).toBe('مرحبا');
    expect(result.candidates.map((candidate) => candidate.arabic)).toContain(
      'مرحباً',
    );
  });

  it('lets custom dictionary entries take precedence', () => {
    const custom = new Transliterator({
      dictionary: { salam: ['سَلَام'] },
    });
    const result = custom.evaluate('salam');
    expect(result.arabic).toBe('سَلَام');
    expect(result.candidates.length).toBeGreaterThan(1);
  });

  it('recognizes multi-word phrases in full text', () => {
    expect(engine.lookupPhrase('sabah el khir')[0]?.arabic).toBe('صباح الخير');
    expect(engine.transliterateText('sabah el khir')).toBe('صباح الخير');
    expect(engine.transliterateText('salam alaikum')).toBe('سلام عليكم');
  });

  it('detects dictionary phrase prefixes for deferred conversion', () => {
    expect(engine.hasPhrasePrefix('sabah')).toBe(true);
    expect(engine.hasPhrasePrefix('sabah el')).toBe(true);
    expect(engine.hasPhrasePrefix('sabah el khir')).toBe(false);
    expect(engine.hasPhrasePrefix('salam')).toBe(true);
    expect(engine.hasPhrasePrefix('hello')).toBe(false);
    expect(engine.hasPhrasePrefix('sabah,')).toBe(false);
  });

  it('only returns multi-word entries from phrase lookup', () => {
    expect(engine.lookupPhrase('salam')).toEqual([]);
    expect(engine.lookupPhrase('sabah el khir')).toEqual([
      { arabic: 'صباح الخير', source: 'dictionary' },
    ]);
  });

  it('recognizes phrases beside punctuation and mixed content', () => {
    expect(engine.transliterateText('sabah el khir, salam!')).toBe(
      'صباح الخير, سلام!',
    );
    expect(engine.transliterateText('the sabah el khir')).toBe(
      'the صباح الخير',
    );
  });

  it('leaves common English words alone by default', () => {
    const result = engine.evaluate('the');
    expect(result.convertible).toBe(false);
    expect(result.reason).toBe('english');
    expect(engine.transliterateText('the salam')).toBe('the سلام');
  });

  it('can transliterate English-looking words when skipping is off', () => {
    const all = new Transliterator({ skipEnglish: false });
    expect(all.evaluate('the').convertible).toBe(true);
  });
});

describe('fallback transliteration', () => {
  const engine = new Transliterator();

  it('produces unvocalized Arabic for unknown words', () => {
    expect(engine.transliterateWord('kitab')).toBe('كتاب');
    expect(engine.transliterateWord('walid')).toBe('وليد');
    expect(engine.transliterateWord('mzyan')).toBe('مزيان');
    expect(engine.transliterateWord('bzaf')).toBe('بزاف');
  });

  it('does not convert numbers or Arabic text', () => {
    expect(engine.evaluate('123').convertible).toBe(false);
    expect(engine.evaluate('3').convertible).toBe(false);
    expect(engine.evaluate('سلام').convertible).toBe(false);
  });

  it('keeps mixed Arabic and Latin text intact', () => {
    expect(engine.transliterateText('salam سلام chokran')).toBe(
      'سلام سلام شكرا',
    );
  });
});

describe('text handling', () => {
  const engine = new Transliterator();

  it('preserves punctuation, spacing and line breaks', () => {
    expect(engine.transliterateText('salam, marhba!\nchokran?')).toBe(
      'سلام, مرحبا!\nشكرا?',
    );
    expect(engine.transliterateText('  salam   chokran  ')).toBe(
      '  سلام   شكرا  ',
    );
  });

  it('tokenizes Latin words and separators', () => {
    const tokens = tokenize('salam, 3likum!');
    expect(tokens.map((token) => token.type)).toEqual([
      'word',
      'other',
      'word',
      'other',
    ]);
    expect(tokens.map((token) => token.value)).toEqual([
      'salam',
      ', ',
      '3likum',
      '!',
    ]);
  });

  it('finds the word before a caret', () => {
    expect(getWordBeforeCaret('salam marhba', 13)).toEqual({
      start: 6,
      end: 12,
      value: 'marhba',
    });
    expect(getWordBeforeCaret('salam ', 6)).toBeNull();
    expect(getWordBeforeCaret('salam chok', 10)).toEqual({
      start: 6,
      end: 10,
      value: 'chok',
    });
  });

  it('finds multi-word phrase windows without crossing punctuation', () => {
    const phrase = getPhraseWindowBeforeCaret('sabah el khir', 14, 4);
    expect(phrase?.text).toBe('sabah el khir');
    expect(phrase?.lastWord).toBe('khir');

    const broken = getPhraseWindowBeforeCaret('sabah, el', 9, 4);
    expect(broken?.text).toBe('el');
  });
});

describe('conservative conversion', () => {
  const engine = new Transliterator();

  it('leaves unknown Latin prose untouched', () => {
    expect(
      engine.transliterateTextConservative('hello world from huruv'),
    ).toBe('hello world from huruv');
  });

  it('still converts dictionary words and chat-digit spellings', () => {
    expect(engine.transliterateTextConservative('hello kitab')).toBe(
      'hello كتاب',
    );
    expect(engine.transliterateTextConservative('hello 3arbi')).toBe(
      'hello عربي',
    );
  });

  it('merges article + noun pairs', () => {
    expect(engine.transliterateText('el khir')).toBe('الخير');
    expect(engine.transliterateText('al khir')).toBe('الخير');
    expect(engine.transliterateText('2l khir')).toBe('الخير');
    expect(engine.transliterateTextConservative('hello el khir')).toBe(
      'hello الخير',
    );
  });

  it('does not rewrite ordinary English that follows an article', () => {
    expect(engine.transliterateTextConservative('el hello')).toBe('el hello');
  });

  it('detects English context before an unknown word', () => {
    expect(engine.isLikelyEnglishContext('hello world', 'world')).toBe(true);
    expect(engine.isLikelyEnglishContext('this is fine', 'fine')).toBe(true);
    expect(engine.isLikelyEnglishContext('hello kitab', 'kitab')).toBe(false);
    expect(engine.isLikelyEnglishContext('hello 3arbi', '3arbi')).toBe(false);
    expect(engine.isLikelyEnglishContext('world', 'world')).toBe(false);
  });
});

describe('phrase hold decisions', () => {
  const engine = new Transliterator();

  it('holds common phrase starters but not standalone common words', () => {
    expect(engine.shouldWaitForPhrase('sabah')).toBe(true);
    expect(engine.shouldWaitForPhrase('sabah el')).toBe(true);
    expect(engine.shouldWaitForPhrase('sabah el khir')).toBe(false);
    expect(engine.shouldWaitForPhrase('salam')).toBe(false);
    expect(engine.shouldWaitForPhrase('hello')).toBe(false);
  });

  it('does not hold text that cannot start a known phrase', () => {
    expect(engine.shouldWaitForPhrase('khir')).toBe(false);
    expect(engine.shouldWaitForPhrase('')).toBe(false);
  });
});

describe('custom configuration parsing', () => {
  it('parses valid rules and reports invalid lines', () => {
    const result = parseRules(
      [
        '# comment',
        'ch => ش',
        'kh : خ',
        '7 = ح',
        'broken line',
        ' => empty',
      ].join('\n'),
    );
    expect(result.rules).toEqual([
      { from: 'ch', to: 'ش' },
      { from: 'kh', to: 'خ' },
      { from: '7', to: 'ح' },
    ]);
    expect(result.errors).toHaveLength(2);
  });

  it('parses dictionary alternatives and validates Arabic output', () => {
    const result = parseDictionary(
      [
        'marhba = مرحبا | مرحباً',
        'sabah el khir = صباح الخير',
        'oops = latin',
        'broken',
      ].join('\n'),
    );
    expect(result.entries.marhba).toEqual(['مرحبا', 'مرحباً']);
    expect(result.entries['sabah el khir']).toEqual(['صباح الخير']);
    expect(result.errors).toHaveLength(2);
  });
});
