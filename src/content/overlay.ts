import type { Candidate, ConversionMode } from '../engine/types';
import { extensionUrl } from '../shared/api';

export interface PreviewOptions {
  mode: Extract<ConversionMode, 'preview' | 'suggestions'>;
  source: string;
  arabic: string;
  candidates: Candidate[];
  selectedIndex: number;
  anchor: DOMRect;
  onChoose: (index: number) => void;
}

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

const OVERLAY_STYLE = `
@font-face {
  font-family: "Thmanyah Sans";
  src: url("${extensionUrl('fonts/ThmanyahSans-Regular.woff2')}") format("woff2");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: "Thmanyah Sans";
  src: url("${extensionUrl('fonts/ThmanyahSans-Medium.woff2')}") format("woff2");
  font-style: normal;
  font-weight: 500;
  font-display: swap;
}
@font-face {
  font-family: "Thmanyah Sans";
  src: url("${extensionUrl('fonts/ThmanyahSans-Bold.woff2')}") format("woff2");
  font-style: normal;
  font-weight: 700;
  font-display: swap;
}
@font-face {
  font-family: "Noto Naskh Arabic";
  src: url("${extensionUrl('fonts/NotoNaskhArabic-Regular.woff2')}") format("woff2");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}
:host {
  all: initial;
}
* {
  box-sizing: border-box;
}
.wrap {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483646;
  font-family: "Thmanyah Sans", "Kufam", "Reem Kufi", "IBM Plex Sans Arabic", "Noto Sans Arabic", system-ui, sans-serif;
  color: #17162b;
}
.card {
  position: fixed;
  width: min(320px, calc(100vw - 24px));
  background: #fff;
  border: 1px solid #e5e7ef;
  border-radius: 13px;
  
  padding: 12px 13px 10px;
  pointer-events: auto;
}
.card[hidden] {
  display: none;
}
.eyebrow {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.045em;
  text-transform: uppercase;
  color: #6e6b84;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #1a2a9e;
  
}
.mode {
  margin-left: auto;
  color: #1a2a9e;
  background: #e9ebfc;
  border-radius: 999px;
  padding: 2px 7px;
  font-size: 9.5px;
  letter-spacing: 0.05em;
}
.arabic {
  direction: rtl;
  text-align: right;
  font-family: "Thmanyah Sans", "Kufam", "Reem Kufi", "Noto Naskh Arabic", "Noto Sans Arabic", serif;
  font-size: 26px;
  line-height: 1.55;
  font-weight: 500;
  margin-top: 6px;
  unicode-bidi: plaintext;
  overflow-wrap: anywhere;
}
.source {
  direction: ltr;
  text-align: left;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: #5f5c74;
  margin-top: 1px;
  overflow-wrap: anywhere;
}
.candidates {
  display: grid;
  gap: 5px;
  margin-top: 9px;
}
.candidate {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #e5e7ef;
  border-radius: 8px;
  background: #f6f7fb;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  pointer-events: auto;
}
.candidate:hover,
.candidate[aria-pressed="true"] {
  border-color: #1a2a9e;
  background: #eef1fb;
}
.candidate:focus-visible {
  outline: 2px solid #1a2a9e;
  outline-offset: 1px;
}
.key {
  flex: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 9.5px;
  color: #6e6b84;
  border: 1px solid #d3d0dc;
  border-radius: 4px;
  padding: 1px 4px;
  background: #fff;
}
.option-arabic {
  direction: rtl;
  margin-left: auto;
  font-family: "Thmanyah Sans", "Kufam", "Reem Kufi", "Noto Naskh Arabic", "Noto Sans Arabic", serif;
  font-size: 17px;
  line-height: 1.5;
  unicode-bidi: plaintext;
}
.badge {
  flex: none;
  font-size: 9px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #5f5c74;
}
.footer {
  display: flex;
  gap: 10px;
  margin-top: 9px;
  padding-top: 8px;
  border-top: 1px solid #e8eaf2;
  color: #5f5c74;
  font-size: 10px;
}
.footer span:last-child {
  margin-left: auto;
}
.toast {
  position: fixed;
  left: 50%;
  top: 16px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: calc(100vw - 24px);
  padding: 9px 10px 9px 14px;
  border-radius: 999px;
  background: #10104f;
  color: #fff;
  font-size: 12px;
  pointer-events: auto;
}
.toast[hidden] {
  display: none;
}
.toast-action {
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  font: inherit;
  font-weight: 600;
  padding: 4px 10px;
  cursor: pointer;
}
.toast-action:hover {
  background: rgba(255, 255, 255, 0.18);
}
.toast-action:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
@media (prefers-color-scheme: dark) {
  .card {
    background: #1d1c2b;
    border-color: #37354c;
    color: #f4f3f8;
  }
  .eyebrow,
  .key {
    color: #c9c6d6;
  }
  .source,
  .badge,
  .footer {
    color: #b9b5c8;
  }
  .footer {
    border-top-color: #37354c;
  }
  .candidate {
    background: #26253a;
    border-color: #3d3b53;
  }
  .candidate:hover,
  .candidate[aria-pressed="true"] {
    background: #303052;
    border-color: #8f9bff;
  }
  .key {
    background: #26253a;
    border-color: #46445e;
  }
  .mode {
    color: #c7cdff;
    background: #2f3263;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .card, .toast {
    animation: enter 120ms ease-out;
  }
  @keyframes enter {
    from { opacity: 0; transform: translateY(3px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .toast {
    animation-name: toast-enter;
  }
  @keyframes toast-enter {
    from { opacity: 0; transform: translate(-50%, -4px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
}
`;

