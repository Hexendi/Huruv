import {
  normalizeKeyboardOpacity,
  saveKeyboardOpacity,
} from '../shared/keyboard';
import { extensionUrl } from '../shared/api';
import {
  ARABIC_KEYBOARD_DIGITS,
  ARABIC_KEYBOARD_ROWS,
} from '../shared/keyboard-layout';
import {
  deleteTextBeforeCaret,
  getEventTargetElement,
  getSupportedField,
  insertTextIntoField,
  type SupportedField,
} from './field';

interface FloatingKeyboardOptions {
  onClose?: () => void;
}

interface DragState {
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

interface ResizeState {
  pointerId: number;
  startX: number;
  startWidth: number;
  left: number;
}

const fontUrl = (name: string): string => extensionUrl(`fonts/${name}`);

const KEYBOARD_STYLE = `
@font-face {
  font-family: "Thmanyah Sans";
  src: url("${fontUrl('ThmanyahSans-Regular.woff2')}") format("woff2");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: "Thmanyah Sans";
  src: url("${fontUrl('ThmanyahSans-Medium.woff2')}") format("woff2");
  font-style: normal;
  font-weight: 500;
  font-display: swap;
}
@font-face {
  font-family: "Thmanyah Sans";
  src: url("${fontUrl('ThmanyahSans-Bold.woff2')}") format("woff2");
  font-style: normal;
  font-weight: 700;
  font-display: swap;
}
:host {
  all: initial;
}
* {
  box-sizing: border-box;
}
.keyboard {
  position: fixed;
  left: 50%;
  bottom: 14px;
  z-index: 2147483647;
  width: min(780px, calc(100vw - 22px));
  min-width: min(520px, calc(100vw - 22px));
  max-width: calc(100vw - 22px);
  padding: 9px 10px 10px;
  border: 1px solid #e1e4ed;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.98);
  color: #17162b;
  direction: ltr;
  font-family: "Thmanyah Sans", "Noto Sans Arabic", "Segoe UI", system-ui, sans-serif;
  transform: translateX(-50%);
  overflow: hidden;
  pointer-events: auto;
}
.keyboard.is-resizing {
  user-select: none;
}
.keyboard[data-dragged="true"] {
  transform: none;
}
.bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: -9px -10px 7px;
  padding: 12px 8px 6px;
  border-bottom: 1px solid #e6e8f0;
  background: transparent;
  color: #17162b;
  direction: rtl;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.bar::before {
  content: "";
  position: absolute;
  top: 5px;
  left: 50%;
  width: 30px;
  height: 2px;
  border-radius: 2px;
  background: #cfd3e2;
  transform: translateX(-50%);
}
.keyboard.is-dragging .bar {
  cursor: grabbing;
}
.bar-copy {
  display: grid;
  flex: 1;
  gap: 1px;
  min-width: 0;
}
.bar-title {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.01em;
}
.bar-hint {
  color: #5f5c74;
  font-size: 9.5px;
}
.bar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.opacity-control {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: none;
  direction: rtl;
}
.opacity-label {
  color: #5f5c74;
  font-size: 9.5px;
  white-space: nowrap;
}
.opacity-range {
  width: 64px;
  height: 16px;
  margin: 0;
  accent-color: #1a2a9e;
  cursor: pointer;
}
.opacity-value {
  min-width: 28px;
  color: #1a2a9e;
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
  text-align: left;
}
.icon-button {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #6e6b84;
  font: inherit;
  line-height: 1;
  cursor: pointer;
}
.icon-button svg {
  display: block;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}
.icon-button:hover,
.icon-button.is-active {
  color: #111a68;
  background: transparent;
}
.rows {
  display: grid;
  gap: 5px;
}
.row {
  display: flex;
  gap: 4px;
  width: 100%;
  justify-content: center;
  direction: rtl;
}
.key {
  flex: 0 1 auto;
  min-width: 30px;
  height: 34px;
  padding: 0 4px;
  border: 1px solid #e0e2ea;
  border-radius: 6px;
  background: #fff;
  color: #17162b;
  font-family: inherit;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: background 100ms ease, border-color 100ms ease;
}
.key:hover {
  border-color: #aeb4d0;
  background: #f5f6fb;
}
.key:active {
  background: #eceefa;
}
.key.digit {
  color: #1a2a9e;
  font-size: 18px;
}
.key.space {
  min-width: 132px;
  font-size: 14px;
}
.key.utility {
  flex: 0 0 auto;
  min-width: 44px;
  padding: 0 10px;
  color: #1a2a9e;
  font-size: 19px;
}
.key.utility.enter-key {
  min-width: 54px;
}
.status {
  min-height: 14px;
  margin-top: 4px;
  padding: 0 18px;
  direction: rtl;
  color: #b42318;
  font-size: 10.5px;
  text-align: center;
}
.status[hidden] {
  display: none;
}
.resize-handle {
  position: absolute;
  right: 4px;
  bottom: 4px;
  z-index: 2;
  width: 16px;
  height: 16px;
  border-radius: 2px;
  background: repeating-linear-gradient(
    135deg,
    transparent 0 4px,
    currentColor 4px 5px
  );
  color: #aeb4d0;
  cursor: nwse-resize;
  opacity: 0.65;
  touch-action: none;
}
.resize-handle:hover,
.keyboard.is-resizing .resize-handle {
  color: #1a2a9e;
  opacity: 1;
}
.edge-handle {
  position: fixed;
  top: 50%;
  right: 0;
  z-index: 2147483647;
  display: none;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 74px;
  padding: 0;
  border: 1px solid #dfe2eb;
  border-right: 0;
  border-radius: 9px 0 0 9px;
  background: rgba(255, 255, 255, 0.97);
  color: #1a2a9e;
  cursor: pointer;
  transform: translateY(-50%);
  transition: width 120ms ease;
}
.edge-handle::before {
  content: "";
  width: 2px;
  height: 28px;
  border-radius: 2px;
  background: currentColor;
  opacity: 0.55;
}
.edge-handle:hover {
  width: 18px;
}
.edge-handle[data-side="left"] {
  right: auto;
  left: 0;
  border-right: 1px solid #dfe2eb;
  border-left: 0;
  border-radius: 0 9px 9px 0;
}
@media (max-width: 560px) {
  .keyboard {
    bottom: 8px;
    width: calc(100vw - 10px);
    max-width: calc(100vw - 10px);
    padding: 7px 7px 8px;
  }
  .bar {
    margin: -7px -7px 6px;
    padding: 11px 6px 5px;
  }
  .opacity-label,
  .opacity-value,
  .bar-hint {
    display: none;
  }
  .opacity-range {
    width: 48px;
  }
  .row {
    gap: 2px;
  }
  .key {
    min-width: 18px;
    height: 29px;
    padding: 0;
    font-size: 18px;
  }
  .key.space {
    min-width: 82px;
    font-size: 13px;
  }
  .key.utility {
    min-width: 34px;
    padding: 0 5px;
    font-size: 17px;
  }
  .key.utility.enter-key {
    min-width: 42px;
  }
  .resize-handle {
    width: 14px;
    height: 14px;
  }
  .edge-handle {
    height: 58px;
  }
}
@media (prefers-color-scheme: dark) {
  .keyboard {
    border-color: #34324a;
    background: rgba(24, 23, 38, 0.98);
    color: #f3f1ff;
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.45);
  }
  .bar {
    border-bottom-color: #34324a;
    color: #f3f1ff;
  }
  .bar::before {
    background: #575470;
  }
  .bar-hint,
  .opacity-label {
    color: #b9b5d0;
  }
  .opacity-value,
  .icon-button:hover,
  .icon-button.is-active,
  .key.digit,
  .key.utility,
  .resize-handle:hover,
  .keyboard.is-resizing .resize-handle,
  .edge-handle {
    color: #aeb8ff;
  }
  .opacity-range {
    accent-color: #aeb8ff;
  }
  .key {
    border-color: #3d3a55;
    background: #27253b;
    color: #f3f1ff;
  }
  .key:hover {
    border-color: #625e86;
    background: #32304b;
  }
  .key:active {
    background: #3b3858;
  }
  .icon-button {
    color: #c7c3dd;
  }
  .status {
    color: #ff9b8f;
  }
  .resize-handle {
    color: #625e86;
  }
  .edge-handle {
    border-color: #34324a;
    background: rgba(24, 23, 38, 0.97);
  }
  .edge-handle[data-side="left"] {
    border-right-color: #34324a;
  }
}
`;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

const ICON_MINIMIZE = ['M5 12h14'];
const ICON_CLOSE = ['M6 6l12 12', 'M18 6L6 18'];

/**
 * The floating Arabic keyboard shown inside a web page. The user opens it
 * from the popup, can drag it anywhere, and types into the last focused
 * field without losing the selection.
 */
export class FloatingKeyboard {
  private readonly host: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly handle: HTMLButtonElement;
  private readonly resizeHandle: HTMLDivElement;
  private readonly opacityInput: HTMLInputElement;
  private readonly opacityValue: HTMLOutputElement;
  private readonly status: HTMLDivElement;
  private readonly options: FloatingKeyboardOptions;
  private lastField: SupportedField | null = null;
  private drag: DragState | null = null;
  private resizeState: ResizeState | null = null;
  private visible = false;
  private collapsed = false;
  private opacity = 1;

