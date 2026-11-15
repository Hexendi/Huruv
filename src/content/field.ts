export type SupportedField =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLElement;

export interface FieldTextContext {
  field: SupportedField;
  kind: 'value' | 'dom';
  before: string;
  collapsed: boolean;
}

export interface ReplaceResult {
  /** Range covering the inserted Arabic text in a contenteditable field. */
  undoRange: Range | null;
  /** Start offset of the inserted text in an input/textarea. */
  valueStart: number | null;
  insertedLength: number;
}

const BLOCKED_SELECTOR = [
  '.monaco-editor',
  '.CodeMirror',
  '.cm-editor',
  '.ace_editor',
  '[data-arabictype-ignore]',
  '[data-gramm_editor]',
  '[data-gramm="false"]',
  '[aria-readonly="true"]',
  '[aria-disabled="true"]',
].join(',');

const SUPPORTED_INPUT_TYPES = new Set(['text', 'search']);

function isElement(value: unknown): value is Element {
  return value instanceof Element;
}

export function getEventTargetElement(event: Event): Element | null {
  const path = event.composedPath();
  for (const item of path) {
    if (isElement(item)) return item;
  }
  return isElement(event.target) ? event.target : null;
}

function candidateFromElement(element: Element): SupportedField | null {
  const closest = element.closest(
    'input, textarea, [contenteditable]',
  ) as Element | null;
  if (!closest) return null;
  if (closest.closest(BLOCKED_SELECTOR)) return null;

  if (closest instanceof HTMLInputElement) {
    if (!SUPPORTED_INPUT_TYPES.has(closest.type.toLowerCase())) return null;
    if (closest.disabled || closest.readOnly) return null;
    const autocomplete = (closest.getAttribute('autocomplete') ?? '').toLowerCase();
    if (
      autocomplete === 'one-time-code' ||
      autocomplete.startsWith('cc-')
    ) {
      return null;
    }
    return closest;
  }

  if (closest instanceof HTMLTextAreaElement) {
    if (closest.disabled || closest.readOnly) return null;
    return closest;
  }

  if (closest instanceof HTMLElement && closest.isContentEditable) {
    if (closest.closest(BLOCKED_SELECTOR)) return null;
    return closest;
  }

  return null;
}

export function getSupportedFieldFromEvent(
  event: Event,
): SupportedField | null {
  const element = getEventTargetElement(event);
  return element ? candidateFromElement(element) : null;
}

export function getSupportedField(
  element: Element | null,
): SupportedField | null {
  return element ? candidateFromElement(element) : null;
}

export function getSelectionForField(
  field: SupportedField,
): Selection | null {
  try {
    const root = field.getRootNode();
    if (root instanceof ShadowRoot) {
      const shadowRoot = root as ShadowRoot & {
        getSelection?: () => Selection | null;
      };
      if (typeof shadowRoot.getSelection === 'function') {
        return shadowRoot.getSelection();
      }
    }
  } catch {
    // Fall back to the document selection below.
  }

  try {
    return window.getSelection();
  } catch {
    return null;
  }
}

function restoreSelection(selection: Selection, range: Range): void {
  try {
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // The field may have been removed while the conversion was running.
  }
}

export function readTextContext(
  field: SupportedField,
): FieldTextContext | null {
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    if (typeof field.selectionStart !== 'number') return null;
    const start = field.selectionStart;
    const end = field.selectionEnd ?? start;
    return {
      field,
      kind: 'value',
      before: field.value.slice(0, start),
      collapsed: start === end,
    };
  }

  const selection = getSelectionForField(field);
  if (!selection || selection.rangeCount === 0) return null;

  try {
    const range = selection.getRangeAt(0);
    if (!field.contains(range.startContainer)) return null;

    const preCaret = document.createRange();
    preCaret.selectNodeContents(field);
    preCaret.setEnd(range.startContainer, range.startOffset);

    return {
      field,
      kind: 'dom',
      before: preCaret.toString(),
      collapsed: selection.isCollapsed,
    };
  } catch {
    // The selection can become invalid while a dynamic page mutates the DOM.
    return null;
  }
}

