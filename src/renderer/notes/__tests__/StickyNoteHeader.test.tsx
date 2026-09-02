/** @jest-environment jsdom */

import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
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
  it('uses the same top anchor in edit and preview modes', () => {
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

    expect(editView.container.firstElementChild?.className).toBe(
      previewView.container.firstElementChild?.className,
    );
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
    expect(screen.getByRole('heading', { name: 'Architecture' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(
      screen.getByRole('button', { name: 'Add to favorites' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'More' })).toBeVisible();
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

    await user.type(
      screen.getByRole('textbox', { name: 'Note title' }),
      ' updated',
    );
    expect(onTitleChange).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Not saved');
    await user.click(screen.getByRole('button', { name: 'Retry save' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Remove from favorites' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeVisible();

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

  it('localizes the history actions in Chinese', async () => {
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

    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(
      await screen.findByRole('menuitem', { name: '创建版本' }),
    ).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '历史版本' })).toBeVisible();
  });
});
