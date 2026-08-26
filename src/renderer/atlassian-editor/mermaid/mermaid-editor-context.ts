import { createContext, useContext } from 'react';

import type { OpenMermaidEditor } from './types';

export const MermaidEditorContext = createContext<OpenMermaidEditor | null>(
  null,
);

export function useMermaidEditor(): OpenMermaidEditor {
  const context = useContext(MermaidEditorContext);
  if (!context) {
    throw new Error(
      'useMermaidEditor must be used inside MermaidEditorProvider',
    );
  }

  return context;
}
