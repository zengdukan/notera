import type { NoteraApi } from '../shared';
import type { AtlassianEditorRuntime } from '../shared/atlassian-editor/media-runtime';

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    notera: NoteraApi;
    atlassianEditor: AtlassianEditorRuntime;
  }
}

export {};
