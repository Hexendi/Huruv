import {
  normalizeArabic,
  normalizeLatin,
  normalizeLatinSearch,
  tokenizeSearchQuery,
  type SearchQueryToken,
} from './text';
import { Transliterator } from './transliterator';

export interface SearchDocument {
  id: string;
  /** Arabic text (may also contain Latin words). */
  text: string;
  [key: string]: unknown;
}

export interface SearchHit {
  id: string;
  /** Higher is better. Exact matches always outrank fuzzy matches. */
  score: number;
  /** How much of the query was matched, from 0 to 1. */
  coverage: number;
  /** Normalized Arabic tokens that matched. */
  matched: string[];
  document: SearchDocument;
}

export interface SearchIndexOptions {
  transliterator?: Transliterator;
  /** Enable the last-resort typo layer. Defaults to true. */
  fuzzy?: boolean;
  /** Extra transliteration rules used only by this search index. */
  rules?: Array<{ from: string; to: string }>;
}

interface IndexedDocument {
  document: SearchDocument;
  normalized: string;
  tokens: string[];
  tokenSet: Set<string>;
}

type MatchKind = 'exact' | 'prefix' | 'partial' | 'fuzzy';

interface TokenMatch {
  kind: MatchKind;
  text: string;
  score: number;
}

/** Context variants for digits whose reading is not unique (2 = hamza/alif). */
const DIGIT_ALTERNATIVES: Record<string, string[]> = {
  '2': ['أ', 'ا', 'ء'],
};

// Deliberately steep gaps: a correct exact match must never be outranked by
// an approximate one merely because the approximate document matched more
// query words.
const MATCH_SCORES: Record<MatchKind, number> = {
  exact: 1000,
  prefix: 300,
  partial: 120,
  fuzzy: 30,
};

const ARABIC_DEFINITE_ARTICLE = 'ال';

/** Whole-token phrase containment; never matches inside another word. */
function containsPhrase(text: string, phrase: string): boolean {
  if (!phrase) return false;
  const padded = ` ${text} `;
  return padded.includes(` ${phrase} `);
}

