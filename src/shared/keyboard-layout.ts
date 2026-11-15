/**
 * Arabic letter layout used by both the popup keyboard and the floating
 * keyboard. Rows are listed right-to-left, matching a physical Arabic
 * keyboard. The shared array keeps the two surfaces in sync.
 */
export const ARABIC_KEYBOARD_ROWS: readonly (readonly string[])[] = [
  ['ذ', 'د', 'ج', 'ح', 'خ', 'ه', 'ع', 'غ', 'ف', 'ق', 'ث', 'ص', 'ض'],
  ['ط', 'ك', 'م', 'ن', 'ت', 'ا', 'ل', 'ب', 'ي', 'س', 'ش'],
  ['ظ', 'ز', 'و', 'ة', 'ى', 'لا', 'ر', 'ؤ', 'ء', 'ئ'],
  [' ', '،', '.'],
];

export const ARABIC_KEYBOARD_DIGITS: readonly string[] = [
  '١',
  '٢',
  '٣',
  '٤',
  '٥',
  '٦',
  '٧',
  '٨',
  '٩',
  '٠',
];
