import { createEngineFromSettings } from '../shared/engine';
import { getExtensionApi } from '../shared/api';
import {
  KEYBOARD_MODE_MESSAGE,
  KEYBOARD_OPACITY_MESSAGE,
  loadKeyboardMode,
  loadKeyboardOpacity,
  normalizeKeyboardMode,
  normalizeKeyboardOpacity,
  saveKeyboardMode,
  subscribeKeyboardMode,
  subscribeKeyboardOpacity,
} from '../shared/keyboard';
import { UNDO_MESSAGE } from '../shared/messages';
import {
  DEFAULT_SETTINGS,
  isSitePaused,
  type Settings,
} from '../shared/settings';
import { loadSettings, subscribeSettings } from '../shared/storage';
import type { Candidate, Evaluation, Transliterator } from '../engine';
import {
  getPhraseWindowBeforeCaret,
  getWordBeforeCaret,
  isWordChar,
  type PhraseWindow,
} from '../engine/text';
import type { SupportedField } from './field';
import {
  getFieldAnchorRect,
  getSupportedField,
  getSupportedFieldFromEvent,
  insertTextIntoField,
  readCharAfterCaret,
  readTextContext,
  replaceBeforeCaret,
  replaceDomRange,
  replaceValueRange,
  type ReplaceResult,
} from './field';
import { FloatingKeyboard } from './keyboard';
import { ContentOverlay } from './overlay';

const BOUNDARY_CHARS = new Set([
  ' ',
  ',',
  '.',
  ';',
  ':',
  '!',
  '?',
  '…',
  ')',
  ']',
  '}',
  '»',
  '«',
  '"',
  '-',
  '–',
  '—',
  '/',
  '\\',
  '|',
  '@',
  '#',
  '$',
  '%',
  '^',
  '&',
  '*',
  '_',
  '+',
  '=',
  '~',
  '<',
  '>',
]);

type ValueField = HTMLInputElement | HTMLTextAreaElement;

const PHRASE_HOLD_MS = 650;
const TOAST_THROTTLE_MS = 4000;
const STRONG_TRANSLITERATION_RE = /[2-9'’‘]/u;

type ConversionRecord =
  | {
      kind: 'value';
      field: ValueField;
      start: number;
      end: number;
      arabic: string;
      latin: string;
    }
  | {
      kind: 'dom';
      field: HTMLElement;
      range: Range;
      arabic: string;
      latin: string;
    };

interface PreviewState {
  field: SupportedField;
  source: string;
  candidates: Evaluation['candidates'];
  selectedIndex: number;
  anchor: DOMRect;
}

const overlay = new ContentOverlay();
const floatingKeyboard =
  window.top === window
    ? new FloatingKeyboard({
        onClose: () => {
          void saveKeyboardMode('inline');
        },
      })
    : null;
const hostname = location.hostname.trim().toLowerCase();

let settings: Settings = { ...DEFAULT_SETTINGS };
let engine: Transliterator = createEngineFromSettings(settings);
let ready = false;
let activeField: SupportedField | null = null;
let lastFocusedField: SupportedField | null = null;
let composing = false;
let suppressInput = false;
let previewFrame = 0;
let previewState: PreviewState | null = null;
let lastConversion: ConversionRecord | null = null;
let phraseHoldTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPhrase: { field: SupportedField; text: string } | null = null;
let typedRun: { field: SupportedField; start: number } | null = null;
let lastToastAt = 0;

function isActive(): boolean {
  return (
    ready &&
    settings.enabled &&
    !isSitePaused(settings, hostname) &&
    !composing
  );
}

function isFieldFocused(field: SupportedField): boolean {
  let active: Element | null = document.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active === field || field.contains(active);
}

function clearPreview(): void {
  previewState = null;
  overlay.hidePreview();
}

function clearPhraseHold(clearPending = true): void {
  if (phraseHoldTimer !== null) {
    clearTimeout(phraseHoldTimer);
    phraseHoldTimer = null;
  }
  if (clearPending) pendingPhrase = null;
}

function isConversionRecordValid(record: ConversionRecord): boolean {
  if (record.kind === 'value') {
    return (
      record.field.isConnected &&
      record.field.value.slice(record.start, record.end) === record.arabic
    );
  }
  return (
    record.field.isConnected &&
    record.range.startContainer.isConnected &&
    record.range.toString() === record.arabic
  );
}

function getBoundaryKey(event: KeyboardEvent): string | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === ' ' || event.key === 'Spacebar') return ' ';
  if (event.key.length === 1 && BOUNDARY_CHARS.has(event.key)) {
    return event.key;
  }
  return null;
}