function unique(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/** Number of single-character insertions/deletions/substitutions. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    [previous, current] = [current, previous];
  }

  return previous[b.length] ?? a.length;
}

/**
 * A small, dependency-free Arabic search index.
 *
 * It indexes normalized Arabic text and accepts either Arabic queries or
 * Latin-script queries written with the project's transliteration rules.
 * Matching is layered:
 *
 *   1. exact token / phrase,
 *   2. prefix (the user is still typing),
 *   3. partial substring,
 *   4. fuzzy typo matching (never above an exact match).
 */
export class ArabicSearchIndex {
  private readonly documents: IndexedDocument[] = [];
  private readonly transliterator: Transliterator;
  private readonly fuzzy: boolean;

  constructor(documents: SearchDocument[], options: SearchIndexOptions = {}) {
    this.transliterator =
      options.transliterator ??
      new Transliterator({ rules: options.rules ?? [] });
    this.fuzzy = options.fuzzy ?? true;

    for (const document of documents) {
      const normalized = normalizeArabic(document.text);
      const tokens = normalized.split(' ').filter(Boolean);
      this.documents.push({
        document,
        normalized,
        tokens,
        tokenSet: new Set(tokens),
      });
    }
  }

  get size(): number {
    return this.documents.length;
  }

  search(query: string, limit = 10): SearchHit[] {
    const queryTokens = this.buildQueryTokens(query);
    if (!queryTokens.length) return [];

    const phraseCandidates =
      queryTokens.length > 1 ? this.fullPhraseCandidates(query) : [];
    const hits: SearchHit[] = [];

    for (const indexed of this.documents) {
      const matched: string[] = [];
      let score = 0;

      for (const candidates of queryTokens) {
        const match = this.matchToken(candidates, indexed);
        if (!match) continue;
        matched.push(match.text);
        score += match.score;
      }

      const phrase = phraseCandidates.find((candidate) =>
        containsPhrase(indexed.normalized, candidate),
      );

      if (!matched.length && !phrase) continue;

      let coverage = queryTokens.length
        ? matched.length / queryTokens.length
        : 0;

      if (phrase) {
        // A contiguous phrase is much stronger than matching the same words
        // apart in different places.
        score += 800 + Math.min(40, phrase.length);
        coverage = 1;
        if (!matched.includes(phrase)) matched.push(phrase);
      }

      // Reward full-query coverage without letting a partial exact match
      // disappear behind a full fuzzy match.
      const coverageBonus = coverage === 1 ? 100 : 0;
      const finalScore = score * coverage + coverageBonus;

      hits.push({
        id: indexed.document.id,
        score: finalScore,
        coverage,
        matched,
        document: indexed.document,
      });
    }

    return hits
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.coverage !== a.coverage) return b.coverage - a.coverage;
        return a.id.localeCompare(b.id);
      })
      .slice(0, Math.max(1, limit));
  }

  /**
   * Full-query candidates used for a phrase bonus. This handles multi-word
   * dictionary phrases ("sabah el khir") and Latin input where the user put
   * an optional space inside a word ("mu7 ammad").
   */
  private fullPhraseCandidates(query: string): string[] {
    const parsed = tokenizeSearchQuery(query);
    if (parsed.length < 2) return [];

    const candidates = new Set<string>();
    const latin = parsed.filter((token) => token.kind === 'latin');
    const arabic = parsed.filter((token) => token.kind === 'arabic');

    if (latin.length === parsed.length) {
      const joined = latin.map((token) => token.value).join(' ');
      const joinedAlternatives =
        this.transliterator.transliterationCandidates(joined);
      for (const alternative of joinedAlternatives) {
        this.addWithArticle(normalizeArabic(alternative), candidates);
      }

      const compact = latin.map((token) => token.value).join('');
      if (compact !== joined) {
        for (const alternative of this.transliterator.transliterationCandidates(
          compact,
        )) {
          this.addWithArticle(normalizeArabic(alternative), candidates);
        }
      }
    }

    if (arabic.length === parsed.length) {
      this.addWithArticle(normalizeArabic(query), candidates);
    }

    return unique(candidates);
  }

  /**
   * Builds the normalized Arabic alternatives for every query token. Latin
   * tokens are transliterated with the project rules and expanded with the
   * common article (al-/el-/2l-) variants.
   */
  private buildQueryTokens(query: string): string[][] {
    const parsed = tokenizeSearchQuery(query);
    const result: string[][] = [];

    for (const token of parsed) {
      const candidates =
        token.kind === 'arabic'
          ? this.arabicCandidates(token)
          : this.latinCandidates(token);
      if (candidates.length) result.push(candidates);
    }

    return result;
  }

  private arabicCandidates(token: SearchQueryToken): string[] {
    const candidates = new Set<string>();
    this.addWithArticle(normalizeArabic(token.value), candidates);
    return unique(candidates);
  }

  private latinCandidates(token: SearchQueryToken): string[] {
    const candidates = new Set<string>();
    const normalized = normalizeLatinSearch(token.value);
    if (!normalized) return [];

    const inputs = new Set<string>([normalized]);
    if (normalized.includes("'")) {
      inputs.add(normalized.replace(/'+/gu, ''));
    }

    for (const input of inputs) {
      // Single digits are meaningful letters, but evaluate() deliberately
      // refuses to convert a lone digit so normal typing is never damaged.
      if (/^[2-9]$/u.test(input)) {
        const mapped = this.transliterator.literalFor(input);
        if (mapped) this.addWithArticle(mapped, candidates);
        for (const alternative of DIGIT_ALTERNATIVES[input] ?? []) {
          this.addWithArticle(alternative, candidates);
        }
        continue;
      }

      for (const arabic of this.transliterator.transliterationCandidates(
        input,
      )) {
        this.addWithArticle(normalizeArabic(arabic), candidates);
      }

      // al-/el-/2l- queries should also match the unarticled form, and a
      // query without an article should also find the articulated form.
      const stem = input.replace(/^(?:al|el|2l)/u, '');
      if (stem !== input && !/^[aeiou]/u.test(stem)) {
        for (const arabic of this.transliterator.transliterationCandidates(
          stem,
        )) {
          this.addWithArticle(normalizeArabic(arabic), candidates);
        }
      }
    }

    return unique(candidates);
  }

  private addWithArticle(value: string, target: Set<string>): void {
    const normalized = normalizeArabic(value);
    if (!normalized) return;

    target.add(normalized);

    const words = normalized.split(' ');
    if (words.length !== 1) return;

    if (normalized.startsWith(ARABIC_DEFINITE_ARTICLE)) {
      const stem = normalized.slice(ARABIC_DEFINITE_ARTICLE.length);
      if (stem.length >= 2) target.add(stem);
    } else if (normalized.length >= 2) {
      target.add(`${ARABIC_DEFINITE_ARTICLE}${normalized}`);
    }
  }

  private matchToken(
    candidates: string[],
    indexed: IndexedDocument,
  ): TokenMatch | null {
    let best: TokenMatch | null = null;
    let fuzzy: TokenMatch | null = null;

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (!candidate) continue;

      // Earlier candidates are the more conventional reading; use a small
      // bonus so equal matches prefer the primary interpretation.
      const preference = Math.max(0, 8 - index * 2);

      // Multi-word candidate: match the phrase before falling back to tokens.
      if (candidate.includes(' ')) {
        if (indexed.normalized.includes(candidate)) {
          return {
            kind: 'exact',
            text: candidate,
            score: MATCH_SCORES.exact + 10 + preference,
          };
        }
      }

      if (indexed.tokenSet.has(candidate)) {
        return {
          kind: 'exact',
          text: candidate,
          score:
            MATCH_SCORES.exact + Math.min(10, candidate.length) + preference,
        };
      }

      for (const docToken of indexed.tokens) {
        if (docToken.startsWith(candidate)) {
          const match: TokenMatch = {
            kind: 'prefix',
            text: docToken,
            score:
              MATCH_SCORES.prefix +
              Math.min(10, candidate.length) +
              preference,
          };
          if (!best || match.score > best.score) best = match;
        }
      }

      if (candidate.length >= 3 && indexed.normalized.includes(candidate)) {
        const match: TokenMatch = {
          kind: 'partial',
          text: candidate,
          score:
            MATCH_SCORES.partial +
            Math.min(8, candidate.length) +
            preference,
        };
        if (!best || match.score > best.score) best = match;
      }

      if (this.fuzzy) {
        const match = this.fuzzyToken(candidate, indexed);
        if (match) {
          match.score += preference;
          if (!fuzzy || match.score > fuzzy.score) fuzzy = match;
        }
      }
    }

    return best ?? fuzzy;
  }

  private fuzzyToken(
    candidate: string,
    indexed: IndexedDocument,
  ): TokenMatch | null {
    if (candidate.length < 3) return null;
    const maxDistance = candidate.length <= 4 ? 1 : 2;

    let best: TokenMatch | null = null;

    for (const docToken of indexed.tokens) {
      if (Math.abs(docToken.length - candidate.length) > maxDistance) continue;
      const distance = editDistance(candidate, docToken);
      if (distance > maxDistance) continue;

      const match: TokenMatch = {
        kind: 'fuzzy',
        text: docToken,
        score: MATCH_SCORES.fuzzy + (maxDistance - distance) * 5,
      };
      if (!best || match.score > best.score) best = match;
    }

    return best;
  }
}

/** Convenience factory for small, local corpora (datasets, fixtures). */
export function createArabicSearchIndex(
  documents: SearchDocument[],
  options: SearchIndexOptions = {},
): ArabicSearchIndex {
  return new ArabicSearchIndex(documents, options);
}

/**
 * Converts a Latin query to the most likely Arabic spelling. Search uses this
 * internally; it is exported for completion UIs and debugging.
 */
export function transliterateQuery(
  query: string,
  transliterator = new Transliterator(),
): string {
  const normalized = normalizeLatin(query);
  if (!normalized) return '';
  const evaluated = transliterator.transliterationCandidates(normalized);
  return evaluated[0] ?? '';
}
