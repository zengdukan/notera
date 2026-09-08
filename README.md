# Notera

Notera is a local-first, encrypted note-taking application for Windows, macOS, and Linux. It keeps your workspace on your device, works without an account, and does not require a network connection.

## Features

- **Local and encrypted by default** — Each Profile is an independent, password-protected workspace containing its own notes and attachments.
- **Offline access** — Create, browse, edit, and organize notes without an internet connection.
- **Rich editing** — Write rich-text documents with attachments, emoji, mathematical notation, Mermaid diagrams, and dedicated edit and preview modes.
- **Flexible organization** — Arrange notes in nested folders, move or copy content, search a whole Profile or a selected folder, and quickly revisit favorites and recent notes.
- **Recoverable deletion** — Move notes and folders to the trash, restore them to a chosen location, or permanently delete them.
- **Local version history** — Create named note versions, preview and compare earlier content, restore a version, or copy it into a new note.
- **Portable exports** — Export individual notes as Markdown or PDF, with referenced assets bundled in a ZIP archive when needed.
- **Personalized interface** — Choose light, dark, or system appearance and use Notera in English or Simplified Chinese.
- **Profile security controls** — Lock a Profile on demand, configure automatic locking, rename it, change its master password, or remove its local data from the device.

## Data and Security

Notera stores Profile data locally and uses SQLCipher-backed storage together with encrypted attachment handling. No account registration is required.

Keep your master password safe: Notera cannot recover or reset it. Files exported from Notera are plaintext and are no longer protected by the Profile's encryption.

## Tech Stack

- Electron
- React and TypeScript
- Atlaskit Editor
- SQLCipher
- TanStack Query
- Webpack
- Jest

## Getting Started

### Prerequisites

- [Git](https://git-scm.com/)
- [Node.js 22](https://nodejs.org/)
- npm

### Install and Run

```bash
git clone https://github.com/zengdukan/notera.git
cd notera
npm install
npm start
```

## Development

| Command | Description |
| --- | --- |
| `npm start` | Start Notera in development mode. |
| `npm run test:unit -- --runInBand` | Run the unit test suite. |
| `npm run typecheck` | Type-check the application and workspace packages. |
| `npm run lint` | Run ESLint. |
| `npm run build` | Build the main and renderer processes for production. |
| `npm run package` | Package Notera for the current platform. |
| `npm run verify` | Run the complete project verification pipeline. |

Packaged artifacts are written to `release/build`.

## Roadmap

- Synchronization
- Mobile applications

## Author

Created and maintained by [zengdukan](https://github.com/zengdukan).

Email: [zengdukan@163.com](mailto:zengdukan@163.com)

## License

Notera is licensed under the [Apache License 2.0](LICENSE).
