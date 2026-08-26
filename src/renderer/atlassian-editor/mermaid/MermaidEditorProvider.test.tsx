/** @jest-environment jsdom */

import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';

import { configureFeatureFlags } from '../feature-flags';
const mockRenderMermaid = jest.fn();

jest.mock('./mermaid', () => ({ renderMermaid: mockRenderMermaid }));

import { MermaidEditorProvider } from './MermaidEditorProvider';
import { useMermaidEditor } from './mermaid-editor-context';

configureFeatureFlags();

function EditorHarness() {
  const openMermaidEditor = useMermaidEditor();
  const [result, setResult] = useState('pending');

  return (
    <>
      <button
        onClick={() => {
          void openMermaidEditor({ source: '' }).then((source) => {
            setResult(source ?? 'cancelled');
          });
        }}
        type="button"
      >
        Open Mermaid editor
      </button>
      <output aria-label="Editor result">{result}</output>
    </>
  );
}

function renderHarness() {
  return render(
    <IntlProvider locale="en">
      <MermaidEditorProvider>
        <EditorHarness />
      </MermaidEditorProvider>
    </IntlProvider>,
  );
}

describe('MermaidEditorProvider', () => {
  beforeEach(() => {
    mockRenderMermaid.mockReset();
    mockRenderMermaid.mockImplementation(async (_id: string, source: string) =>
      source === 'bad'
        ? { error: 'Invalid Mermaid syntax', svg: null }
        : { error: null, svg: '<svg data-testid="diagram" />' },
    );
  });

  it('previews valid input and saves with Ctrl+Enter', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(
      screen.getByRole('button', { name: 'Open Mermaid editor' }),
    );
    const input = await screen.findByLabelText('Mermaid syntax');
    const insert = screen.getByRole('button', { name: 'Insert' });
    const preview = screen.getByLabelText('Mermaid diagram preview');
    const previewLabel = screen.getByText('Preview');

    expect(preview.contains(previewLabel)).toBe(false);
    expect(previewLabel.nextElementSibling).toBe(preview);
    expect(insert.hasAttribute('disabled')).toBe(true);

    fireEvent.change(input, { target: { value: 'flowchart LR\nA --> B' } });
    await waitFor(() => {
      const previewContent = screen
        .getByLabelText('Mermaid diagram preview')
        .querySelector('.mermaid-dialog-preview-content');
      expect(previewContent?.firstElementChild?.tagName).toBe('svg');
    });
    expect(insert.hasAttribute('disabled')).toBe(false);

    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByLabelText('Editor result').textContent).toBe(
        'flowchart LR\nA --> B',
      );
    });
    await waitFor(() => {
      expect(screen.queryByTestId('mermaid-editor-dialog')).toBeNull();
    });
  });

  it('shows syntax errors and cancels without creating content', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(
      screen.getByRole('button', { name: 'Open Mermaid editor' }),
    );
    const input = await screen.findByLabelText('Mermaid syntax');
    fireEvent.change(input, { target: { value: 'bad' } });

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        'Invalid Mermaid syntax',
      );
    });
    expect(
      screen.getByRole('button', { name: 'Insert' }).hasAttribute('disabled'),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Editor result').textContent).toBe(
        'cancelled',
      );
    });
  });
});
