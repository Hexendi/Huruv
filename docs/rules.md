# Rules and dictionary

Huruv has two complementary layers:

1. **Rules** transliterate sounds and letter sequences (`sh`, `kh`, `3`, …).
2. **Dictionary entries** provide preferred spellings for whole words and
   phrases (`salam` → سلام, `chokran` → شكرا).

The dictionary wins over the phonetic fallback. Rules are applied longest-first
within a word, so a digraph is never split into two single letters.

## Normalization

Before matching, input is:

- lowercased;
- stripped of diacritics and accents (`chokrán` → `chokran`);
- normalized from ligatures (`œ` → `oe`, `æ` → `ae`, `ß` → `ss`);
- converted to straight apostrophes;
- trimmed and collapsed to single spaces.

Arabic text is preserved. Matching is case-insensitive and accent-insensitive.

## Built-in rules

Multi-character sequences are matched before single characters:

| Latin | Arabic | Latin | Arabic |
| --- | --- | --- | --- |
| `tch` | تش | `ch` | ش |
| `sh` | ش | `kh` | خ |
| `gh` | غ | `th` | ث |
| `dh` | ذ | `ph` | ف |
| `ck` | ك | `qu` | ك |
| `dj` | ج | `eau` | و |
| `aa` | ا | `ee` / `ii` | ي |
| `oo` / `ou` / `au` | و | `'` | ع |

Single-letter consonants:

| Latin | Arabic | Latin | Arabic |
| --- | --- | --- | --- |
| `b` / `p` | ب | `t` | ت |
| `j` | ج | `g` / `gh` | غ |
| `d` | د | `r` | ر |
| `z` | ز | `s` | س |
| `f` / `v` | ف | `q` | ق |
| `k` / `c` / `ck` / `qu` | ك | `l` | ل |
| `m` | م | `n` | ن |
| `h` | ه | `w` / `ou` / `oo` | و |
| `y` / `ee` / `ii` | ي | `x` | كس |

Chat language numbers (can be disabled in settings):

| Digit | Arabic | Digit | Arabic |
| --- | --- | --- | --- |
| `2` | أ | `3` | ع |
| `4` | ذ | `5` | خ |
| `6` | ط | `7` | ح |
| `8` | ظ | `9` | ق |

In fallback output `a` becomes alif `ا`, including at the start of a word.
Dictionary entries can override this with a short-vowel spelling, and the
candidate generator adds a no-alif reading for ambiguous unknown words, so
`mohamed` → محمد works while `bab` → باب still gets its long vowel. `e` is
skipped. `i`, `o` and `u` are written as long vowels only where the heuristic
recognizes a final syllable; otherwise they are treated as short vowels and
left unwritten.

A doubled input letter is written twice (`dd` → `دد`); Huruv does not add
shadda from doubled letters. This fallback is approximate; the dictionary is
the preferred path for common words.

## Darija phrase corpus

The supplied Darija regression corpus lives at
[`src/engine/data/darija-dataset.json`](../src/engine/data/darija-dataset.json).
It contains full phrases plus individual word spellings. Phrase entries win
over the built-in dictionary, and word entries win over the phonetic fallback.
The corpus is also exercised by `tests/dataset.test.ts` so a rule change cannot
silently break a known phrase.

## Dictionary format

The sample dictionary is
[`src/engine/data/dictionary.json`](../src/engine/data/dictionary.json):

```json
{
  "salam": ["سلام"],
  "marhba": ["مرحبا", "مرحباً"],
  "sabah el khir": ["صباح الخير"]
}
```

- Keys are normalized Latin words or phrases.
- Values are arrays of Arabic spellings.
- The first spelling is the preferred spelling.
- The remaining spellings are shown as suggestions in Suggestions mode.
- A custom entry is merged in front of a built-in entry, so it becomes the
  preferred spelling without discarding the built-in alternatives.
- Multi-word keys are matched only in full-text conversion (the engine API)
  and when a complete phrase is available to the content script.
  Incremental typing still commits each word on its own; see
  [limitations](limitations.md).

## Adding rules in the popup

Open the popup's **Rules & dictionary** tab and use **Custom rules**. One rule
per line:

```text
# Comments start with #
ch => ش
kh => خ
7  => ح
```

Accepted separators are `=>`, `=`, `:` and `→`. The source must be Latin
letters/digits and cannot contain spaces. The replacement can contain Arabic or
literal punctuation. Custom rules override built-in rules with the same source.
Invalid lines are reported in the popup and ignored; all valid lines still
apply.

The parser normalizes sources, so `CH` and `ch` target the same rule.

## Adding words in the popup

Open the popup's **Rules & dictionary** tab and use **Custom words**. One entry
per line:

```text
marhba = مرحبا | مرحباً
sabah el khir = صباح الخير
```

- Use `=`, `:` or `→` between the Latin key and the Arabic spelling.
- Separate alternative spellings with `|`.
- Keys may contain Latin letters, digits, apostrophes, and single spaces.
- At least one spelling must contain Arabic letters.
- Invalid lines are reported and ignored.
- Settings are stored locally in `chrome.storage.local` under
  `arabictype.settings.v1`.

## API example

The engine has no browser dependencies:

```ts
import { Transliterator } from './src/engine';

const engine = new Transliterator({
  numeric: true,
  skipEnglish: true,
  dictionary: {
    salam: ['سَلَام', 'سلام'],
  },
  rules: [{ from: 'ch', to: 'ش' }],
});

engine.transliterateWord('salam'); // 'سَلَام'
engine.transliterateText('salam, chokran!'); // 'سَلَام, شكرا!'
engine.evaluate('marhba').candidates; // dictionary alternatives + phonetic hint
engine.lookupPhrase('sabah el khir'); // dictionary-only phrase lookup
```

`transliterateText` preserves punctuation, whitespace, line breaks, existing
Arabic text, and common English words that are intentionally skipped.
`evaluate` never throws: unsupported input returns `convertible: false` with a
`reason` such as `english`, `numeric-disabled`, or `untransliterable`.

## Tests

```bash
npm test
```

The suite covers matching order, chat numbers, normalization, dictionary
precedence, phrase lookup, mixed text, caret helpers, custom configuration
parsing, and settings behavior. Add a test whenever you change a rule or a
matching assumption.

## Search matching (engine API)

`ArabicSearchIndex` (exported from `src/engine`) indexes normalized Arabic text
and accepts both Arabic and Latin queries. It applies the same dictionary and
rules as the rest of Huruv, then matches in layers:

1. exact token or phrase;
2. prefix (useful while the user is still typing);
3. partial substring;
4. fuzzy typo matching (edit distance 1–2), ranked below every exact result.

Digits are preserved during normalization, so `2`, `3`, `4`, `5`, `6`, `7` and
`9` keep their letter values. Arabic diacritics, tatweel, alef/ya variants and
ta marbuta variations are normalized. Latin queries are expanded with the
configured transliteration, `al`/`el`/`2l` article variants, and alternative
spellings from the dictionary. The index is local and dependency-free.

```ts
const index = createArabicSearchIndex(questions);
index.search('mu7ammad'); // → questions containing محمد
index.search('5adija');   // → questions containing خديجة
index.search('2l9uran');  // → questions containing القرآن
```
