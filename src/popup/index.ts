import '../styles/base.css';
import '../styles/site.css';
import './popup.css';
import {
  openExternal,
  REPO_URL,
  VERSION,
  isExtensionContext,
} from '../shared/constants';
import { getExtensionApi } from '../shared/api';
import { createEngineFromSettings } from '../shared/engine';
import { parseDictionary, parseRules } from '../engine';
import { UNDO_MESSAGE, type UndoResponse } from '../shared/messages';
import {
  isConversionMode,
  isSitePaused,
  normalizeSettings,
  togglePausedSite,
  type Settings,
} from '../shared/settings';
import {
  type KeyboardMode,
  loadKeyboardMode,
  normalizeKeyboardMode,
  subscribeKeyboardMode,
} from '../shared/keyboard';
import { loadSettings, saveSettings, subscribeSettings } from '../shared/storage';
import {
  applyKeyboardMode,
  initArabicKeyboard,
  insertIntoActiveTab,
} from './keyboard';
import { findActiveTab, hostFromUrl } from './tab';

const elements = {
  version: document.querySelector<HTMLElement>('#version'),
  statusCard: document.querySelector<HTMLElement>('#status-card'),
  statusTitle: document.querySelector<HTMLElement>('#status-title'),
  statusKicker: document.querySelector<HTMLElement>('#status-kicker'),
  statusDetail: document.querySelector<HTMLElement>('#status-detail'),
  toggle: document.querySelector<HTMLButtonElement>('#enabled-toggle'),
  modeGroup: document.querySelector<HTMLFieldSetElement>('#mode-group'),
  modeDescription: document.querySelector<HTMLElement>('#mode-description'),
  chatNumbers: document.querySelector<HTMLInputElement>('#chat-numbers'),
  sitePanel: document.querySelector<HTMLElement>('#site-panel'),
  siteHost: document.querySelector<HTMLElement>('#site-host'),
  sitePause: document.querySelector<HTMLInputElement>('#site-pause'),
  skipEnglish: document.querySelector<HTMLInputElement>('#skip-english'),
  customRules: document.querySelector<HTMLTextAreaElement>('#custom-rules'),
  customDictionary:
    document.querySelector<HTMLTextAreaElement>('#custom-dictionary'),
  rulesErrors: document.querySelector<HTMLUListElement>('#rules-errors'),
  dictionaryErrors:
    document.querySelector<HTMLUListElement>('#dictionary-errors'),
  rulesSummary: document.querySelector<HTMLElement>('#rules-summary'),
  dictionarySummary:
    document.querySelector<HTMLElement>('#dictionary-summary'),
  openRepo: document.querySelector<HTMLButtonElement>('#open-repo'),
  undo: document.querySelector<HTMLButtonElement>('#undo-button'),
  note: document.querySelector<HTMLElement>('#popup-note'),
  tabButtons: Array.from(document.querySelectorAll<HTMLButtonElement>('.side-nav-item[data-tab]')),
  panels: Array.from(document.querySelectorAll<HTMLElement>('.popup-panel')),
  keyboardContainer: document.querySelector<HTMLElement>('#arabic-keyboard'),
  keyboardInput: document.querySelector<HTMLTextAreaElement>('#arabic-keyboard-input'),
  kbdCopy: document.querySelector<HTMLButtonElement>('#kbd-copy'),
  kbdClear: document.querySelector<HTMLButtonElement>('#kbd-clear'),
  kbdInsert: document.querySelector<HTMLButtonElement>('#kbd-insert'),
  kbdModeGroup: document.querySelector<HTMLFieldSetElement>('#kbd-mode-group'),
  kbdModeHint: document.querySelector<HTMLElement>('#kbd-mode-hint'),
};

const MODE_DESCRIPTION_AR: Record<Settings['mode'], string> = {
  automatic: 'حوّل كل كلمة فور الضغط على المسافة أو علامة الترقيم.',
  preview: 'اعرض المعاينة أثناء الكتابة ثم أدرجها عند المسافة أو الترقيم.',
  suggestions: 'اقترح تهجئات من القاموس. اختر بـ Alt+1–6 ثم تابع.',
};

