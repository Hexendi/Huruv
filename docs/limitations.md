# Known limitations and design notes

Huruv is deliberately a reliable MVP. These are the boundaries you should
expect today.

## Incremental phrase typing

The content script converts completed words as you press space. Common phrase
starters such as `sabah`, `masa`, `insha`, `kifach`, and `labas` are held for
about 650 ms when they begin a known dictionary phrase. Typing this by hand:

```text
sabah el khir
```

therefore produces the dictionary phrase:

```text
صباح الخير
```

Words that are not phrase starters (including common standalone words such as
`salam`) convert immediately, so normal typing stays responsive. Less common
phrases that are not in the dictionary may still be converted one word at a
time.

## Page access

Extensions cannot run on:

- `chrome://`, `edge://`, and other browser-internal pages;
- the Chrome Web Store;
- the built-in PDF viewer;
- browser settings, new-tab pages, and other protected surfaces;
- Firefox browser UI such as the address bar and new-tab search box.

The manifest only matches `http://*/*` and `https://*/*`. Local `file://` pages
are intentionally not enabled. If you need them for development, load the
unpacked extension and enable file URL access on the extension details page,
then add `file://` to the manifest matches — but that is outside the supported
default configuration.

## Google pages

The standard Google search box on `google.com` and its Arabic variants is a
`textarea` and works with Huruv. Google search result pages are usually
protected by automated-traffic checks, which makes them hard to test from
scripts but does not change how the search box itself works.

Google Docs and other Canvas-backed editors use custom input surfaces rather
than ordinary `textarea` or `contenteditable` fields. They may not convert text,
and Huruv cannot fix that without a dedicated integration. Password fields are
intentionally ignored. If a specific Google page fails, report the exact URL
and field description.

## Fields that are ignored

- `input type="password"`, `email`, `url`, `tel`, and `number`;
- disabled and read-only fields;
- one-time-code and credit-card autocomplete fields;
- Monaco, CodeMirror, CodeMirror 6, and Ace editors;
- anything inside an element with `data-arabictype-ignore`, Grammarly's editor
  attributes, or `aria-readonly` / `aria-disabled`;
- fields inside closed shadow roots.

To exclude a custom editor, add `data-arabictype-ignore` to it or an ancestor:

```html
<div data-arabictype-ignore>
  <div contenteditable="true">...</div>
</div>
```

Custom rich-text editors that do not use a normal selection or that reject
`document.execCommand('insertText')` may not behave correctly. The major code
editors are blocked so that source code is never altered.

## English detection

When **Leave common English words alone** is enabled, a built-in list of English
function words is skipped. This is intentionally a heuristic. An unusual
English word that is not in the list can still be transliterated, especially if
it looks like Arabic transliteration. You can:

- turn the feature off in settings to convert everything;
- pause Huruv for a specific site from the popup.

Words containing the chat digits `3la`, `7na`, and similar bypass the English
list because digits are a strong Arabic signal.

## Approximate fallback

Words that are not in the dictionary use a phonetic fallback. It omits short
vowels, writes long vowels heuristically, chooses hamza carriers at word
starts, and collapses doubled letters. It is not a full Arabic morphology
engine and does not add case endings or diacritics.

Add preferred spellings to the dictionary when accuracy matters. The demo's
spelling inspector is a quick way to compare the dictionary and phonetic
results.

## Undo behavior

Huruv inserts text with native editing commands where possible, so the
browser's own undo stack is usually involved. Recovery options:

- **Alt+Z** restores the last conversion to Latin text.
- The conversion toast has an **Undo** button.
- The popup has **Undo last conversion** for the active tab.
- Native `Ctrl+Z` / `Cmd+Z` may undo the insertion; depending on the browser it
  may also remove the separator space.

The custom undo record stays available until you replace the converted Arabic
text. Typing elsewhere, moving the caret, or opening another field does not
discard it. If the underlying text changed, Huruv refuses to overwrite it and
reports that undo was not possible.

## Selection and IME

- Conversion only happens when the caret is collapsed and no Latin word
  character follows it. Selecting text disables conversion until you place the
  caret again.
- IME composition is ignored (`compositionstart` through `compositionend`), so
  Arabic or other composed input is never rewritten mid-composition.
- Some sites implement their own undo, value setters, or input masks. In those
  cases, native events still fire, but the site may revert the change.

## Settings and sync

- Settings are stored locally, not synced between browsers or profiles.
- Site exceptions are exact hostnames. Pausing `example.com` does not pause
  `mail.example.com`; add each host separately.
- Custom rules and dictionaries are local text. Invalid lines are reported but
  do not block valid lines.
- There is no per-field configuration.

## Browser support

Manifest V3 and `document.execCommand('insertText')` are required. The manifest
sets a minimum Chromium version of 109 and a minimum Firefox version of 140
(Firefox for Android 142). Safari is not supported by this build.

## Reporting a limitation

If you find a page where a supported field behaves incorrectly, open an issue
with:

- browser and version;
- the page type (not the typed text);
- the field type and framework if known;
- whether `Alt+Z` and native undo work.

Please do not include private text in a bug report. A minimal reproduction page
is much more useful.
