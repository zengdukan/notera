/** @jest-environment jsdom */

import { act, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';

import type { AdfDocument } from '../../../shared/ipc/adf';
import { messagesFor } from '../../app/i18n';
import { createMediaProvider } from '../../atlassian-editor/media-provider';
import { EditorSurface } from '../EditorSurface';

jest.mock('../../atlassian-editor/editor', () => ({
  Editor: () => <div>Editor</div>,
}));
jest.mock('@atlaskit/platform-feature-flags', () => ({
  fg: () => false,
}));
jest.mock('@atlaskit/platform-feature-flags/fg', () => ({
  fg: () => false,
}));

const noteId = '20000000-0000-4000-8000-000000000009';
const document: AdfDocument = {
  type: 'doc',
  version: 1,
  content: [{ type: 'paragraph', content: [] }],
};

describe('media upload feedback', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'atlassianEditor', {
      configurable: true,
      value: Object.freeze({
        mediaApiBaseUrl: 'http://127.0.0.1:43125/api/media',
      }),
    });
  });

  it('renders the binary file-size limit instead of Atlaskit decimal units', async () => {
    render(
      <IntlProvider locale="en" messages={messagesFor('en')}>
        <EditorSurface
          document={document}
          noteId={noteId}
          onChange={jest.fn()}
        />
      </IntlProvider>,
    );
    const provider = await createMediaProvider(noteId);
    const onUploadRejection = provider.uploadParams?.onUploadRejection;

    expect(onUploadRejection).toBeDefined();
    if (!onUploadRejection) {
      throw new Error('Expected a media upload rejection override');
    }
    act(() => {
      expect(
        onUploadRejection({
          reason: 'fileSizeLimitExceeded',
          fileName: 'archive.zip',
          limit: 524_288_000,
        }),
      ).toBe(true);
    });

    expect(
      await screen.findByText(
        'archive.zip is too big to upload. Files must be less than 500 MB.',
      ),
    ).toBeVisible();
  });
});
