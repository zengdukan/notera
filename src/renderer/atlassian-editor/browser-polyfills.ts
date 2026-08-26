import { Buffer as BrowserBuffer } from 'buffer';

declare global {
  var Buffer: typeof BrowserBuffer;
}

// Atlaskit Media's image metadata path still expects Node's Buffer global.
// Atlassian's monorepo build injects it, while standalone Vite applications do
// not. Install it before importing any editor or media module.
globalThis.Buffer = BrowserBuffer;