let settings: Settings = normalizeSettings(undefined);
let keyboardMode: KeyboardMode = 'inline';
let currentHost: string | null = null;
let noteTimer: ReturnType<typeof setTimeout> | null = null;
let configSaveTimer: ReturnType<typeof setTimeout> | null = null;
let saveChain: Promise<void> = Promise.resolve();

function showNote(message: string, duration = 4200): void {
  if (!elements.note) return;
  elements.note.textContent = message;
  elements.note.hidden = false;
  if (noteTimer !== null) clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    if (elements.note) elements.note.hidden = true;
  }, duration);
}

function setRadioMode(): void {
  if (!elements.modeGroup) return;
  for (const input of elements.modeGroup.querySelectorAll<HTMLInputElement>(
    'input[name="mode"]',
  )) {
    input.checked = input.value === settings.mode;
  }
}

function fillErrors(list: HTMLUListElement | null, errors: string[]): void {
  if (!list) return;
  list.replaceChildren(
    ...errors.map((error) => {
      const item = document.createElement('li');
      item.textContent = error;
      return item;
    }),
  );
  list.hidden = errors.length === 0;
}

function renderConfig(): void {
  if (
    elements.customRules &&
    document.activeElement !== elements.customRules
  ) {
    elements.customRules.value = settings.customRules;
  }
  if (
    elements.customDictionary &&
    document.activeElement !== elements.customDictionary
  ) {
    elements.customDictionary.value = settings.customDictionary;
  }

  const engine = createEngineFromSettings(settings);

  const rules = parseRules(settings.customRules);
  fillErrors(elements.rulesErrors, rules.errors);
  if (elements.rulesSummary) {
    elements.rulesSummary.textContent = settings.customRules.trim()
      ? `${rules.rules.length} قاعدة مخصصة · ${engine.ruleCount} قاعدة إجمالاً`
      : `القواعد المدمجة مفعّلة · ${engine.ruleCount} قاعدة`;
  }

  const dictionary = parseDictionary(settings.customDictionary);
  const entryCount = Object.keys(dictionary.entries).length;
  fillErrors(elements.dictionaryErrors, dictionary.errors);
  if (elements.dictionarySummary) {
    elements.dictionarySummary.textContent = settings.customDictionary.trim()
      ? `${entryCount} كلمة مخصصة · ${engine.dictionarySize} كلمة إجمالاً`
      : `القاموس المدمج مفعّل · ${engine.dictionarySize} كلمة`;
  }
}

function render(): void {
  const paused = currentHost
    ? isSitePaused(settings, currentHost)
    : false;
  const enabled = settings.enabled;

  if (elements.toggle) {
    elements.toggle.setAttribute('aria-checked', String(enabled));
    elements.toggle.classList.toggle('is-on', enabled);
    elements.toggle.setAttribute(
      'aria-label',
      enabled ? 'إيقاف Huruv' : 'تفعيل Huruv',
    );
  }

  if (elements.statusCard) {
    elements.statusCard.dataset.state = enabled ? 'on' : 'off';
  }

  if (elements.statusTitle) {
    elements.statusTitle.textContent = enabled
      ? 'Huruv مفعل'
      : 'Huruv موقوف';
  }

  if (elements.statusKicker) {
    elements.statusKicker.textContent = enabled
      ? paused
        ? 'متوقف هنا'
        : 'مفعل'
      : 'موقوف';
  }

  if (elements.statusDetail) {
    if (!enabled) {
      elements.statusDetail.textContent =
        'الكتابة تبقى كما هي. شغّل Huruv عندما تكون جاهزاً.';
    } else if (paused && currentHost) {
      elements.statusDetail.textContent = `متوقف في ${currentHost}. بقية المواقع تعمل.`;
    } else {
      elements.statusDetail.textContent = MODE_DESCRIPTION_AR[settings.mode];
    }
  }

  setRadioMode();

  if (elements.chatNumbers) {
    elements.chatNumbers.checked = settings.chatNumbers;
  }

  if (elements.skipEnglish) {
    elements.skipEnglish.checked = settings.skipEnglish;
  }

  renderConfig();

  if (elements.modeDescription) {
    elements.modeDescription.textContent = MODE_DESCRIPTION_AR[settings.mode];
  }

  if (elements.sitePanel && elements.siteHost && elements.sitePause) {
    if (currentHost) {
      elements.sitePanel.hidden = false;
      elements.siteHost.textContent = currentHost;
      elements.siteHost.title = currentHost;
      elements.sitePause.checked = paused;
    } else {
      elements.sitePanel.hidden = true;
    }
  }
}

