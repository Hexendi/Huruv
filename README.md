<p align="center">
  <img src="public/icons/logo-256.png" width="112" alt="Huruv logo" />
</p>

<h1 align="center">Huruv</h1>

<p align="center">
  Type Arabic with a Latin keyboard. Local, open source, and quietly fast.
</p>

Huruv is a Manifest V3 browser extension that transliterates Latin-script
Arabic into Arabic script while you type. Everything runs in your browser —
there are no accounts, analytics, remote APIs, or network requests for typed
text.

```text
salam   → سلام
marhba  → مرحبا
chokran → شكرا
```

## Features

- **Convert while typing** — completed words are replaced on space,
  punctuation, or Enter, with native caret and selection behavior.
- **Three modes** — Automatic (insert immediately), Preview (see the Arabic
  before inserting), and Suggestions (choose a spelling with `Alt+1`–`6`).
- **A real global toggle** — the large popup switch persists across tabs and
  browser restarts.
- **Per-site pause** — leave Huruv ON globally and pause it only where you
  type English.
- **Recovery built in** — undo the last conversion with the toast action,
  `Alt+Z`, the popup button, or your browser's native `Ctrl+Z`.
- **Dictionary and alternatives** — common words have preferred spellings;
  other spellings appear as suggestions. A local JSON dictionary ships with
  the extension.
- **Darija-aware spellings** — a bundled phrase corpus teaches Huruv entries
  such as `mu7ammad` → محمد, `5adija` → خديجة, and `2l9uran` → القرآن.
- **Arabic keyboard** — use it inline in the popup, or turn on the floating
  keyboard to type into any page. The floating panel sits at the bottom center,
  can be dragged anywhere, has Arabic digits and an Enter key, and can fade or
  collapse to a thin tab on the screen edge.
- **Configurable engine** — add your own rules and words from the popup. No
  rebuild required.
- **Safe field detection** — password, email, URL, telephone, and number fields
  are ignored, as are popular code editors and fields marked
  `data-arabictype-ignore`.
- **Local-first privacy** — no telemetry and no external fonts or services.

## Quick start

Requirements: Node.js 20.19+ (or 22.12+) and a Manifest V3 browser. Chrome 109+,
Edge, Brave, Arc, and other Chromium browsers are supported, along with Firefox
140+ (Firefox for Android 142+).

```bash
git clone https://github.com/Hexendi/Huruv.git
cd Huruv
npm install
npm run build
```

Then load the extension:

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select the generated `dist/` directory.
4. Pin Huruv and open the popup to check that it is ON.

Firefox uses the same generated folder:

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select `dist/manifest.json`.

After changing extension code, run `npm run build` again and press the reload
button for Huruv on the extensions page. Then **refresh any open tabs**
(YouTube, Google, chat apps, etc.). A reloaded extension does not inject its
content script into pages that were already open, so the old tab will appear to
do nothing until it is refreshed.

## Previewing the popup

```bash
npm install
npm run dev
```

Open the local URL printed by Vite with `/popup.html` appended. Outside the
extension the popup stores settings in `localStorage`; tab-specific controls
such as paused sites and undo stay inactive.

To preview the production build:

```bash
npm run build
npm run preview
```

## Usage

Once the extension is ON, it works directly on supported websites — YouTube
search, Google, chat boxes, comment fields, and ordinary forms. You do not need
to open the popup. Type Latin-script Arabic and press space, punctuation, or
Enter.

### Modes

| Mode | Behavior |
| --- | --- |
| Automatic | Converts each word as soon as you press space, punctuation, or Enter. |
| Preview | Shows a small live overlay with the Arabic spelling, then inserts on space, punctuation, or Enter. |
| Suggestions | Shows dictionary alternatives. Pick one with `Alt+1`–`6` or click it, then press space or Enter. |

### Arabic keyboard

Open the keyboard tab in the popup and choose where it should live:

- **Inline** — the keyboard stays inside the popup. Use it to compose text,
  copy it, or insert it into the active page.
- **Floating** — the keyboard appears at the bottom center of the current web
  page, above the page content. Drag the header to move it, double-click the
  header to return it to the bottom center, or use `−` to collapse it to a thin
  tab on the left screen edge. The edge tab is also shown on every other page,
  so the keyboard stays one click away across the browser. Closing with `×`
  switches the preference back to inline.
- **Resize** — drag the grip in the bottom corner to make the keyboard wider or
  narrower. Double-clicking the header restores the default width.
- **Opacity** — the compact opacity slider sits in the keyboard header. The
  edge tab always stays fully visible.

