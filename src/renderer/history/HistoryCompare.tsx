import { useMemo } from 'react';
import { defaultSchema } from '@atlaskit/adf-schema/schema-default';
import Button from '@atlaskit/button/new';
import type { StepJson } from '@atlaskit/editor-common/collab';
import ArrowLeftIcon from '@atlaskit/icon/core/arrow-left';
import ArrowRightIcon from '@atlaskit/icon/core/arrow-right';
import { Slice } from '@atlaskit/editor-prosemirror/model';
import { ReplaceStep } from '@atlaskit/editor-prosemirror/transform';
import { Box, Inline, Stack, Text, xcss } from '@atlaskit/primitives';
import { useIntl } from 'react-intl';

import type { AdfDocument } from '../../shared/ipc/adf';
import {
  Editor,
  type ProductEditorDiffNavigation,
} from '../atlassian-editor/editor';
import { mediaProviderForNote } from '../atlassian-editor/media-provider';
import type { RequestData } from '../platform/notera-client';

export function createHistoryDiffSteps(
  originalDocument: AdfDocument,
  currentDocument: AdfDocument,
): readonly StepJson[] {
  const original = defaultSchema.nodeFromJSON(originalDocument);
  const current = defaultSchema.nodeFromJSON(currentDocument);
  if (original.eq(current)) return [];

  const step = new ReplaceStep(
    0,
    original.content.size,
    new Slice(current.content, 0, 0),
  ).toJSON();
  return [
    {
      ...step,
      clientId: 'notera-history',
      userId: 'local',
    } as StepJson,
  ];
}

export function HistoryCompare({
  noteId,
  comparison,
}: {
  readonly noteId: string;
  readonly comparison: RequestData<'history.compare'>;
}) {
  const intl = useIntl();
  const steps = useMemo(
    () =>
      createHistoryDiffSteps(
        comparison.right.document,
        comparison.left.document,
      ),
    [comparison.left.document, comparison.right.document],
  );
  const untitled = intl.formatMessage({ id: 'history.untitled' });

  return (
    <Box
      as="section"
      aria-label={intl.formatMessage({ id: 'history.compare.region' })}
      xcss={compareStyles}
    >
      <Stack space="space.200">
        <Box xcss={summaryStyles}>
          <Inline alignBlock="center" shouldWrap space="space.200">
            <Stack grow="fill" space="space.050">
              <Text color="color.text.subtle" size="small">
                {intl.formatMessage({ id: 'history.compare.selected' })}
              </Text>
              <Text weight="semibold">
                {comparison.right.title || untitled}
              </Text>
            </Stack>
            <ArrowRightIcon label="" color="var(--ds-icon-subtle)" />
            <Stack grow="fill" space="space.050">
              <Text color="color.text.subtle" size="small">
                {intl.formatMessage({ id: 'history.compare.current' })}
              </Text>
              <Text weight="semibold">{comparison.left.title || untitled}</Text>
            </Stack>
          </Inline>
        </Box>
        <Box xcss={documentStyles}>
          <Editor
            appearance="chromeless"
            diff={{
              colorScheme: 'traditional',
              originalDocument: comparison.right.document,
              steps,
            }}
            disabled
            document={comparison.left.document}
            mediaProvider={mediaProviderForNote(noteId)}
            onChange={() => undefined}
            renderDiffControls={(navigation) => (
              <DiffToolbar navigation={navigation} />
            )}
          />
        </Box>
      </Stack>
    </Box>
  );
}

function DiffToolbar({
  navigation,
}: {
  readonly navigation: ProductEditorDiffNavigation;
}) {
  const intl = useIntl();
  const hasChanges = navigation.numberOfChanges > 0;
  const position = hasChanges
    ? intl.formatMessage(
        { id: 'history.compare.position' },
        {
          current: (navigation.activeIndex ?? 0) + 1,
          total: navigation.numberOfChanges,
        },
      )
    : intl.formatMessage({ id: 'history.compare.noChanges' });

  return (
    <Box xcss={toolbarStyles}>
      <Inline
        alignBlock="center"
        spread="space-between"
        space="space.150"
        shouldWrap
      >
        <Inline alignBlock="center" space="space.150">
          <Inline alignBlock="center" space="space.050">
            <Box xcss={[legendSwatchStyles, removedSwatchStyles]} />
            <Text size="small">
              {intl.formatMessage({ id: 'history.compare.removed' })}
            </Text>
          </Inline>
          <Inline alignBlock="center" space="space.050">
            <Box xcss={[legendSwatchStyles, addedSwatchStyles]} />
            <Text size="small">
              {intl.formatMessage({ id: 'history.compare.added' })}
            </Text>
          </Inline>
        </Inline>
        <Inline alignBlock="center" space="space.050">
          <Button
            appearance="subtle"
            iconBefore={ArrowLeftIcon}
            isDisabled={!hasChanges}
            onClick={navigation.onPrevious}
            spacing="compact"
          >
            {intl.formatMessage({ id: 'history.compare.previous' })}
          </Button>
          <Button
            appearance="subtle"
            iconAfter={ArrowRightIcon}
            isDisabled={!hasChanges}
            onClick={navigation.onNext}
            spacing="compact"
          >
            {intl.formatMessage({ id: 'history.compare.next' })}
          </Button>
          <Box aria-live="polite" xcss={positionStyles}>
            <Text color="color.text.subtle" size="small">
              {position}
            </Text>
          </Box>
        </Inline>
      </Inline>
    </Box>
  );
}

const compareStyles = xcss({
  minWidth: '0',
  minHeight: '0',
  flexGrow: 1,
});
const summaryStyles = xcss({
  backgroundColor: 'color.background.neutral.subtle',
  borderColor: 'color.border',
  borderRadius: 'radius.small',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  padding: 'space.150',
});
const documentStyles = xcss({
  minWidth: '0',
  minHeight: '320px',
  maxHeight: '440px',
  overflow: 'auto',
  borderColor: 'color.border',
  borderRadius: 'radius.small',
  borderStyle: 'solid',
  borderWidth: 'border.width',
});
const toolbarStyles = xcss({
  position: 'sticky',
  top: 'space.0',
  zIndex: 'card',
  backgroundColor: 'elevation.surface',
  borderBlockEndColor: 'color.border',
  borderBlockEndStyle: 'solid',
  borderBlockEndWidth: 'border.width',
  paddingBlock: 'space.100',
  paddingInline: 'space.150',
});
const legendSwatchStyles = xcss({
  width: '12px',
  height: '12px',
  borderRadius: 'radius.small',
});
const removedSwatchStyles = xcss({
  backgroundColor: 'color.background.danger',
});
const addedSwatchStyles = xcss({
  backgroundColor: 'color.background.success',
});
const positionStyles = xcss({
  minWidth: '72px',
  textAlign: 'end',
});