function getEvaluationContext(
  field: SupportedField,
): { source: string; evaluation: Evaluation; anchor: DOMRect } | null {
  const context = readTextContext(field);
  if (!context?.collapsed) return null;

  const after = readCharAfterCaret(field);
  if (after && isWordChar(after)) return null;

  const word = getWordBeforeCaret(context.before, context.before.length);
  if (!word || word.value.length < 2) return null;

  let source = word.value;
  const phrase = getPhraseWindowBeforeCaret(
    context.before,
    context.before.length,
    4,
  );
  if (phrase) {
    const phraseCandidates = engine.lookupPhrase(phrase.text);
    if (phraseCandidates.length) source = phrase.text;
  }

  if (source.length < 2) return null;
  const evaluation = engine.evaluate(source);
  if (
    !evaluation.convertible ||
    !evaluation.arabic ||
    evaluation.arabic === source
  ) {
    return null;
  }

  return {
    source,
    evaluation,
    anchor: getFieldAnchorRect(field),
  };
}

function readLatinRun(
  field: SupportedField,
): { run: PhraseWindow; before: string } | null {
  const context = readTextContext(field);
  if (!context?.collapsed) return null;

  const after = readCharAfterCaret(field);
  if (after && isWordChar(after)) return null;

  const run = getPhraseWindowBeforeCaret(
    context.before,
    context.before.length,
    4,
  );
  return run ? { run, before: context.before } : null;
}

function getTypedSource(
  field: SupportedField,
  run: PhraseWindow,
  before: string,
): { source: string; start: number } | null {
  if (!typedRun || typedRun.field !== field) return null;
  if (typedRun.start < run.start || typedRun.start > run.end) return null;
  if (typedRun.start < 0 || typedRun.start > before.length) return null;

  const source = before.slice(typedRun.start);
  if (!source || !run.text.endsWith(source)) return null;
  return { source, start: typedRun.start };
}

function convertSource(field: SupportedField, source: string): string | null {
  if (source.includes(' ')) {
    const converted = engine.transliterateTextConservative(source);
    return converted !== source ? converted : null;
  }

  const evaluation = engine.evaluate(source);
  if (!evaluation.convertible) return null;
  return getSelectedArabic(field, source, evaluation.candidates) ?? evaluation.arabic;
}

function getSelectedArabic(
  field: SupportedField,
  source: string,
  candidates: Candidate[],
): string | null {
  if (
    previewState &&
    previewState.field === field &&
    previewState.source === source
  ) {
    return (
      previewState.candidates[previewState.selectedIndex]?.arabic ?? null
    );
  }
  return candidates[0]?.arabic ?? null;
}

function renderPreview(state: PreviewState): void {
  if (settings.mode !== 'preview' && settings.mode !== 'suggestions') return;
  const candidate =
    state.candidates[state.selectedIndex] ?? state.candidates[0];
  if (!candidate) return;

  overlay.showPreview({
    mode: settings.mode,
    source: state.source,
    arabic: candidate.arabic,
    candidates: state.candidates,
    selectedIndex: state.selectedIndex,
    anchor: state.anchor,
    onChoose: (index) => {
      const current = previewState;
      if (!current || !current.candidates[index]) return;
      current.selectedIndex = index;
      renderPreview(current);
    },
  });
}