/** Returns the character immediately after the caret, if any. */
export function readCharAfterCaret(field: SupportedField): string | null {
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    const position = field.selectionEnd ?? field.selectionStart;
    if (typeof position !== 'number') return null;
    return field.value.charAt(position) || null;
  }

  const selection = getSelectionForField(field);
  if (!selection || selection.rangeCount === 0) return null;

  try {
    const range = selection.getRangeAt(0);
    if (!field.contains(range.startContainer)) return null;

    const afterCaret = document.createRange();
    afterCaret.selectNodeContents(field);
    afterCaret.setStart(range.endContainer, range.endOffset);
    return afterCaret.toString().charAt(0) || null;
  } catch {
    return null;
  }
}

export function getFieldAnchorRect(field: SupportedField): DOMRect {
  try {
    if (field instanceof HTMLElement) {
      const selection = getSelectionForField(field);
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (field.contains(range.startContainer)) {
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 || rect.height > 0) return rect;
        }
      }
    }
    return field.getBoundingClientRect();
  } catch {
    return new DOMRect(0, 0, 0, 0);
  }
}

/** Browsers may rewrite a trailing space in contenteditable as &nbsp;. */
function comparableText(value: string): string {
  return value.replace(/\u00a0/gu, ' ');
}

function dispatchFallbackInput(
  field: SupportedField,
  replacement: string,
): void {
  field.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      composed: true,
      inputType: 'insertText',
      data: replacement,
    }),
  );
}

/**
 * Replaces text immediately before the caret with `replacement`.
 *
 * For inputs and textareas, `document.execCommand('insertText')` is used where
 * possible because it participates in the browser's native undo stack. The
 * fallback uses setRangeText and dispatches an input event. For contenteditable
 * fields, the browser selection is extended backwards over the source text.
 */
export function replaceBeforeCaret(
  field: SupportedField,
  source: string,
  arabic: string,
  replacement: string,
): ReplaceResult | null {
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    const context = readTextContext(field);
    if (!context?.collapsed) return null;
    const end = field.selectionStart;
    if (typeof end !== 'number') return null;
    const start = end - source.length;
    if (start < 0 || field.value.slice(start, end) !== source) return null;

    field.setSelectionRange(start, end);

    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, replacement);
    } catch {
      inserted = false;
    }

    if (!inserted) {
      field.setRangeText(replacement, start, end, 'end');
      dispatchFallbackInput(field, replacement);
    }

    return {
      undoRange: null,
      valueStart: start,
      insertedLength: replacement.length,
    };
  }

  const selection = getSelectionForField(field);
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return null;
  }

  let originalRange: Range;
  try {
    originalRange = selection.getRangeAt(0).cloneRange();
  } catch {
    return null;
  }
  if (!field.contains(originalRange.startContainer)) return null;

  try {
    selection.removeAllRanges();
    selection.addRange(originalRange);
    selection.collapseToEnd();

    for (let index = 0; index < source.length; index += 1) {
      selection.modify('extend', 'backward', 'character');
    }
  } catch {
    restoreSelection(selection, originalRange);
    return null;
  }

  if (selection.toString() !== source) {
    restoreSelection(selection, originalRange);
    return null;
  }

  let inserted = false;
  try {
    inserted = document.execCommand('insertText', false, replacement);
  } catch {
    inserted = false;
  }

  if (!inserted) {
    try {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(replacement);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      dispatchFallbackInput(field, replacement);
    } catch {
      restoreSelection(selection, originalRange);
      return null;
    }
  }

  let undoRange: Range | null = null;
  if (selection.rangeCount > 0) {
    let insertedEnd: Range | null = null;
    try {
      insertedEnd = selection.getRangeAt(0).cloneRange();
      const trailingLength = Math.max(0, replacement.length - arabic.length);

      // Select the whole inserted replacement, then trim the boundary character
      // so the undo record covers only the Arabic text. Character-wise selection
      // keeps this correct for combining marks and split contenteditable nodes.
      let guard = 0;
      while (
        comparableText(selection.toString()) !== comparableText(replacement) &&
        guard < replacement.length + 8
      ) {
        selection.modify('extend', 'backward', 'character');
        guard += 1;
      }

      if (comparableText(selection.toString()) === comparableText(replacement)) {
        const candidate = selection.getRangeAt(0).cloneRange();
        if (trailingLength > 0) {
          selection.collapseToEnd();
          let trimGuard = 0;
          while (
            selection.toString().length < trailingLength &&
            trimGuard < trailingLength + 4
          ) {
            selection.modify('extend', 'backward', 'character');
            trimGuard += 1;
          }
          if (selection.rangeCount > 0) {
            const boundary = selection.getRangeAt(0);
            candidate.setEnd(boundary.startContainer, boundary.startOffset);
          }
        }
        if (comparableText(candidate.toString()) === comparableText(arabic)) {
          undoRange = candidate;
        }
      }
    } catch {
      undoRange = null;
    } finally {
      if (insertedEnd) restoreSelection(selection, insertedEnd);
    }
  }

  return {
    undoRange,
    valueStart: null,
    insertedLength: replacement.length,
  };
}

