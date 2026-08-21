import type { NoteraApi } from '../shared';

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    notera: NoteraApi;
  }
}

export {};
