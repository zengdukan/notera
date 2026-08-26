/** @jest-environment jsdom */

import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';

import { configureFeatureFlags } from '../feature-flags';
import { MathEditorProvider } from './MathEditorProvider';
import { useMathEditor } from './math-editor-context';

configureFeatureFlags();

function EditorHarness() {
  const openMathEditor = useMathEditor();
  const [result, setResult] = useState('pending');

  return (
    <>
      <button
        onClick={() => {
          void openMathEditor({ kind: 'inline', latex: '' }).then((latex) => {
            setResult(latex ?? 'cancelled');
          });
        }}
        type="button"
      >
        Open equation editor
      </button>
      <output aria-label="Editor result">{result}</output>
    </>
  );
}

function renderHarness() {
  return render(
    <IntlProvider locale="en">
      <MathEditorProvider>
        <EditorHarness />
      </MathEditorProvider>
    </IntlProvider>,
  );
}

describe('MathEditorProvider', () => {
  it('previews valid input and saves with Ctrl+Enter', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(
      screen.getByRole('button', { name: 'Open equation editor' }),
    );
    const input = await screen.findByLabelText('LaTeX');
    const insert = screen.getByRole('button', { name: 'Insert' });
    const preview = screen.getByLabelText('Equation preview');
    const previewLabel = screen.getByText('Preview');

    expect(preview.contains(previewLabel)).toBe(false);
    expect(previewLabel.nextElementSibling).toBe(preview);
    expect(insert.hasAttribute('disabled')).toBe(true);
    await user.type(input, 'x^2');
    expect(preview.innerHTML).toContain('katex');
    expect(insert.hasAttribute('disabled')).toBe(false);

    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByLabelText('Editor result').textContent).toBe('x^2');
    });
    await waitFor(() => {
      expect(screen.queryByTestId('math-editor-dialog')).toBeNull();
    });
  });

  it('shows a syntax error and cancels without creating content', async () => {
    const user = userEvent.setup();
    renderHarness();

    const trigger = screen.getByRole('button', {
      name: 'Open equation editor',
    });
    await user.click(trigger);
    const input = await screen.findByLabelText('LaTeX');

    await user.type(input, '\\definitelyUnknownCommand{x}');
    expect(screen.getByRole('alert').textContent).not.toBe('');
    expect(
      screen.getByRole('button', { name: 'Insert' }).hasAttribute('disabled'),
    ).toBe(true);

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.getByLabelText('Editor result').textContent).toBe(
        'cancelled',
      );
    });
    await waitFor(() => {
      expect(screen.queryByTestId('math-editor-dialog')).toBeNull();
    });
  });
});
/** @jest-environment jsdom */