/** Selects a stored DOM range and restores text inside it. */
export function replaceDomRange(
  field: SupportedField,
  range: Range,
  replacement: string,
): boolean {
  if (!field.isConnected || !range.startContainer.isConnected) return false;
  if (!field.contains(range.startContainer)) return false;

  field.focus({ preventScroll: true });
  const selection = getSelectionForField(field);
  if (!selection) return false;

  try {
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    return false;
  }

  try {
    if (document.execCommand('insertText', false, replacement)) return true;
  } catch {
    // Use the manual fallback below.
  }

  try {
    const workingRange = selection.getRangeAt(0);
    workingRange.deleteContents();
    const textNode = document.createTextNode(replacement);
    workingRange.insertNode(textNode);
    workingRange.setStartAfter(textNode);
    workingRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(workingRange);
    dispatchFallbackInput(field, replacement);
    return true;
  } catch {
    return false;
  }
}

/** Inserts text at the caret of any supported field. */
export function insertTextIntoField(
  field: SupportedField,
  text: string,
): boolean {
  if (!text) return false;

  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    return replaceValueRange(field, start, end, text);
  }

  field.focus({ preventScroll: true });
  const selection = getSelectionForField(field);
  if (!selection) return false;

  if (
    selection.rangeCount === 0 ||
    !field.contains(selection.anchorNode)
  ) {
    try {
      const endRange = document.createRange();
      endRange.selectNodeContents(field);
      endRange.collapse(false);
      selection.removeAllRanges();
      selection.addRange(endRange);
    } catch {
      return false;
    }
  }

  try {
    if (document.execCommand('insertText', false, text)) return true;
  } catch {
    // Use the manual fallback below.
  }

  if (selection.rangeCount === 0) return false;
  let range: Range;
  try {
    range = selection.getRangeAt(0);
  } catch {
    return false;
  }
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  dispatchFallbackInput(field, text);
  return true;
}

/** Deletes the selection or the character immediately before the caret. */
export function deleteTextBeforeCaret(field: SupportedField): boolean {
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    if (start !== end) return replaceValueRange(field, start, end, '');
    if (start <= 0) return false;
    return replaceValueRange(field, start - 1, start, '');
  }

  field.focus({ preventScroll: true });
  const selection = getSelectionForField(field);
  if (!selection) return false;

  if (
    selection.rangeCount === 0 ||
    !field.contains(selection.anchorNode)
  ) {
    try {
      const endRange = document.createRange();
      endRange.selectNodeContents(field);
      endRange.collapse(false);
      selection.removeAllRanges();
      selection.addRange(endRange);
    } catch {
      return false;
    }
  }

  try {
    if (document.execCommand('delete')) return true;
  } catch {
    // Use the manual fallback below.
  }

  if (selection.rangeCount === 0) return false;

  try {
    selection.collapseToEnd();
    selection.modify('extend', 'backward', 'character');
    const range = selection.getRangeAt(0);
    if (range.collapsed) return false;
    range.deleteContents();
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    dispatchFallbackInput(field, '');
    return true;
  } catch {
    return false;
  }
}

/** Selects an offset range in an input/textarea and restores text. */
export function replaceValueRange(
  field: HTMLInputElement | HTMLTextAreaElement,
  start: number,
  end: number,
  replacement: string,
): boolean {
  if (start < 0 || end < start || end > field.value.length) return false;
  field.focus({ preventScroll: true });
  field.setSelectionRange(start, end);

  try {
    if (document.execCommand('insertText', false, replacement)) return true;
  } catch {
    // Use the fallback below.
  }

  field.setRangeText(replacement, start, end, 'end');
  dispatchFallbackInput(field, replacement);
  return true;
}
