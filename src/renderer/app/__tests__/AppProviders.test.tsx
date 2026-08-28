/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';

import { useMathEditor } from '../../atlassian-editor/math';
import { useMermaidEditor } from '../../atlassian-editor/mermaid';
import { AppProviders } from '../AppProviders';

function EditorContextHarness() {
  const openMathEditor = useMathEditor();
  const openMermaidEditor = useMermaidEditor();

  return (
    <output aria-label="Editor contexts">
      {typeof openMathEditor}:{typeof openMermaidEditor}
    </output>
  );
}

describe('AppProviders', () => {
  it('provides the math and Mermaid editor contexts', () => {
    render(
      <AppProviders locale="en">
        <EditorContextHarness />
      </AppProviders>,
    );

    expect(screen.getByLabelText('Editor contexts')).toHaveTextContent(
      'function:function',
    );
  });
});