function schedulePreview(): void {
  if (previewFrame !== 0) return;
  previewFrame = requestAnimationFrame(() => {
    previewFrame = 0;
    updatePreview();
  });
}

function updatePreview(): void {
  if (
    !isActive() ||
    settings.mode === 'automatic' ||
    !activeField ||
    !isFieldFocused(activeField)
  ) {
    clearPreview();
    return;
  }

  const context = getEvaluationContext(activeField);
  if (!context) {
    clearPreview();
    return;
  }

  const previous = previewState;
  const sameSource =
    previous !== null &&
    previous.field === activeField &&
    previous.source === context.source;

  const state: PreviewState = {
    field: activeField,
    source: context.source,
    candidates: context.evaluation.candidates,
    selectedIndex: sameSource
      ? Math.min(
          previous.selectedIndex,
          Math.max(0, context.evaluation.candidates.length - 1),
        )
      : 0,
    anchor: context.anchor,
  };

  previewState = state;
  renderPreview(state);
}

function recordConversion(
  result: ReplaceResult,
  field: SupportedField,
  source: string,
  arabic: string,
): void {
  if (
    result.valueStart !== null &&
    (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)
  ) {
    lastConversion = {
      kind: 'value',
      field,
      start: result.valueStart,
      end: result.valueStart + arabic.length,
      arabic,
      latin: source,
    };
    return;
  }

  if (result.undoRange && field instanceof HTMLElement) {
    lastConversion = {
      kind: 'dom',
      field,
      range: result.undoRange,
      // Browsers can normalize spaces in the DOM; store exactly what the range
      // covers so undo can detect whether the text is still untouched.
      arabic: result.undoRange.toString(),
      latin: source,
    };
    return;
  }

  lastConversion = null;
}

function showConvertedToast(): void {
  const now = Date.now();
  if (now - lastToastAt < TOAST_THROTTLE_MS) return;
  lastToastAt = now;
  overlay.showToast({
    message: 'Converted · Alt+Z to undo',
    actionLabel: 'Undo',
    onAction: () => {
      undoLastConversion();
    },
    duration: 3000,
  });
}

function commitHeldPhrase(held: { field: SupportedField; text: string }): void {
  const context = readTextContext(held.field);
  if (!context?.collapsed) {
    pendingPhrase = null;
    return;
  }
  if (!context.before.endsWith(`${held.text} `)) {
    pendingPhrase = null;
    return;
  }

  const evaluation = engine.evaluate(held.text);
  if (!evaluation.convertible || !evaluation.arabic) {
    pendingPhrase = null;
    return;
  }

  const arabic =
    getSelectedArabic(held.field, held.text, evaluation.candidates) ??
    evaluation.arabic;
  if (!arabic || arabic === held.text) {
    pendingPhrase = null;
    return;
  }

  suppressInput = true;
  let result: ReplaceResult | null = null;
  try {
    result = replaceBeforeCaret(
      held.field,
      `${held.text} `,
      arabic,
      `${arabic} `,
    );
  } finally {
    queueMicrotask(() => {
      suppressInput = false;
    });
  }

  pendingPhrase = null;
  typedRun = null;
  if (!result) return;

  recordConversion(result, held.field, held.text, arabic);
  showConvertedToast();
}

/** Converts a held phrase immediately, e.g. right before focus moves away. */
function flushPendingPhrase(): void {
  const held = pendingPhrase;
  if (!held) return;
  clearPhraseHold(true);
  if (!held.field.isConnected) return;
  commitHeldPhrase(held);
}

function schedulePhraseHold(): void {
  if (phraseHoldTimer !== null) clearTimeout(phraseHoldTimer);
  const held = pendingPhrase;
  if (!held) return;

  phraseHoldTimer = setTimeout(() => {
    phraseHoldTimer = null;
    const current = pendingPhrase;
    if (
      !current ||
      current.field !== held.field ||
      current.text !== held.text ||
      !held.field.isConnected ||
      !isFieldFocused(held.field)
    ) {
      pendingPhrase = null;
      return;
    }

    commitHeldPhrase(held);
  }, PHRASE_HOLD_MS);
}

