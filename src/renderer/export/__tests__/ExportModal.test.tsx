/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppProviders } from '../../app/AppProviders';
import type { AppLocale } from '../../app/i18n';
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

const operationId = '10000000-0000-4000-8000-000000000001';

function renderExportModal(content: ReactNode, locale: AppLocale = 'en') {
  render(
    <AppProviders locale={locale}>
      <ModalHost
        modal={{
          kind: 'export-note',
          title: locale === 'zh-CN' ? '导出' : 'Export',
          content,
        }}
        onClose={jest.fn()}
      />
    </AppProviders>,
  );
}

describe('ExportModal', () => {
  it('selects a format, warns about plaintext, and reports a save failure', async () => {
    const user = userEvent.setup();
    const start = jest.fn().mockResolvedValue('save-failed');
    const controller = {
      start,
      cancel: jest.fn(),
    } as unknown as ExportController;
    renderExportModal(
      <ExportModal
        noteId="note"
        controller={controller}
        store={new ExportOperationStore()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Export format')).toBeVisible();
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
    expect(await screen.findByText('Save failed')).toBeVisible();
    expect(
      screen.getByText(
        'Your latest changes were not saved. Close this dialog and try again.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Return to editing' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Export last saved version' }),
    ).not.toBeInTheDocument();
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({
      noteId: 'note',
      format: 'PDF',
      save: 'try',
    });
    expect(document.body.textContent).not.toContain('C:\\');
  });

  it('shows a localized start failure without exposing a path', async () => {
    const user = userEvent.setup();
    renderExportModal(
      <ExportModal
        noteId="note"
        controller={
          {
            start: jest.fn().mockRejectedValue(new Error('C:\\private')),
            cancel: jest.fn(),
          } as unknown as ExportController
        }
        store={new ExportOperationStore()}
        onClose={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(await screen.findByText('Export could not start')).toBeVisible();
    expect(document.body.textContent).not.toContain('C:\\private');
  });

  it('shows only an accessible spinner while running and allows cancellation', async () => {
    const user = userEvent.setup();
    const store = new ExportOperationStore();
    store.track(operationId);
    store.applyProgress({
      operationId,
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
        onClose={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('img', { name: 'Export in progress' }),
    ).toBeVisible();
    expect(screen.queryByText('Rendering')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('notera-modal-export-note--footer')).getByRole(
        'button',
        { name: 'Cancel export' },
      ),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Cancel export' }));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('shows a compact success report without lossy-node details and closes', async () => {
    const user = userEvent.setup();
    const store = new ExportOperationStore();
    const onClose = jest.fn();
    store.track(operationId);
    store.applyCompleted({
      operationId,
      kind: 'NOTE_EXPORT',
      state: 'SUCCEEDED',
      result: {
        report: {
          format: 'PDF',
          packaging: 'ZIP',
          attachmentCount: 2,
          lossyNodeCount: 3,
          completedAt: 1,
        },
      },
    });

    renderExportModal(
      <ExportModal
        noteId="note"
        controller={{ cancel: jest.fn(), start: jest.fn() } as never}
        store={store}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('Export completed')).toBeVisible();
    expect(screen.getByText('PDF · ZIP archive')).toBeVisible();
    expect(screen.queryByText(/unsupported nodes/iu)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      state: 'CANCELLED' as const,
      title: 'Export cancelled',
    },
    {
      state: 'FAILED' as const,
      title: 'Export failed',
    },
  ])('shows and closes the $state result', async ({ state, title }) => {
    const user = userEvent.setup();
    const store = new ExportOperationStore();
    const onClose = jest.fn();
    store.track(operationId);
    store.applyCompleted(
      state === 'FAILED'
        ? {
            operationId,
            kind: 'NOTE_EXPORT',
            state,
            error: {
              code: 'EXPORT_FAILED',
              message: 'The note could not be exported.',
            },
          }
        : { operationId, kind: 'NOTE_EXPORT', state },
    );

    renderExportModal(
      <ExportModal
        noteId="note"
        controller={{ cancel: jest.fn(), start: jest.fn() } as never}
        store={store}
        onClose={onClose}
      />,
    );

    expect(screen.getByText(title)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('localizes the setup in Chinese', () => {
    renderExportModal(
      <ExportModal
        noteId="note"
        controller={{ cancel: jest.fn(), start: jest.fn() } as never}
        store={new ExportOperationStore()}
        onClose={jest.fn()}
      />,
      'zh-CN',
    );

    expect(screen.getByText('导出格式')).toBeVisible();
    expect(screen.getByText('导出会创建明文文件')).toBeVisible();
    expect(screen.getByRole('button', { name: '导出' })).toBeVisible();
  });

  it('localizes the report in Chinese', () => {
    const store = new ExportOperationStore();
    store.track(operationId);
    store.applyCompleted({
      operationId,
      kind: 'NOTE_EXPORT',
      state: 'SUCCEEDED',
      result: {
        report: {
          format: 'MARKDOWN',
          packaging: 'DIRECT',
          attachmentCount: 0,
          lossyNodeCount: 0,
          completedAt: 1,
        },
      },
    });

    renderExportModal(
      <ExportModal
        noteId="note"
        controller={{ cancel: jest.fn(), start: jest.fn() } as never}
        store={store}
        onClose={jest.fn()}
      />,
      'zh-CN',
    );

    expect(screen.getByText('导出完成')).toBeVisible();
    expect(screen.getByText('Markdown · 单个文件')).toBeVisible();
    expect(screen.getByRole('button', { name: '关闭' })).toBeVisible();
  });
});
