export type ConversionMode = 'automatic' | 'preview' | 'suggestions';

export interface TransliterationRule {
  /** Latin source, matched case-insensitively and accent-insensitively. */
  from: string;
  /** Arabic (or literal) replacement. */
  to: string;
}

export type DictionaryMap = Record<string, string[]>;

export interface Candidate {
  arabic: string;
  source: 'dictionary' | 'rules';
}

export type SkipReason =
  | 'empty'
  | 'english'
  | 'numeric-disabled'
  | 'untransliterable';

export interface Evaluation {
  /** Source text exactly as supplied. */
  source: string;
  /** Normalized, lowercase, accent-free source. */
  normalized: string;
  candidates: Candidate[];
  /** The preferred spelling, or an empty string when not convertible. */
  arabic: string;
  /** True when the local dictionary supplied the preferred spelling. */
  known: boolean;
  /** False when the source should be left untouched. */
  convertible: boolean;
  reason?: SkipReason;
}

export interface EngineOptions {
  /** Extra or overriding rules. Longest source always wins. */
  rules?: TransliterationRule[];
  /** Extra or overriding dictionary entries. Custom spellings come first. */
  dictionary?: DictionaryMap;
  /** Enables Arabic chat/digit conventions (2 → أ, 3 → ع, ...). */
  numeric?: boolean;
  /** Leaves common English function words untouched. */
  skipEnglish?: boolean;
  /** Additional words to leave untouched. */
  skipWords?: Iterable<string>;
  /** Maximum number of alternatives returned by evaluate(). */
  maxAlternatives?: number;
}