function renderKeyboardMode(): void {
  if (elements.kbdModeGroup) {
    for (const input of elements.kbdModeGroup.querySelectorAll<HTMLInputElement>(
      'input[name="kbd-mode"]',
    )) {
      const selected = input.value === keyboardMode;
      input.checked = selected;
      input.closest('.kbd-mode-option')?.classList.toggle('is-selected', selected);
    }
  }

  if (elements.kbdModeHint) {
    elements.kbdModeHint.textContent =
      keyboardMode === 'floating'
        ? 'تظهر أسفل الصفحة، وخطّها الجانبي الأيسر متاح في كل الصفحات. اضبط الشفافية من شريط اللوحة، واسحب المقبض لتكبيرها، وصغّرها لتصبح خطاً على الحافة.'
        : 'تظهر هنا فقط. اختر «عائمة» لاستخدامها داخل أي صفحة.';
  }
}

function queueSave(snapshot: Settings): Promise<void> {
  // Serialize writes so a slow earlier save can never overwrite a newer one.
  saveChain = saveChain.then(async () => {
    try {
      await saveSettings(snapshot);
    } catch {
      showNote('Could not save settings. Please try again.');
    }
  });
  return saveChain;
}

async function persistAndRender(next: Settings): Promise<void> {
  settings = next;
  render();
  await queueSave(settings);
}

function flushConfigSave(): void {
  if (configSaveTimer === null) return;
  clearTimeout(configSaveTimer);
  configSaveTimer = null;
  void queueSave(settings);
}

function persistConfig(next: Settings): void {
  settings = next;
  renderConfig();
  if (configSaveTimer !== null) clearTimeout(configSaveTimer);
  configSaveTimer = setTimeout(() => {
    configSaveTimer = null;
    void queueSave(settings);
  }, 320);
}

function getVersion(): string {
  if (isExtensionContext()) {
    try {
      return getExtensionApi()?.runtime?.getManifest().version ?? VERSION;
    } catch {
      return VERSION;
    }
  }
  return VERSION;
}

