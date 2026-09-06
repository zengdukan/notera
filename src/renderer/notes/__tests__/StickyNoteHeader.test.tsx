/** @jest-environment jsdom */

import type { ReactElement } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';

import { type AppLocale, messagesFor } from '../../app/i18n';
import { configureFeatureFlags } from '../../atlassian-editor/feature-flags';
import { StickyNoteHeader } from '../StickyNoteHeader';

configureFeatureFlags();

const renderHeader = (element: ReactElement, locale: AppLocale = 'en') =>
  render(
    <IntlProvider locale={locale} messages={messagesFor(locale)}>
      {element}
    </IntlProvider>,
  );

const paths = [
  { id: 'root', name: 'Notes' },
  { id: 'folder', name: 'Projects' },
];

describe('StickyNoteHeader', () => {
  it('renders a stable PageHeader anchor in edit and preview modes', () => {
    const editView = renderHeader(
      <StickyNoteHeader
        mode="edit"
        title="Draft"
        path={paths}
        saveState="clean"
        isFavorite={false}
        onTitleChange={jest.fn()}
        onToggleFavorite={jest.fn()}
        onEdit={jest.fn()}
        onPreview={jest.fn()}
        onMore={jest.fn()}
      />,
    );
    const previewView = renderHeader(
      <StickyNoteHeader
        mode="preview"
        title="Draft"
        path={paths}
        saveState="clean"
        isFavorite={false}
        onTitleChange={jest.fn()}
        onToggleFavorite={jest.fn()}
        onEdit={jest.fn()}
        onPreview={jest.fn()}
        onMore={jest.fn()}
      />,
    );

    expect(
      within(editView.container).getByTestId('sticky-note-header'),
    ).toBeVisible();
    expect(
      within(previewView.container).getByTestId('sticky-note-header'),
    ).toBeVisible();
  });

  it('keeps breadcrumbs, title, save status and ordered note actions in one header', () => {
    renderHeader(
      <StickyNoteHeader
        mode="preview"
        title="Architecture"
        path={paths}
        saveState="clean"
        isFavorite={false}
        onTitleChange={jest.fn()}
        onToggleFavorite={jest.fn()}
        onEdit={jest.fn()}
        onPreview={jest.fn()}
        onMore={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('navigation', { name: 'Note path' }),
    ).toHaveTextContent('Notes');
    expect(
      screen.getByRole('heading', { name: 'Architecture', level: 1 }),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveAccessibleName('Saved');
    expect(screen.getByTestId('note-save-status-icon-clean')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Add to favorites' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'More' })).toBeVisible();
  });

  it.each([
    ['clean', 'Saved'],
    ['dirty', 'Unsaved changes'],
    ['saving', 'Saving'],
    ['failed', 'Not saved'],
  ] as const)(
    'renders the %s save state as an accessible icon',
    (saveState, label) => {
      renderHeader(
        <StickyNoteHeader
          mode="preview"
          title="Architecture"
          path={paths}
          saveState={saveState}
          isFavorite={false}
          onTitleChange={jest.fn()}
          onToggleFavorite={jest.fn()}
          onEdit={jest.fn()}
          onPreview={jest.fn()}
          onMore={jest.fn()}
        />,
      );

      expect(screen.getByRole('status')).toHaveAccessibleName(label);
      expect(
        screen.getByTestId(`note-save-status-icon-${saveState}`),
      ).toBeVisible();
      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    },
  );

  it('places the save indicator after the title and wires icon actions', async () => {
    const user = userEvent.setup();
    const onToggleFavorite = jest.fn();
    const onEdit = jest.fn();
    renderHeader(
      <StickyNoteHeader
        mode="preview"
        title="Architecture"
        path={paths}
        saveState="clean"
        isFavorite={false}
        onTitleChange={jest.fn()}
        onToggleFavorite={onToggleFavorite}
        onEdit={onEdit}
        onPreview={jest.fn()}
        onMore={jest.fn()}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'Architecture' });
    const status = screen.getByRole('status');
    expect(heading.compareDocumentPosition(status)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    await user.click(screen.getByRole('button', { name: 'Add to favorites' }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('edits the title and exposes the complete product menu in edit mode', async () => {
    const user = userEvent.setup();
    const onTitleChange = jest.fn();
    const onMore = jest.fn();
    const onRetry = jest.fn();
    renderHeader(
      <StickyNoteHeader
        mode="edit"
        title="Draft"
        path={paths}
        saveState="failed"
        isFavorite
        onTitleChange={onTitleChange}
        onToggleFavorite={jest.fn()}
        onEdit={jest.fn()}
        onPreview={jest.fn()}
        onRetry={onRetry}
        onMore={onMore}
      />,
    );

    const titleEditButton = screen.getByRole('button', {
      name: /Edit, Note title/,
    });
    await user.click(titleEditButton);
    await user.type(
      screen.getByRole('textbox', { name: 'Note title' }),
      ' updated',
    );
    expect(onTitleChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onTitleChange).toHaveBeenCalledWith('Draft updated');
    expect(screen.getByRole('status')).toHaveAccessibleName('Not saved');
    await user.click(screen.getByRole('button', { name: 'Retry save' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Remove from favorites' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'View' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'More' }));
    for (const [id, label] of [
      ['create-version', 'Create version'],
      ['history', 'History'],
      ['export', 'Export'],
      ['move', 'Move'],
      ['copy', 'Copy'],
      ['trash', 'Move to trash'],
    ]) {
      expect(
        await screen.findByRole('menuitem', { name: label }),
      ).toBeVisible();
      expect(screen.getByTestId(`note-more-action-icon-${id}`)).toBeVisible();
    }
    await user.click(screen.getByRole('menuitem', { name: 'History' }));
    expect(onMore).toHaveBeenCalledWith('history');
  });

  it('focuses the title for a newly created note', () => {
    renderHeader(
      <StickyNoteHeader
        mode="edit"
        title=""
        path={paths}
        saveState="clean"
        isFavorite={false}
        autoFocusTitle
        onTitleChange={jest.fn()}
        onToggleFavorite={jest.fn()}
        onEdit={jest.fn()}
        onPreview={jest.fn()}
        onMore={jest.fn()}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Note title' })).toHaveFocus();
  });

  it('localizes the history and export actions in Chinese', async () => {
    const user = userEvent.setup();
    renderHeader(
      <StickyNoteHeader
        mode="preview"
        title="架构"
        path={paths}
        saveState="clean"
        isFavorite={false}
        onTitleChange={jest.fn()}
        onToggleFavorite={jest.fn()}
        onEdit={jest.fn()}
        onPreview={jest.fn()}
        onMore={jest.fn()}
      />,
      'zh-CN',
    );

    await user.click(screen.getByRole('button', { name: '更多' }));
    expect(
      await screen.findByRole('menuitem', { name: '创建版本' }),
    ).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '历史版本' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '导出' })).toBeVisible();
    expect(screen.getByRole('button', { name: '编辑' })).toBeVisible();
  });
});
