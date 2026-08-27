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
});
