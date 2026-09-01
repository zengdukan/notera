/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { configureFeatureFlags } from '../../atlassian-editor/feature-flags';
import type { ExportController } from '../export-controller';
import { ExportModal } from '../ExportModal';
import { ExportOperationStore } from '../export-operation';

configureFeatureFlags();

describe('ExportModal', () => {
  it('selects a format, warns about plaintext, and offers saved-version fallback', async () => {
    const user = userEvent.setup();
    const start = jest
      .fn()
      .mockResolvedValueOnce('save-failed')
      .mockResolvedValueOnce('started');
    const controller = {
      start,
      cancel: jest.fn(),
    } as unknown as ExportController;
    render(
      <ExportModal
        noteId="note"
        controller={controller}
        store={new ExportOperationStore()}
        onReturnToEdit={jest.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Markdown' })).toBeChecked();
    expect(screen.getByText(/outside Notera encryption/iu)).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'PDF' }));
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(
      await screen.findByRole('button', { name: 'Export last saved version' }),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Export last saved version' }),
    );
    expect(start).toHaveBeenLastCalledWith({
      noteId: 'note',
      format: 'PDF',
      save: 'saved',
    });
    expect(document.body.textContent).not.toContain('C:\\');
  });

  it('shows the current export stage, the full stage track, and cancellation', async () => {
    const user = userEvent.setup();
    const store = new ExportOperationStore();
    store.track('10000000-0000-4000-8000-000000000001');
    store.applyProgress({
      operationId: '10000000-0000-4000-8000-000000000001',
      kind: 'NOTE_EXPORT',
      phase: 'RENDERING',
      progress: 0.5,
    });
    const cancel = jest.fn();

    render(
      <ExportModal
        noteId="note"
        controller={{ cancel, start: jest.fn() } as unknown as ExportController}
        store={store}
        onReturnToEdit={jest.fn()}
      />,
    );

    const progress = screen.getByRole('region', { name: 'Export progress' });
    expect(progress).toHaveTextContent('Rendering');
    expect(
      screen.getByRole('list', { name: 'Export stages' }),
    ).toHaveTextContent(
      'Preparing → Reading → Rendering → Writing → Completing',
    );
    expect(screen.getByRole('listitem', { name: 'Rendering' })).toHaveAttribute(
      'aria-current',
      'step',
    );

    await user.click(screen.getByRole('button', { name: 'Cancel export' }));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