  constructor(options: FloatingKeyboardOptions = {}) {
    this.options = options;

    this.host = document.createElement('div');
    this.host.setAttribute('data-arabictype-ui', '');
    this.host.style.display = 'none';

    const shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = KEYBOARD_STYLE;

    this.panel = document.createElement('div');
    this.panel.className = 'keyboard';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'لوحة مفاتيح عربية عائمة');

    const bar = document.createElement('div');
    bar.className = 'bar';

    const barCopy = document.createElement('div');
    barCopy.className = 'bar-copy';
    const title = document.createElement('span');
    title.className = 'bar-title';
    title.textContent = 'لوحة مفاتيح عربية';
    const hint = document.createElement('span');
    hint.className = 'bar-hint';
    hint.textContent = 'اسحب الرأس للتحريك · المقبض للتكبير';
    barCopy.append(title, hint);

    const barActions = document.createElement('div');
    barActions.className = 'bar-actions';

    const opacityControl = document.createElement('div');
    opacityControl.className = 'opacity-control';
    opacityControl.title = 'شفافية اللوحة';

    const opacityLabel = document.createElement('label');
    opacityLabel.className = 'opacity-label';
    opacityLabel.htmlFor = 'floating-keyboard-opacity';
    opacityLabel.textContent = 'شفافية';

