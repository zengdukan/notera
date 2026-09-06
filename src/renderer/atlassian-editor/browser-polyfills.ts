import { Buffer as BrowserBuffer } from 'buffer';

declare global {
  var Buffer: typeof BrowserBuffer;

  interface Clipboard {
    write(items: ClipboardItem[]): Promise<void>;
  }
}

// Atlaskit Media's image metadata path still expects Node's Buffer global.
// Atlassian's monorepo build injects it, while standalone Vite applications do
// not. Install it before importing any editor or media module.
globalThis.Buffer = BrowserBuffer;

// In Electron sandbox mode, navigator.clipboard API may exist but fail at
// runtime (e.g. write() rejects because the document is not focused or
// Chromium's ClipboardItem support is incomplete). When window.noteraClipboard
// is available (exposed via preload), override navigator.clipboard with an
// IPC-backed implementation that always works.
if (typeof navigator !== 'undefined' && window.noteraClipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      readText(): Promise<string> {
        return window.noteraClipboard.readText();
      },
      writeText(text: string): Promise<void> {
        return window.noteraClipboard.writeText(text);
      },
      async write(items: ClipboardItem[]): Promise<void> {
        const item = items[0];
        if (!item) return;
        const htmlType = item.types.includes('text/html')
          ? 'text/html'
          : undefined;
        const textType = item.types.includes('text/plain')
          ? 'text/plain'
          : undefined;
        const html = htmlType
          ? await (await item.getType(htmlType)).text()
          : undefined;
        const text = textType
          ? await (await item.getType(textType)).text()
          : undefined;
        await window.noteraClipboard.write({ text, html });
      },
    },
    configurable: true,
    writable: true,
  });
}