import Button from '@atlaskit/button/new';
import SectionMessage from '@atlaskit/section-message';
import { Inline, Stack, Text } from '@atlaskit/primitives';

export function DeleteTrashModal({
  name,
  onDelete,
  onCancel,
}: {
  readonly name: string;
  readonly onDelete: () => Promise<void> | void;
  readonly onCancel: () => void;
}) {
  return (
    <Stack space="space.200">
      <Text>Permanently delete {name || 'Untitled'}?</Text>
      <SectionMessage appearance="warning" title="This cannot be undone.">
        Notera will remove this item and any data only referenced by it.
      </SectionMessage>
      <Inline space="space.100">
        <Button onClick={onCancel}>Cancel</Button>
        <Button appearance="danger" onClick={() => void onDelete()}>
          Delete permanently
        </Button>
      </Inline>
    </Stack>
  );
}