    this.opacityInput = document.createElement('input');
    this.opacityInput.id = 'floating-keyboard-opacity';
    this.opacityInput.className = 'opacity-range';
    this.opacityInput.type = 'range';
    this.opacityInput.min = '35';
    this.opacityInput.max = '100';
    this.opacityInput.step = '1';
    this.opacityInput.value = '86';
    this.opacityInput.setAttribute('aria-label', 'شفافية لوحة المفاتيح');
    this.opacityInput.addEventListener('input', () => {
      this.setOpacity(normalizeKeyboardOpacity(this.opacityInput.value));
    });
    this.opacityInput.addEventListener('change', () => {
      void saveKeyboardOpacity(this.opacity).catch(() => {
        this.setStatus('تعذّر حفظ إعداد الشفافية.');
      });
    });

    this.opacityValue = document.createElement('output');
    this.opacityValue.className = 'opacity-value';
    this.opacityValue.setAttribute('for', 'floating-keyboard-opacity');
    this.opacityValue.textContent = '86%';

    opacityControl.append(opacityLabel, this.opacityInput, this.opacityValue);

    const minimize = this.createIconButton(
      'تصغير اللوحة إلى حافة الشاشة',
      ICON_MINIMIZE,
    );
    minimize.addEventListener('click', () => this.collapse());