The floating keyboard includes Arabic-Indic digits, a backspace key, and an
Enter key. Backspace sits at the right of the first letter row and Enter at the
right of the second row, instead of a separate action row. Enter inserts a new
line in multiline fields and submits a form in single-line fields when the page
provides one. Each key inserts into the last focused field, so clicking the
panel does not lose the caret.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt+Z` | Restore the last conversion to Latin text. |
| `Alt+1`–`Alt+6` | Choose a suggestion while the overlay is open. |
| `Esc` | Hide the preview. |
| `Ctrl+Z` / `Cmd+Z` | Native browser undo. |

Every conversion also shows a short toast with an **Undo** action. The popup
has an **Undo last conversion** button for the active tab.

### Matching examples

```text
shams        → شمس
khobz        → خبز
gharb        → غرب
3la          → على
7na          → حنا
chokran!     → شكرا!
salam, marhba! → سلام, مرحبا!
mu7ammad     → محمد
5adija       → خديجة
2l9uran      → القرآن
```

Common English words such as `the`, `and`, `hello`, `world`, and `thanks` are
left untouched when **Leave common English words alone** is enabled.

## Rules and dictionary

Built-in rules cover common Franco-Arabic and chat-alphabet conventions:

- Digraphs: `sh`, `ch`, `kh`, `gh`, `th`, `dh`, `ou`, `aa`, and more.
- Chat numbers (on by default when conversion is enabled): `2` → أ, `3` → ع,
  `4` → ذ, `5` → خ, `6` → ط, `7` → ح, `8` → ظ, `9` → ق. You can still turn
  them off in the popup.
- Definite articles: `2l` and `al`/`el` become `ال` where appropriate.
- Whole words and phrases: `marhba`, `chokran`, `sabah el khir`, and others.
- Doubled letters stay doubled; they are not turned into a shadda.

The `a` letter is written as `ا` by default, but dictionary entries and the
Darija phrase corpus can teach short-vowel spellings. For unknown words, Huruv
also offers a no-alif candidate in the suggestion layer.

See [docs/rules.md](docs/rules.md) for the complete rule format, normalization
behavior, dictionary syntax, and extension points. The bundled sample
dictionary lives at
[`src/engine/data/dictionary.json`](src/engine/data/dictionary.json). The
Darija regression corpus is
[`src/engine/data/darija-dataset.json`](src/engine/data/darija-dataset.json).

From the **Rules & dictionary** tab in the popup you can add rules like:

```text
ch => ش
kh => خ
7  => ح
```

and preferred spellings like:

```text
marhba = مرحبا | مرحباً
sabah el khir = صباح الخير
```

The first dictionary spelling is inserted by default; the others become
suggestions.

## Architecture

```text
src/
  engine/          Standalone TypeScript transliteration engine and dictionary
  content/         Content script: field detection, insertion, overlay, undo
  shared/          Settings, storage, keyboard state/layout, messages, constants
  popup/           Extension popup UI and settings
  styles/          Shared CSS
tests/             Vitest unit tests for the engine and settings
public/            Manifest, icons, static assets
```

The engine has no browser dependencies. `Transliterator` can be used from any
JavaScript or TypeScript project, while the extension only provides UI around
it. The content script builds an engine from the same settings stored by the
popup.

The extension uses two Vite builds:

1. The HTML pages, scripts, CSS, manifest, and icons.
2. The content script, bundled separately as a classic IIFE at
   `dist/content.js` because Manifest V3 content scripts are not ES modules.

## Development

```bash
npm install          # install dependencies
npm run dev          # Vite dev server for the popup page
npm run typecheck    # strict TypeScript check
npm test             # engine, search, settings, and dataset tests
npm run test:watch   # watch mode
npm run build        # production build into dist/
npm run check        # typecheck + tests + build
```

After a build, load `dist/` as an unpacked extension. The `dist/` folder is not
committed.

### Tests

The Vitest suite covers rule matching, chat numbers, dictionary
precedence, phrase lookup, fallback transliteration, mixed Arabic/Latin text,
caret helpers, custom configuration parsing, settings normalization, and site
exceptions. Run `npm run check` before opening a pull request.

## Privacy and permissions

Huruv processes all text locally. It does not collect or transmit what you
type, and it contains no analytics or remote code.

| Permission | Why it is needed |
| --- | --- |
| `storage` | Save your toggle, mode, custom rules, dictionary, and paused sites locally. |
| `host_permissions` for `http://*/*` and `https://*/*` | Run the content script that converts text on web pages. |

No `tabs` permission is requested. The popup reads the active tab URL only to
show the per-site pause control. See [PRIVACY.md](PRIVACY.md) for details.

## Known limitations

- **Incremental phrases** — common phrase starters such as `sabah`, `masa`, and
  `insha` wait briefly (about 650 ms) so typed phrases can resolve to a single
  dictionary entry. Typing `sabah el khir` word by word produces `صباح الخير`.
  Less common phrases may still be converted one word at a time.
- **Protected pages and browser UI** — extensions cannot modify `chrome://`
  pages, the Chrome Web Store, the built-in PDF viewer, or other
  browser-internal pages. Firefox browser UI such as the address bar and the
  new-tab search box is also out of reach. Only `http://` and `https://` pages
  are supported; `file://` is not enabled.
- **Google surfaces** — the Google homepage search box (including Arabic
  variants) is supported. Google Docs, Google’s custom Canvas-backed editors,
  and some account flows use non-standard editing surfaces that may not work.
  If a specific Google page fails, include its URL in a bug report.
- **Some editors** — Monaco, CodeMirror, CodeMirror 6, and Ace are explicitly
  ignored. Other highly custom rich-text editors may not support the native
  text insertion path.
- **English heuristic** — the common-word list covers frequent English words,
  and a clearly English prefix prevents the following unknown word from being
  rewritten. Unusual English words can still look transliterable. Toggle the
  feature off or pause a site when needed.
- **Short vowels** — unvocalized Arabic is the default. Fallback output omits
  short vowels and is approximate; the dictionary supplies preferred spellings.
- **Native undo** — the built-in undo may remove the separator space along with
  the insertion. `Alt+Z` and the toast action are the reliable recovery paths.

More detail: [docs/limitations.md](docs/limitations.md).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for
the setup, test, and review checklist. Good first issues include dictionary
entries, rule coverage, and documentation fixes.

If Huruv is useful to you, a star on the repository helps others find it.

## License

[MIT](LICENSE) © Huruv
