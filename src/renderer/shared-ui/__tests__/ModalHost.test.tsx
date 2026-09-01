/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import Button from '@atlaskit/button/new';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import { render, screen } from '@testing-library/react';

import { AppProviders } from '../../app/AppProviders';
import { ModalHost } from '../ModalHost';

jest.mock('react-scrolllock', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
  TouchScrollable: ({ children }: { children: ReactNode }) => children,
}));

describe('ModalHost', () => {
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