function commitBoundary(
  event: KeyboardEvent,
  field: SupportedField,
  boundary: string,
  preventDefault = true,
): void {
  if (!isActive()) return;

  const current = readLatinRun(field);
  if (!current) {
    typedRun = null;
    return;
  }

  const { run, before } = current;
  const phraseCandidates = run.text.includes(' ')
    ? engine.lookupPhrase(run.text)
    : [];
  const typed = getTypedSource(field, run, before);
  let source: string | null = null;
  let arabic: string | null = null;

  if (phraseCandidates.length) {
    const evaluation = engine.evaluate(run.text);
    arabic =
      getSelectedArabic(field, run.text, evaluation.candidates) ??
      evaluation.arabic;
    source = run.text;
    pendingPhrase = null;
  } else if (
    boundary === ' ' &&
    engine.shouldWaitForPhrase(run.text) &&
    (!typed ||
      typed.source === run.text ||
      (pendingPhrase?.field === field &&
        run.text.startsWith(`${pendingPhrase.text} `)))
  ) {
    // Hold common phrase starters ("sabah", "masa", …) for a moment so
    // "sabah el khir" can become one phrase instead of "صباح ال خير".
    pendingPhrase = { field, text: run.text };
    schedulePhraseHold();
    typedRun = null;
    return;
  } else if (
    pendingPhrase &&
    pendingPhrase.field === field &&
    run.text.startsWith(`${pendingPhrase.text} `)
  ) {
    // The held phrase prefix did not complete a dictionary phrase. Convert
    // the whole held run, preserving English words conservatively.
    const converted = engine.transliterateTextConservative(run.text);
    if (converted !== run.text) {
      source = run.text;
      arabic = converted;
    }
    pendingPhrase = null;
  } else {
    pendingPhrase = null;

    const sourceInfo =
      typed && !typed.source.includes(' ')
        ? typed
        : { source: run.lastWord, start: run.lastWordStart };

    // Typing an unknown word after a clearly English prefix ("hello world")
    // should not rewrite that word phonetically.
    if (
      typed &&
      typed.source.includes(' ') &&
      sourceInfo.source === run.lastWord &&
      engine.isLikelyEnglishContext(typed.source, sourceInfo.source)
    ) {
      typedRun = null;
      return;
    }

    // When the caret is at the end of a multi-word run that was not typed in
    // this edit session (paste/autofill), only convert words we are confident
    // about. This avoids rewriting ordinary English prose.
    if (!typed && run.text.includes(' ')) {
      const evaluation = engine.evaluate(sourceInfo.source);
      if (
        !evaluation.convertible ||
        (!evaluation.known &&
          !STRONG_TRANSLITERATION_RE.test(sourceInfo.source))
      ) {
        typedRun = null;
        return;
      }
    }

    source = sourceInfo.source;
    arabic = convertSource(field, source);
  }

  typedRun = null;
  if (!arabic || !source || arabic === source) return;

  suppressInput = true;
  let result: ReplaceResult | null = null;
  try {
    result = replaceBeforeCaret(
      field,
      source,
      arabic,
      `${arabic}${boundary}`,
    );
  } finally {
    queueMicrotask(() => {
      suppressInput = false;
    });
  }

  if (!result) return;

  if (preventDefault) event.preventDefault();
  clearPreview();
  recordConversion(result, field, source, arabic);
  showConvertedToast();
}

function isEditableField(node: Node | null): node is SupportedField {
  if (!(node instanceof Element)) return false;
  return Boolean(node.closest('input, textarea, [contenteditable]'));
}