function bindEvents(): void {
  elements.toggle?.addEventListener('click', () => {
    const enabled = !settings.enabled;
    void persistAndRender({ ...settings, enabled });
  });

  elements.modeGroup?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!isConversionMode(target.value)) return;
    void persistAndRender({ ...settings, mode: target.value });
  });

  elements.chatNumbers?.addEventListener('change', () => {
    if (!elements.chatNumbers) return;
    void persistAndRender({
      ...settings,
      chatNumbers: elements.chatNumbers.checked,
    });
  });

  elements.skipEnglish?.addEventListener('change', () => {
    if (!elements.skipEnglish) return;
    void persistAndRender({
      ...settings,
      skipEnglish: elements.skipEnglish.checked,
    });
  });

  elements.customRules?.addEventListener('input', () => {
    if (!elements.customRules) return;
    persistConfig({ ...settings, customRules: elements.customRules.value });
  });

  elements.customDictionary?.addEventListener('input', () => {
    if (!elements.customDictionary) return;
    persistConfig({
      ...settings,
      customDictionary: elements.customDictionary.value,
    });
  });

  elements.sitePause?.addEventListener('change', () => {
    if (!currentHost || !elements.sitePause) return;
    void persistAndRender(
      togglePausedSite(settings, currentHost, elements.sitePause.checked),
    );
  });

  elements.openRepo?.addEventListener('click', () => {
    openExternal(REPO_URL);
  });

  elements.undo?.addEventListener('click', () => {
    void handleUndo();
  });

  for (const button of elements.tabButtons) {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      if (!tab) return;
      for (const candidate of elements.tabButtons) {
        candidate.classList.toggle('is-active', candidate === button);
        candidate.setAttribute(
          'aria-current',
          candidate === button ? 'page' : 'false',
        );
      }
      for (const panel of elements.panels) {
        panel.hidden = panel.dataset.view !== tab;
      }
    });
  }

  if (elements.keyboardContainer && elements.keyboardInput) {
    initArabicKeyboard(elements.keyboardContainer, elements.keyboardInput);
  }

  elements.kbdCopy?.addEventListener('click', async () => {
    const value = elements.keyboardInput?.value ?? '';
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showNote('تم النسخ');
    } catch {
      showNote('تعذّر النسخ. انسخ النص يدوياً.');
    }
  });

  elements.kbdClear?.addEventListener('click', () => {
    if (!elements.keyboardInput) return;
    elements.keyboardInput.value = '';
    elements.keyboardInput.focus();
  });

  elements.kbdInsert?.addEventListener('click', async () => {
    const value = elements.keyboardInput?.value ?? '';
    if (!value) return;
    const inserted = await insertIntoActiveTab(value);
    showNote(
      inserted
        ? 'تم الإدراج في الصفحة النشطة'
        : 'انقر داخل حقل كتابة في صفحة ويب ثم حاول مرة أخرى',
    );
  });

  elements.kbdModeGroup?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name !== 'kbd-mode') return;

    keyboardMode = normalizeKeyboardMode(target.value);
    renderKeyboardMode();

    void applyKeyboardMode(keyboardMode).then((applied) => {
      if (keyboardMode === 'floating') {
        showNote(
          applied
            ? 'ظهرت اللوحة أسفل الصفحة. خطّها الجانبي متاح في بقية الصفحات، واسحبها من رأسها لتحريكها.'
            : 'افتح صفحة ويب عادية ثم اختر اللوحة العائمة مرة أخرى.',
        );
      }
    });
  });

  // The popup can be dismissed without a blur event firing (Firefox), so flush
  // any pending textarea edit before the document goes away.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushConfigSave();
  });
  window.addEventListener('pagehide', flushConfigSave);
  window.addEventListener('beforeunload', flushConfigSave);
}

async function handleUndo(): Promise<void> {
  const tab = await findActiveTab();
  if (!tab?.id || !hostFromUrl(tab.url)) {
    showNote('Undo is available on regular web pages where Huruv ran.');
    return;
  }

  if (elements.undo) elements.undo.disabled = true;
  try {
    const api = getExtensionApi();
    if (!api?.tabs || typeof api.tabs.sendMessage !== 'function') {
      showNote('No Huruv conversion is available on this page.');
      return;
    }
    const response = (await api.tabs.sendMessage(
      tab.id,
      {
        type: UNDO_MESSAGE,
      },
      { frameId: 0 },
    )) as UndoResponse | undefined;
    if (response?.ok) {
      showNote('The last conversion was restored to Latin text.');
    } else {
      showNote('Nothing to undo on this page.');
    }
  } catch {
    showNote('No Huruv conversion is available on this page.');
  } finally {
    if (elements.undo) elements.undo.disabled = false;
  }
}

async function init(): Promise<void> {
  if (elements.version) elements.version.textContent = `v${getVersion()}`;

  try {
    [settings, keyboardMode] = await Promise.all([
      loadSettings(),
      loadKeyboardMode(),
    ]);
  } catch {
    settings = normalizeSettings(undefined);
    keyboardMode = 'inline';
    showNote('تعذّر تحميل الإعدادات. تم استخدام الإعدادات الافتراضية.');
  }

  const tab = await findActiveTab();
  currentHost = hostFromUrl(tab?.url);

  render();
  renderKeyboardMode();
  bindEvents();

  subscribeSettings((next) => {
    settings = next;
    render();
  });

  subscribeKeyboardMode((next) => {
    keyboardMode = next;
    renderKeyboardMode();
  });
}

void init().catch(() => {
  showNote('تعذّر تشغيل Huruv. أعد فتح النافذة وحاول مرة أخرى.');
});
