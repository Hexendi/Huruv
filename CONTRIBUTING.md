# Contributing to Huruv

Thanks for helping improve Huruv. The project is small on purpose: a
standalone transliteration engine, a content script, and three focused UIs.
Bug reports, dictionary improvements, tests, and documentation fixes are all
welcome.

Please be respectful and constructive. This project follows the spirit of the
[Contributor Covenant](https://www.contributor-covenant.org/): harassment,
personal attacks, and discriminatory language are not acceptable.

## Ways to contribute

- **Report a bug** with the browser version, page type, and steps to reproduce.
  Do not include private text in the report.
- **Improve the dictionary** by adding common Franco-Arabic spellings and
  alternatives.
- **Improve a rule** when a common sequence is mapped incorrectly.
- **Improve the content script** for caret, undo, shadow DOM, or editor
  compatibility.
- **Write tests** for matching, configuration parsing, or field behavior.
- **Improve documentation** for installers, contributors, or end users.

For a larger change, open an issue first so we can agree on the scope. Keep
pull requests focused and avoid unrelated formatting changes.

## Development setup

Requirements: Node.js 20.19+ and npm. A Chromium browser is needed only for
manual extension testing.

```bash
git clone https://github.com/Hexendi/Huruv.git
cd Huruv
npm install
npm run dev
```

The dev server is for the popup, options, and demo pages. The content script is
built separately and is not hot-reloaded by Vite:

```bash
npm run build
# reload the unpacked extension on chrome://extensions
```

Load `dist/` with **Developer mode → Load unpacked** to test the extension.

## Quality checks

Run these before opening a pull request:

```bash
npm run typecheck
npm test
npm run build
```

`npm run check` runs all three. Tests use Vitest and live in `tests/`. Add a
test when you change rules, normalization, dictionary precedence, settings, or
caret helpers.

Manual checks worth doing for content-script changes:

1. Convert a word in a textarea on space and punctuation.
2. Undo with `Alt+Z`, the toast action, and native `Ctrl+Z`.
3. Confirm password and email fields are ignored.
4. Confirm a generic contenteditable works and a code editor is ignored.
5. Toggle the extension off in the popup and type in an open tab.
6. Reload the extension and confirm the toggle and settings persisted.
7. In Preview mode, check the overlay position and `Esc`.
8. In Suggestions mode, choose an alternative with `Alt+2` and click.
9. Pause the current site from the popup and confirm conversion stops.
10. Rebuild after content-script changes and reload the extension.

## Project layout

```text
src/engine/      Pure TypeScript engine, rules, text helpers, JSON dictionary
src/content/     Content script, field handling, overlay, undo
src/shared/      Settings, storage, messages, engine factory
src/popup/       Popup UI and settings
src/styles/      Shared CSS
tests/           Vitest suites
public/          Manifest and icons copied into dist/
docs/            Rules and limitations documentation
```

Keep the engine free of DOM and browser APIs. The engine should remain usable in
unit tests and by other projects without a build-time dependency on the
extension.

## Code style

- TypeScript strict mode is required; run `npm run typecheck`.
- Prefer small, named functions and explicit return types where they clarify
  data flow.
- Use the existing shared settings and storage modules instead of reading
  browser APIs directly in UI code.
- Keep user-visible copy concise and actionable.
- Use semantic HTML, labels, and focus states. The popup must remain keyboard
  accessible.
- Do not add remote fonts, analytics, trackers, or network calls. Huruv is
  local-first by design.
- Do not add permissions without a specific need and a note in the PR. Update
  `PRIVACY.md` and the README permission table if permissions change.
- Avoid introducing a UI framework for a small change. The current UI is
  vanilla TypeScript and CSS.

## Rules and dictionary changes

Read [docs/rules.md](docs/rules.md) first.

- Add a test for every new rule or matching behavior.
- Put the preferred spelling first in a dictionary array.
- Use common, real-world spellings; avoid adding arbitrary transliterations
  that make the suggestion list noisy.
- Keep keys normalized (lowercase, no accents).
- Do not remove an existing spelling just because you prefer another one. Add
  the preferred spelling at the front instead.
- Phrases are supported by the engine and demo. Content-script phrase handling
  is intentionally word-by-word; see [docs/limitations.md](docs/limitations.md).

## Commit and pull request checklist

- The change has a single clear purpose.
- `npm run check` passes.
- New behavior has tests, or the PR explains why a test is not practical.
- Documentation is updated for user-visible behavior.
- No secrets, private text, generated `dist/` files, or `node_modules/` are
  committed.
- The PR describes what changed, why, and how it was tested.
- Permission or privacy changes are called out explicitly.

## Reporting security or privacy issues

Huruv processes text locally and does not operate a server. If you find a
privacy or security problem, avoid posting sensitive details in a public issue.
Open a minimal report describing the class of problem and the affected browser
version; a maintainer can arrange a private follow-up.

## License

By contributing, you agree that your contribution is licensed under the
[MIT License](LICENSE).