    const close = this.createIconButton('إغلاق اللوحة', ICON_CLOSE);
    close.addEventListener('click', () => {
      this.hide();
      this.options.onClose?.();
    });
    barActions.append(opacityControl, minimize, close);
    bar.append(barCopy, barActions);

    const rows = document.createElement('div');
    rows.className = 'rows';

    const digitRow = document.createElement('div');
    digitRow.className = 'row';
    for (const digit of ARABIC_KEYBOARD_DIGITS) {
      const digitKey = this.createKey(digit, digit);
      digitKey.classList.add('digit');
      digitRow.append(digitKey);
    }
    rows.append(digitRow);

    for (const [rowIndex, row] of ARABIC_KEYBOARD_ROWS.entries()) {
      const rowEl = document.createElement('div');
      rowEl.className = 'row';

      if (rowIndex === 0) {
        rowEl.append(
          this.createUtilityKey('⌫', 'مسح الحرف السابق', 'backspace', () =>
            this.deleteBack(),
          ),
        );
      } else if (rowIndex === 1) {
        rowEl.append(
          this.createUtilityKey(
            '↵',
            'إدخال سطر أو إرسال النموذج',
            'enter-key',
            () => this.enter(),
          ),
        );
      }

      for (const key of row) {
        rowEl.append(this.createKey(key, key === ' ' ? 'مسافة' : key));
      }
      rows.append(rowEl);
    }

    this.status = document.createElement('div');
    this.status.className = 'status';
    this.status.hidden = true;
    this.status.setAttribute('role', 'status');

    this.resizeHandle = document.createElement('div');
    this.resizeHandle.className = 'resize-handle';
    this.resizeHandle.setAttribute('role', 'separator');
    this.resizeHandle.setAttribute('aria-orientation', 'horizontal');
    this.resizeHandle.setAttribute('aria-label', 'تغيير عرض اللوحة');
    this.resizeHandle.title = 'اسحب لتغيير عرض اللوحة';
    this.resizeHandle.addEventListener('pointerdown', this.onResizeStart);
    this.resizeHandle.addEventListener('pointermove', this.onResizeMove);
    this.resizeHandle.addEventListener('pointerup', this.onResizeEnd);
    this.resizeHandle.addEventListener('pointercancel', this.onResizeEnd);

    this.handle = document.createElement('button');
    this.handle.type = 'button';
    this.handle.className = 'edge-handle';
    this.handle.setAttribute('aria-label', 'إظهار لوحة المفاتيح');
    this.handle.setAttribute('title', 'إظهار لوحة المفاتيح');
    this.handle.addEventListener('click', () => this.show());

    this.panel.append(bar, rows, this.status, this.resizeHandle);
    shadow.append(style, this.panel, this.handle);
    document.documentElement.append(this.host);

    bar.addEventListener('pointerdown', this.onDragStart);
    bar.addEventListener('pointermove', this.onDragMove);
    bar.addEventListener('pointerup', this.onDragEnd);
    bar.addEventListener('pointercancel', this.onDragEnd);
    bar.addEventListener('dblclick', (event) => {
      if (
        (event.target as Element | null)?.closest('button, input, label, select, textarea')
      ) {
        return;
      }
      this.resetPosition();
    });

    document.addEventListener('focusin', this.onFocusIn, true);
    window.addEventListener('resize', this.onResize);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  show(): void {
    this.visible = true;
    this.collapsed = false;
    this.host.style.display = 'block';
    this.panel.style.display = 'block';
    this.handle.style.display = 'none';
  }

  /** Shows only the edge line so the keyboard can be opened on any page. */
  showLauncher(): void {
    this.visible = false;
    this.collapsed = true;
    this.host.style.display = 'block';
    this.panel.style.display = 'none';
    this.handle.dataset.side = 'left';
    this.handle.style.top = '50%';
    this.handle.style.display = 'flex';
  }