export class ContentOverlay {
  private readonly host: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private readonly card: HTMLDivElement;
  private readonly eyebrowText: HTMLSpanElement;
  private readonly modeChip: HTMLSpanElement;
  private readonly arabicEl: HTMLDivElement;
  private readonly sourceEl: HTMLDivElement;
  private readonly candidatesEl: HTMLDivElement;
  private readonly footerEl: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly toastMessage: HTMLSpanElement;
  private readonly toastAction: HTMLButtonElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.host = document.createElement('div');
    this.host.setAttribute('data-arabictype-ui', '');
    this.shadow = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = OVERLAY_STYLE;

    const wrap = document.createElement('div');
    wrap.className = 'wrap';

    this.card = document.createElement('div');
    this.card.className = 'card';
    this.card.hidden = true;
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-label', 'Huruv Arabic preview');

    const eyebrow = document.createElement('div');
    eyebrow.className = 'eyebrow';
    const dot = document.createElement('span');
    dot.className = 'dot';
    this.eyebrowText = document.createElement('span');
    this.eyebrowText.textContent = 'Huruv · Preview';
    this.modeChip = document.createElement('span');
    this.modeChip.className = 'mode';
    this.modeChip.textContent = 'Preview';
    eyebrow.append(dot, this.eyebrowText, this.modeChip);

    this.arabicEl = document.createElement('div');
    this.arabicEl.className = 'arabic';
    this.arabicEl.dir = 'rtl';
    this.arabicEl.lang = 'ar';

    this.sourceEl = document.createElement('div');
    this.sourceEl.className = 'source';
    this.sourceEl.dir = 'ltr';

    this.candidatesEl = document.createElement('div');
    this.candidatesEl.className = 'candidates';
    this.candidatesEl.setAttribute('role', 'group');
    this.candidatesEl.setAttribute('aria-label', 'Spelling suggestions');

    this.footerEl = document.createElement('div');
    this.footerEl.className = 'footer';

    this.card.append(
      eyebrow,
      this.arabicEl,
      this.sourceEl,
      this.candidatesEl,
      this.footerEl,
    );