function undoLastConversion(): boolean {
  const record = lastConversion;
  if (!record) {
    overlay.showToast({
      message: 'Nothing to undo yet.',
      duration: 2600,
    });
    return false;
  }

  if (!(record.field.isConnected && isEditableField(record.field))) {
    overlay.showToast({
      message: 'The field with the last conversion is no longer available.',
      duration: 3200,
    });
    return false;
  }

  lastConversion = null;
  clearPreview();

  let restored = false;
  if (record.kind === 'value') {
    if (
      record.field.isConnected &&
      record.field.value.slice(record.start, record.end) === record.arabic
    ) {
      restored = replaceValueRange(
        record.field,
        record.start,
        record.end,
        record.latin,
      );
    }
  } else if (
    record.range.startContainer.isConnected &&
    record.range.toString() === record.arabic
  ) {
    restored = replaceDomRange(record.field, record.range, record.latin);
  }

  if (!restored) {
    lastConversion = record;
  }

  overlay.showToast({
    message: restored
      ? 'Restored Latin text.'
      : 'Could not undo — the text changed since conversion.',
    duration: 3000,
  });
  return restored;
}

function choosePreviewCandidate(index: number): void {
  if (!previewState?.candidates[index]) return;
  previewState.selectedIndex = index;
  renderPreview(previewState);
}

function commitPreviewSelection(): void {
  const state = previewState;
  if (!state || !state.field.isConnected) return;
  const candidate =
    state.candidates[state.selectedIndex] ?? state.candidates[0];
  if (!candidate) return;

  suppressInput = true;
  let result: ReplaceResult | null = null;
  try {
    result = replaceBeforeCaret(
      state.field,
      state.source,
      candidate.arabic,
      candidate.arabic,
    );
  } finally {
    queueMicrotask(() => {
      suppressInput = false;
    });
  }

  if (!result) return;
  typedRun = null;
  pendingPhrase = null;
  clearPreview();
  recordConversion(result, state.field, state.source, candidate.arabic);
  showConvertedToast();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.isComposing || composing || event.keyCode === 229) return;

  const field = getSupportedFieldFromEvent(event);
  if (!field) return;

  if (field !== activeField) {
    activeField = field;
    if (typedRun && typedRun.field !== field) typedRun = null;
  }

  if (
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.key.toLowerCase() === 'z'
  ) {
    event.preventDefault();
    event.stopPropagation();
    clearPhraseHold(true);
    undoLastConversion();
    return;
  }

  if (event.key === 'Escape') {
    clearPreview();
    return;
  }

  if (event.altKey && /^[1-9]$/u.test(event.key) && previewState) {
    event.preventDefault();
    event.stopPropagation();
    choosePreviewCandidate(Number(event.key) - 1);
    return;
  }

  if (previewState && !event.altKey && !event.ctrlKey && !event.metaKey) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const count = previewState.candidates.length;
      if (count > 0) {
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const next = (previewState.selectedIndex + delta + count) % count;
        choosePreviewCandidate(next);
      }
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      // Insert the highlighted candidate. Inputs keep their native Enter
      // behaviour so search boxes and forms still submit; textareas and
      // contenteditable fields must not also insert a newline.
      event.stopPropagation();
      if (!(field instanceof HTMLInputElement)) event.preventDefault();
      commitPreviewSelection();
      return;
    }
  }

  if (event.repeat) return;

  // Track what the user types even before settings have loaded (the first
  // moments after the content script starts). Otherwise the first boundary
  // after loading only sees the tail of the word — e.g. "ma" typed early and
  // "rhba" typed later would become "maرهبا" instead of "مرحبا".
  if (!composing && !event.altKey && !event.ctrlKey && !event.metaKey) {
    if (
      event.key === 'Backspace' ||
      event.key === 'Delete' ||
      event.key.startsWith('Arrow') ||
      event.key === 'Home' ||
      event.key === 'End' ||
      event.key === 'PageUp' ||
      event.key === 'PageDown'
    ) {
      typedRun = null;
    } else if (
      event.key.length === 1 &&
      event.key !== ' ' &&
      !BOUNDARY_CHARS.has(event.key)
    ) {
      const context = readTextContext(field);
      if (
        context?.collapsed &&
        (!typedRun ||
          typedRun.field !== field ||
          context.before.length < typedRun.start)
      ) {
        // Never start a run in the middle of a word: letters already in the
        // field right before the caret belong to the word being typed.
        const partial = getWordBeforeCaret(
          context.before,
          context.before.length,
        );
        typedRun = {
          field,
          start: partial ? partial.start : context.before.length,
        };
      }
    }
  }

  if (!isActive()) return;

  // Enter is a search/submit key on many sites (YouTube, Google, chat boxes).
  // Convert the last word, then let the site handle the key normally so the
  // search or form submission still happens.
  if (
    event.key === 'Enter' &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    clearPhraseHold(false);
    commitBoundary(event, field, '', false);
    return;
  }

  const boundary = getBoundaryKey(event);
  if (!boundary) {
    // A new character continues a held phrase prefix; keep the prefix but
    // cancel the timeout so it does not fire before the word is complete.
    if (event.key.length === 1) clearPhraseHold(false);
    return;
  }

  clearPhraseHold(false);
  commitBoundary(event, field, boundary);
}