  hide(): void {
    this.visible = false;
    this.collapsed = false;
    this.host.style.display = 'none';
    this.panel.style.display = '';
    this.handle.style.display = 'none';
  }

  setVisible(visible: boolean): void {
    if (visible) {
      this.show();
    } else {
      this.hide();
    }
  }

  setOpacity(value: number): void {
    this.opacity = clamp(normalizeKeyboardOpacity(value), 0.35, 1);
    this.panel.style.opacity = String(this.opacity);

    const percent = Math.round(this.opacity * 100);
    const text = `${percent}%`;
    if (this.opacityInput.value !== String(percent)) {
      this.opacityInput.value = String(percent);
    }
    this.opacityValue.textContent = text;
  }

  private collapse(): void {
    if (!this.visible) return;

    const rect = this.panel.getBoundingClientRect();
    const center = rect.top + rect.height / 2;

    this.collapsed = true;
    this.handle.dataset.side = 'left';
    this.handle.style.top = `${Math.round(
      clamp(center, 44, window.innerHeight - 44),
    )}px`;
    this.panel.style.display = 'none';
    this.handle.style.display = 'flex';
  }

  destroy(): void {
    document.removeEventListener('focusin', this.onFocusIn, true);
    window.removeEventListener('resize', this.onResize);
    this.host.remove();
  }

