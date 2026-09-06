import type { NoteraApi } from '../shared';
import type { AtlassianEditorRuntime } from '../shared/atlassian-editor/media-runtime';

interface NoteraClipboard {
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
  write(data: { text?: string; html?: string }): Promise<void>;
}

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    notera: NoteraApi;
    atlassianEditor: AtlassianEditorRuntime;
    noteraClipboard: NoteraClipboard;
  }
}

export {};