function onInput(event: Event): void {
  if (suppressInput) {
    schedulePreview();
    return;
  }

  if (event instanceof InputEvent) {
    if (event.isComposing || event.inputType !== 'insertText') {
      typedRun = null;
    }
  }

  const field = getSupportedFieldFromEvent(event);
  if (field) activeField = field;

  if (lastConversion && !isConversionRecordValid(lastConversion)) {
    lastConversion = null;
    overlay.hideToast();
  }

  if (field) schedulePreview();
}

function onFocusIn(event: Event): void {
  const field = getSupportedFieldFromEvent(event);
  if (!field) return;
  if (pendingPhrase && pendingPhrase.field !== field) clearPhraseHold(true);
  if (typedRun && typedRun.field !== field) typedRun = null;
  activeField = field;
  lastFocusedField = field;
  schedulePreview();
}

function onFocusOut(event: FocusEvent): void {
  const field = getSupportedFieldFromEvent(event);
  if (!field || field !== activeField) return;
  const next = event.relatedTarget;
  if (next instanceof Node && field.contains(next)) return;

  // Firefox can report relatedTarget=null when the Alt key opens the browser
  // menu. Do not tear down the preview immediately: a following Alt+1 must
  // still be able to choose a suggestion. Click-away and tab-away are handled
  // by the pointerdown/focusin listeners instead.
  if (next === null) return;

  activeField = null;
  typedRun = null;
  clearPhraseHold(true);
  clearPreview();
  overlay.hideToast();
}

function onSelectionChange(): void {
  if (!activeField || !isActive()) return;
  if (settings.mode === 'automatic') return;
  schedulePreview();
}

function onPointerDown(event: PointerEvent): void {
  const path = event.composedPath();
  if (
    path.some(
      (node) =>
        node instanceof Element && node.hasAttribute('data-arabictype-ui'),
    )
  ) {
    return;
  }

  const target = event.target instanceof Element ? event.target : null;
  const targetField = getSupportedField(target);

  // Clicking back into the same field should not disturb the caret or a
  // pending phrase.
  if (targetField && targetField === pendingPhrase?.field) return;

  // Commit a held phrase before focus leaves. Otherwise clicking a search
  // button immediately after typing "sabah " would submit the Latin text.
  flushPendingPhrase();

  // Focusin/focusout handle the move between two fields.
  if (targetField) return;

  typedRun = null;
  activeField = null;
  clearPreview();
  overlay.hideToast();
}

function hideOnViewportChange(event?: Event): void {
  if (!previewState) return;
  // Long textareas scroll internally as the caret moves. That should not hide
  // the preview for the word being typed.
  if (
    event?.target instanceof Node &&
    previewState.field.contains(event.target)
  ) {
    return;
  }
  clearPreview();
}

