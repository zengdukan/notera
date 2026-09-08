/** @jest-environment jsdom */

import { useState, type ReactNode } from 'react';
import { useColorMode, useSetColorMode } from '@atlaskit/app-provider';
import Button from '@atlaskit/button/new';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppProviders } from '../../app/AppProviders';
import { ModalHost } from '../ModalHost';

jest.mock('react-scrolllock', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
  TouchScrollable: ({ children }: { children: ReactNode }) => children,
}));

function ModalColorMode() {
  return <output aria-label="Modal color mode">{useColorMode()}</output>;
}

function ModalThemeHarness() {
  const colorMode = useColorMode();
  const setColorMode = useSetColorMode();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <output aria-label="Page color mode">{colorMode}</output>
      <Button onClick={() => setColorMode('dark')}>Use dark</Button>
      <Button onClick={() => setIsOpen(true)}>Open modal</Button>
      <ModalHost
        modal={
          isOpen
            ? {
                kind: 'theme-test',
                title: 'Theme test',
                content: (
                  <ModalBody>
                    <ModalColorMode />
                    <input aria-label="Draft" />
                    <Button onClick={() => setColorMode('light')}>
                      Use light
                    </Button>
                  </ModalBody>
                ),
              }
            : null
        }
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

describe('ModalHost', () => {
  it('keeps an open portal synchronized with the application color mode', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders locale="en">
        <ModalThemeHarness />
      </AppProviders>,
    );

    await user.click(screen.getByRole('button', { name: 'Use dark' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Page color mode')).toHaveTextContent(
        'dark',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Open modal' }));
    expect(await screen.findByLabelText('Modal color mode')).toHaveTextContent(
      'dark',
    );

    await user.type(screen.getByLabelText('Draft'), 'keep me');
    await user.click(screen.getByRole('button', { name: 'Use light' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Page color mode')).toHaveTextContent(
        'light',
      );
      expect(screen.getByLabelText('Modal color mode')).toHaveTextContent(
        'light',
      );
    });
    expect(screen.getByLabelText('Draft')).toHaveValue('keep me');
  });

  it('hosts feature-owned body and footer sections at an exact design width', () => {
    render(
      <AppProviders locale="en">
        <ModalHost
          modal={{
            kind: 'search',
            title: 'Search',
            width: 720,
            content: (
              <>
                <ModalBody>
                  <p>Search content</p>
                </ModalBody>
                <ModalFooter>
                  <Button>Search action</Button>
                </ModalFooter>
              </>
            ),
          }}
          onClose={jest.fn()}
        />
      </AppProviders>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Search' });
    expect(dialog).toContainElement(
      screen.getByTestId('notera-modal-search--body'),
    );
    expect(dialog).toContainElement(
      screen.getByTestId('notera-modal-search--footer'),
    );
    expect(screen.getByText('Search content')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Search action' })).toBeVisible();
  });

  it('does not add an empty footer to body-only dialogs', () => {
    render(
      <AppProviders locale="en">
        <ModalHost
          modal={{
            kind: 'message',
            title: 'Message',
            content: (
              <ModalBody>
                <p>Message content</p>
              </ModalBody>
            ),
          }}
          onClose={jest.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByTestId('notera-modal-message--body')).toBeVisible();
    expect(
      screen.queryByTestId('notera-modal-message--footer'),
    ).not.toBeInTheDocument();
  });
});
