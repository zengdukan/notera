import { createContext, useContext } from 'react';

import type { OpenMathEditor } from './types';

export const MathEditorContext = createContext<OpenMathEditor | null>(null);

export function useMathEditor(): OpenMathEditor {
  const context = useContext(MathEditorContext);
  if (!context) {
    throw new Error('useMathEditor must be used inside MathEditorProvider');
  }
  return context;
}