    this.toast = document.createElement('div');
    this.toast.className = 'toast';
    this.toast.hidden = true;
    this.toast.setAttribute('role', 'status');
    this.toastMessage = document.createElement('span');
    this.toastAction = document.createElement('button');
    this.toastAction.type = 'button';
    this.toastAction.className = 'toast-action';
    this.toastAction.hidden = true;
    this.toastAction.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    this.toastAction.addEventListener('click', () => {
      const handler = this.currentToastAction;
      this.hideToast();
      handler?.();
    });
    this.toast.append(this.toastMessage, this.toastAction);

    wrap.append(this.card, this.toast);
    this.shadow.append(style, wrap);
    document.documentElement.append(this.host);
  }

  private currentToastAction: (() => void) | undefined;

  showPreview(options: PreviewOptions): void {
    this.eyebrowText.textContent =
      options.mode === 'suggestions'
        ? 'Huruv · Choose spelling'
        : 'Huruv · Preview';
    this.modeChip.textContent =
      options.mode === 'suggestions' ? 'Suggestions' : 'Preview';
    this.arabicEl.textContent = options.arabic;
    this.sourceEl.textContent = options.source;

    this.candidatesEl.replaceChildren();
    const showCandidates =
      options.mode === 'suggestions' && options.candidates.length > 1;

    for (let index = 0; index < options.candidates.length; index += 1) {
      if (!showCandidates && index > 0) break;
      const candidate = options.candidates[index];
      if (!candidate) continue;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'candidate';
      button.tabIndex = -1;
      button.setAttribute(
        'aria-pressed',
        String(index === options.selectedIndex),
      );
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      button.addEventListener('click', () => {
        options.onChoose(index);
      });

      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = `Alt+${index + 1}`;

      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent =
        candidate.source === 'dictionary' ? 'Dictionary' : 'Phonetic';

      const arabic = document.createElement('span');
      arabic.className = 'option-arabic';
      arabic.dir = 'rtl';
      arabic.lang = 'ar';
      arabic.textContent = candidate.arabic;

      button.append(key, badge, arabic);
      this.candidatesEl.append(button);
    }

    this.candidatesEl.hidden = !showCandidates;
    this.footerEl.replaceChildren();
    const hint = document.createElement('span');
    hint.textContent =
      options.mode === 'suggestions'
        ? '↑↓ or Alt+1–6'
        : 'Space inserts';
    const dismiss = document.createElement('span');
    dismiss.textContent = 'Esc hides';
    this.footerEl.append(hint, dismiss);

    this.card.hidden = false;
    this.position(options.anchor);
  }

  hidePreview(): void {
    this.card.hidden = true;
  }

  showToast(options: ToastOptions): void {
    this.clearToastTimer();
    this.toastMessage.textContent = options.message;
    this.currentToastAction = options.onAction;

    if (options.actionLabel && options.onAction) {
      this.toastAction.hidden = false;
      this.toastAction.textContent = options.actionLabel;
    } else {
      this.toastAction.hidden = true;
      this.toastAction.textContent = '';
    }

    this.toast.hidden = false;
    this.toastTimer = setTimeout(
      () => this.hideToast(),
      options.duration ?? 6000,
    );
  }

  hideToast(): void {
    this.clearToastTimer();
    this.toast.hidden = true;
    this.currentToastAction = undefined;
  }

  destroy(): void {
    this.clearToastTimer();
    this.host.remove();
  }

  private clearToastTimer(): void {
    if (this.toastTimer !== null) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
  }

  private position(anchor: DOMRect): void {
    const margin = 8;
    const gap = 10;
    const cardRect = this.card.getBoundingClientRect();
    const width = cardRect.width || 320;
    const height = cardRect.height || 140;

    let left = anchor.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

    let top = anchor.bottom + gap;
    if (top + height > window.innerHeight - margin) {
      const above = anchor.top - height - gap;
      top = above >= margin ? above : window.innerHeight - height - margin;
    }
    top = Math.max(margin, top);

    this.card.style.left = `${Math.round(left)}px`;
    this.card.style.top = `${Math.round(top)}px`;
  }
}