  private createIconButton(
    label: string,
    paths: string[],
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-button';
    button.setAttribute('aria-label', label);
    button.title = label;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const definition of paths) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', definition);
      svg.append(path);
    }
    button.append(svg);
    return button;
  }

  private createKey(value: string, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = value === ' ' ? 'key space' : 'key';
    button.dataset.key = value;
    button.textContent = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('mousedown', (event) => {
      // Keep the selection in the page field when pressing a key.
      event.preventDefault();
    });
    button.addEventListener('click', () => this.insert(value));
    return button;
  }

  private createUtilityKey(
    label: string,
    ariaLabel: string,
    className: string,
    action: () => void,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `key utility ${className}`;
    button.textContent = label;
    button.setAttribute('aria-label', ariaLabel);
    button.title = ariaLabel;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', action);
    return button;
  }

  private insert(value: string): void {
    const field = this.currentField();
    if (!field) {
      this.setStatus('انقر داخل حقل كتابة أولاً.');
      return;
    }

    if (insertTextIntoField(field, value)) {
      this.lastField = field;
      this.setStatus('');
    } else {
      this.setStatus('تعذّر الإدراج في هذا الحقل.');
    }
  }

  private deleteBack(): void {
    const field = this.currentField();
    if (!field) {
      this.setStatus('انقر داخل حقل كتابة أولاً.');
      return;
    }

    if (deleteTextBeforeCaret(field)) {
      this.lastField = field;
      this.setStatus('');
    } else {
      this.setStatus('لا يوجد حرف قبل المؤشر.');
    }
  }

  private enter(): void {
    const field = this.currentField();
    if (!field) {
      this.setStatus('انقر داخل حقل كتابة أولاً.');
      return;
    }

    if (field instanceof HTMLInputElement) {
      const form = field.form;
      if (form) {
        try {
          form.requestSubmit();
        } catch {
          form.submit();
        }
        this.lastField = field;
        this.setStatus('');
        return;
      }

      field.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      );
      this.lastField = field;
      this.setStatus('');
      return;
    }

    if (insertTextIntoField(field, '\n')) {
      this.lastField = field;
      this.setStatus('');
    } else {
      this.setStatus('تعذّر إدراج سطر جديد في هذا الحقل.');
    }
  }

  private currentField(): SupportedField | null {
    const active = getSupportedField(document.activeElement);
    if (active?.isConnected) return active;
    return this.lastField?.isConnected ? this.lastField : null;
  }

  private setStatus(message: string): void {
    this.status.textContent = message;
    this.status.hidden = !message;
  }

  private onFocusIn = (event: FocusEvent): void => {
    const element = getEventTargetElement(event);
    const field = getSupportedField(element);
    if (field) this.lastField = field;
  };

  private onDragStart = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('button, input, label, select, textarea')
    ) {
      return;
    }

    const rect = this.panel.getBoundingClientRect();
    this.drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };

    this.panel.dataset.dragged = 'true';
    this.panel.style.left = `${Math.round(rect.left)}px`;
    this.panel.style.top = `${Math.round(rect.top)}px`;
    this.panel.style.bottom = 'auto';
    this.panel.classList.add('is-dragging');

    const bar = event.currentTarget as HTMLElement;
    try {
      bar.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events and older engines may not allow pointer capture.
    }
    event.preventDefault();
  };

  private onDragMove = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;

    const rect = this.panel.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    const left = clamp(event.clientX - this.drag.offsetX, 0, maxLeft);
    const top = clamp(event.clientY - this.drag.offsetY, 0, maxTop);

    this.panel.style.left = `${Math.round(left)}px`;
    this.panel.style.top = `${Math.round(top)}px`;
  };

  private onDragEnd = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    this.panel.classList.remove('is-dragging');
    const bar = event.currentTarget as HTMLElement;
    if (bar.hasPointerCapture(event.pointerId)) {
      bar.releasePointerCapture(event.pointerId);
    }
  };

  private onResizeStart = (event: PointerEvent): void => {
    if (event.button !== 0) return;

    const rect = this.panel.getBoundingClientRect();
    this.resizeState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: rect.width,
      left: rect.left,
    };

    this.panel.dataset.dragged = 'true';
    this.panel.style.left = `${Math.round(rect.left)}px`;
    this.panel.style.top = `${Math.round(rect.top)}px`;
    this.panel.style.bottom = 'auto';
    this.panel.classList.add('is-resizing');

    const handle = event.currentTarget as HTMLElement;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events and older engines may not allow pointer capture.
    }
    event.preventDefault();
    event.stopPropagation();
  };

  private onResizeMove = (event: PointerEvent): void => {
    if (!this.resizeState || event.pointerId !== this.resizeState.pointerId) {
      return;
    }

    const minWidth = Math.min(520, window.innerWidth - 10);
    const maxWidth = Math.max(
      minWidth,
      window.innerWidth - this.resizeState.left - 4,
    );
    const width = clamp(
      this.resizeState.startWidth + event.clientX - this.resizeState.startX,
      minWidth,
      maxWidth,
    );

    this.panel.style.width = `${Math.round(width)}px`;
  };

  private onResizeEnd = (event: PointerEvent): void => {
    if (!this.resizeState || event.pointerId !== this.resizeState.pointerId) {
      return;
    }
    this.resizeState = null;
    this.panel.classList.remove('is-resizing');
    const handle = event.currentTarget as HTMLElement;
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
  };

  private onResize = (): void => {
    if (this.collapsed) {
      const top =
        Number.parseFloat(this.handle.style.top) || window.innerHeight / 2;
      this.handle.style.top = `${Math.round(
        clamp(top, 44, window.innerHeight - 44),
      )}px`;
      return;
    }
    if (this.panel.dataset.dragged !== 'true') return;
    const rect = this.panel.getBoundingClientRect();
    const left = clamp(rect.left, 0, Math.max(0, window.innerWidth - rect.width));
    const top = clamp(rect.top, 0, Math.max(0, window.innerHeight - rect.height));
    this.panel.style.left = `${Math.round(left)}px`;
    this.panel.style.top = `${Math.round(top)}px`;
  };

  private resetPosition(): void {
    this.panel.dataset.dragged = 'false';
    this.panel.style.removeProperty('left');
    this.panel.style.removeProperty('top');
    this.panel.style.removeProperty('bottom');
    this.panel.style.removeProperty('width');
  }
}
