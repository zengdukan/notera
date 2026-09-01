/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppProviders } from '../../app/AppProviders';
import { configureFeatureFlags } from '../../atlassian-editor/feature-flags';
import { ModalHost } from '../../shared-ui/ModalHost';
import type { ExportController } from '../export-controller';
import { ExportModal } from '../ExportModal';
import { ExportOperationStore } from '../export-operation';

configureFeatureFlags();

jest.mock('react-scrolllock', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
  TouchScrollable: ({ children }: { children: ReactNode }) => children,
}));

function renderExportModal(content: ReactNode) {
  render(
    <AppProviders locale="en">
      <ModalHost
        modal={{
          kind: 'export-note',
          title: 'Export',
          content,
        }}
        onClose={jest.fn()}
      />
    </AppProviders>,
  );
}

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
    renderExportModal(
      <ExportModal
        noteId="note"
        controller={controller}
        store={new ExportOperationStore()}
        onReturnToEdit={jest.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Markdown' })).toBeChecked();
    expect(screen.getByText(/outside Notera encryption/iu)).toBeVisible();
    expect(
      within(screen.getByTestId('notera-modal-export-note--footer')).getByRole(
        'button',
        { name: 'Export' },
      ),
    ).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'PDF' }));
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(
      await screen.findByRole('button', { name: 'Export last saved version' }),
    ).toBeVisible();
    expect(
      within(screen.getByTestId('notera-modal-export-note--footer')).getByRole(
        'button',
        { name: 'Return to editing' },
      ),
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

    renderExportModal(
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
    expect(
      within(screen.getByTestId('notera-modal-export-note--footer')).getByRole(
        'button',
        { name: 'Cancel export' },
      ),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Cancel export' }));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
