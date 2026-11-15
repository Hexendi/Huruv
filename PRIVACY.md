# Privacy

Huruv is designed to work entirely on your device.

## Short version

- No accounts.
- No analytics, telemetry, crash reporting, or advertising.
- No remote API calls.
- No collection or transmission of the text you type.
- No remote fonts, scripts, or images.
- Settings and site exceptions are stored locally.

The only network activity in the project is an ordinary link you choose to open,
such as the GitHub repository or the live demo. The extension itself makes no
requests with page content.

## What is stored

Settings are stored in `chrome.storage.local` under the key
`arabictype.settings.v1`:

- whether Huruv is enabled;
- the selected mode (automatic, preview, or suggestions);
- chat-number and English-passthrough preferences;
- hostnames you have paused;
- custom rule text;
- custom dictionary text.

These values stay in the browser profile on your device. They are not synced to
a server by Huruv. If your browser profile is synced by your browser
vendor, that is controlled by your browser settings, not by this extension.

The standalone demo uses `localStorage` with the same key and does not require
the extension. It stores no typed text.

## What is not stored

- Typed text, converted Arabic output, selections, or snippets.
- Browsing history.
- Page contents.
- Identifiers or usage events.
- Undo history beyond the current page session.

The content script keeps the most recent conversion in memory so the undo
button and `Alt+Z` can restore it. That record is discarded when the converted
Arabic text changes, when you navigate, reload, or close the page. It is never
persisted to storage.

## Permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Save the settings described above locally. |
| `host_permissions` for `http://*/*` and `https://*/*` | Inject the content script into pages where you may type. This is required for real-time conversion; Chrome content scripts cannot run without host access. |

No `tabs` permission is requested. The popup uses `chrome.tabs.query` only to
identify the active tab's hostname for the per-site pause control and to send
the undo request. Host permissions allow the URL to be read for that control.
On protected pages, the site panel is hidden and no access is attempted.

The manifest does not request `activeTab`, `scripting`, `clipboardWrite`,
`notifications`, `history`, `cookies`, or any other permission.

## Page access boundaries

The content script is intentionally excluded from:

- password, email, URL, telephone, and number inputs;
- disabled and read-only fields;
- one-time-code and credit-card autocomplete fields;
- Monaco, CodeMirror, CodeMirror 6, and Ace editors;
- elements marked `data-arabictype-ignore`, Grammarly editor attributes, or
  `aria-readonly` / `aria-disabled`;
- browser-internal pages such as `chrome://`, the Chrome Web Store, and the PDF
  viewer.

## Undo and the clipboard

The undo action restores the last conversion to Latin text in the same field. It
does not read the clipboard. The demo has explicit **Copy** buttons; those use
the browser Clipboard API only after your click, and the copied text is not sent
anywhere.

## Third-party services

The extension bundles its own CSS and icon assets. It does not load Google Fonts,
CDNs, analytics scripts, or remote dictionaries. The settings and demo pages
link to the GitHub repository; those links open only when you click them.

## Changes

If a future version ever adds a network feature, it must be opt-in and this
document must be updated before release. Contributions that add tracking,
remote logging, or silent network calls will not be accepted.

## Contact

For a privacy concern, open an issue in the repository without including
private text or personal data. For a sensitive report, describe the issue at a
high level and ask for a private follow-up channel.