function applySettings(next: Settings): void {
  settings = next;
  engine = createEngineFromSettings(next);
  if (!isActive() || settings.mode === 'automatic') {
    clearPreview();
    if (!isActive()) {
      clearPhraseHold(true);
      typedRun = null;
    }
    return;
  }
  schedulePreview();
}

// --- Lifecycle -------------------------------------------------------------

document.addEventListener('keydown', onKeyDown, true);
document.addEventListener('input', onInput, true);
document.addEventListener('focusin', onFocusIn, true);
document.addEventListener('focusout', onFocusOut, true);
document.addEventListener('pointerdown', onPointerDown, true);
document.addEventListener('selectionchange', onSelectionChange);
document.addEventListener(
  'compositionstart',
  () => {
    composing = true;
    clearPhraseHold(true);
    clearPreview();
  },
  true,
);
document.addEventListener(
  'compositionend',
  () => {
    composing = false;
    schedulePreview();
  },
  true,
);
window.addEventListener('scroll', hideOnViewportChange, true);
window.addEventListener('resize', hideOnViewportChange);
window.addEventListener('pagehide', () => {
  clearPhraseHold(true);
  clearPreview();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    clearPhraseHold(true);
    clearPreview();
  }
});

const extensionApi = getExtensionApi();
if (extensionApi?.runtime?.onMessage) {
  extensionApi.runtime.onMessage.addListener(
    (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      if (message?.type === UNDO_MESSAGE) {
        const ok = undoLastConversion();
        sendResponse({ ok });
        return false;
      }
      if (message?.type === KEYBOARD_MODE_MESSAGE) {
        const mode = normalizeKeyboardMode(message.mode);
        floatingKeyboard?.setVisible(mode === 'floating');
        sendResponse({ ok: floatingKeyboard !== null });
        return false;
      }
      if (message?.type === KEYBOARD_OPACITY_MESSAGE) {
        const opacity = normalizeKeyboardOpacity(message.opacity);
        floatingKeyboard?.setOpacity(opacity);
        sendResponse({ ok: floatingKeyboard !== null });
        return false;
      }
      if (message?.type === 'huruv:insert') {
        try {
          const text = String(message.text || '');
          if (!text) {
            sendResponse({ ok: false });
            return false;
          }

          const active = getSupportedField(document.activeElement);
          const field =
            active ??
            (activeField?.isConnected ? activeField : null) ??
            (lastFocusedField?.isConnected ? lastFocusedField : null);

          if (field && insertTextIntoField(field, text)) {
            sendResponse({ ok: true });
            return false;
          }
        } catch {}
        sendResponse({ ok: false });
        return false;
      }
      return false;
    },
  );
}

subscribeSettings((next) => {
  applySettings(next);
});

if (floatingKeyboard) {
  void loadKeyboardOpacity()
    .then((opacity) => {
      floatingKeyboard.setOpacity(opacity);
    })
    .catch(() => undefined);

  void loadKeyboardMode()
    .then((mode) => {
      if (mode === 'floating') {
        if (!floatingKeyboard.isVisible) floatingKeyboard.showLauncher();
      } else {
        floatingKeyboard.hide();
      }
    })
    .catch(() => undefined);

  subscribeKeyboardMode((mode) => {
    if (mode === 'floating') {
      if (!floatingKeyboard.isVisible) floatingKeyboard.showLauncher();
    } else {
      floatingKeyboard.hide();
    }
  });

  subscribeKeyboardOpacity((opacity) => {
    floatingKeyboard.setOpacity(opacity);
  });
}

void loadSettings()
  .then((loaded) => {
    settings = loaded;
    engine = createEngineFromSettings(loaded);
    ready = true;
    if (activeField) schedulePreview();
  })
  .catch(() => {
    ready = true;
  });
