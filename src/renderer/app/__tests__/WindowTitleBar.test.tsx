/** @jest-environment jsdom */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Main } from '@atlaskit/navigation-system/layout/main';
import { Root } from '@atlaskit/navigation-system/layout/root';

import type { NoteraClient } from '../../platform/notera-client';
import { AppProviders } from '../AppProviders';
import { WindowTitleBar } from '../WindowTitleBar';

function setup(locale: 'en' | 'zh-CN' = 'en', rejects = false) {
  const request = rejects
    ? jest.fn().mockRejectedValue(new Error('window control failed'))
    : jest.fn().mockResolvedValue({});
  const client = { request } as unknown as NoteraClient;
  render(
    <AppProviders locale={locale}>
      <Root>
        <WindowTitleBar client={client} />
        <Main>Content</Main>
      </Root>
    </AppProviders>,
  );
  return { request };
}

describe('WindowTitleBar', () => {
  it('renders ADS branding and dispatches all window controls', async () => {
    const user = userEvent.setup();
    const { request } = setup();

    expect(screen.getByText('Notera')).toBeVisible();
    expect(screen.getByTestId('notera-window-title-bar')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Minimize window' }));
    await user.click(
      screen.getByRole('button', { name: 'Maximize or restore window' }),
    );
    await user.click(screen.getByRole('button', { name: 'Close window' }));

    expect(request.mock.calls).toEqual([
      ['app.minimizeWindow', {}],
      ['app.toggleMaximizeWindow', {}],
      ['app.closeWindow', {}],
    ]);
  });

  it('keeps the ADS desktop action list visible in the Electron title bar', () => {
    const css = readFileSync(
      join(__dirname, '..', 'WindowTitleBar.css'),
      'utf8',
    );

    expect(css).toMatch(
      /\[data-testid='notera-window-title-bar'\]\s+nav\s*>\s*\[role='list'\]\s*\{[^}]*display:\s*flex;/su,
    );
  });

  it('localizes control labels and marks the center as draggable', () => {
    setup('zh-CN');

    expect(screen.getByRole('button', { name: '最小化窗口' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: '最大化或还原窗口' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '关闭窗口' })).toBeVisible();
    const dragRegion = screen.getByTestId('notera-window-drag-region');
    expect(
      (
        dragRegion.style as CSSStyleDeclaration & {
          WebkitAppRegion?: string;
        }
      ).WebkitAppRegion,
    ).toBe('drag');
  });

  it('contains rejected window control requests', async () => {
    const user = userEvent.setup();
    const { request } = setup('en', true);

    await user.click(screen.getByRole('button', { name: 'Minimize window' }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  });
});
