/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { Step } from '@atlaskit/editor-prosemirror/transform';
import { defaultSchema } from '@atlaskit/adf-schema/schema-default';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppProviders } from '../../app/AppProviders';
import type { AdfDocument } from '../../../shared/ipc/adf';

const onNext = jest.fn();
const onPrevious = jest.fn();
const editor = jest.fn(
  (props: {
    document: AdfDocument;
    diff: {
      colorScheme: string;
      originalDocument: AdfDocument;
      steps: readonly unknown[];
    };
    renderDiffControls(navigation: {
      activeIndex?: number;
      numberOfChanges: number;
      onNext(): void;
      onPrevious(): void;
    }): ReactNode;
  }) => (
    <div>
      {props.renderDiffControls({
        activeIndex: 1,
        numberOfChanges: 3,
        onNext,
        onPrevious,
      })}
      <output aria-label="Diff document">
        {JSON.stringify(props.document)}
      </output>
    </div>
  ),
);

jest.mock('../../atlassian-editor/editor', () => ({
  Editor: (props: Parameters<typeof editor>[0]) => editor(props),
}));
jest.mock('../../atlassian-editor/media-provider', () => ({
  mediaProviderForNote: jest.fn(() => Promise.resolve({})),
}));

// The module must load after its Editor dependency is mocked.
// eslint-disable-next-line import/first
import { createHistoryDiffSteps, HistoryCompare } from '../HistoryCompare';

const historicalDocument: AdfDocument = {
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Hello world' }],
    },
  ],
};
const currentDocument: AdfDocument = {
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Hello updated world' }],
    },
  ],
};

const comparison = {
  left: {
    ref: { source: 'CURRENT' as const },
    noteId: 'note',
    title: 'Current title',
    document: currentDocument,
    createdAt: 2,
  },
  right: {
    ref: { source: 'VERSION' as const, versionId: 'version' },
    noteId: 'note',
    title: 'Historical title',
    document: historicalDocument,
    createdAt: 1,
  },
};

describe('HistoryCompare', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a single read-only inline diff from history to current', () => {
    render(
      <AppProviders locale="en">
        <HistoryCompare
          noteId="note"
          comparison={comparison}
          selectedVersionName="Milestone"
        />
      </AppProviders>,
    );

    expect(screen.getByText('Milestone')).toBeVisible();
    expect(screen.getByText('vs')).toBeVisible();
    expect(screen.getByText('Current version')).toBeVisible();
    expect(screen.queryByText('Selected history version')).toBeNull();
    expect(screen.queryByText('Historical title')).toBeNull();
    expect(screen.queryByText('Current saved version')).toBeNull();
    expect(screen.queryByText('Current title')).toBeNull();
    expect(screen.getByText('Removed')).toBeVisible();
    expect(screen.getByText('Added')).toBeVisible();
    expect(screen.getByText('2 of 3')).toBeVisible();

    const documentContainer = screen.getByTestId('history-diff-document');
    const toolbar = screen.getByTestId('history-diff-toolbar');
    const documentStyles = window.getComputedStyle(documentContainer);
    const toolbarStyles = window.getComputedStyle(toolbar);
    expect(documentStyles.maxHeight).not.toBe('440px');
    expect(documentStyles.overflow).not.toBe('auto');
    expect(toolbarStyles.position).toBe('sticky');

    expect(editor).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: 'chromeless',
        disabled: true,
        document: currentDocument,
        diff: expect.objectContaining({
          colorScheme: 'traditional',
          originalDocument: historicalDocument,
        }),
      }),
    );
  });

  it('navigates through diff decorations with the plugin controls', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders locale="en">
        <HistoryCompare
          noteId="note"
          comparison={comparison}
          selectedVersionName="Milestone"
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole('button', { name: 'Previous change' }));
    await user.click(screen.getByRole('button', { name: 'Next change' }));
    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('builds a replace step that reconstructs the current document', () => {
    const [stepJson] = createHistoryDiffSteps(
      historicalDocument,
      currentDocument,
    );
    const original = defaultSchema.nodeFromJSON(historicalDocument);
    const current = defaultSchema.nodeFromJSON(currentDocument);
    const result = Step.fromJSON(defaultSchema, stepJson).apply(original);

    expect(result.failed).toBeNull();
    expect(result.doc?.eq(current)).toBe(true);
    expect(createHistoryDiffSteps(currentDocument, currentDocument)).toEqual(
      [],
    );
  });
});
