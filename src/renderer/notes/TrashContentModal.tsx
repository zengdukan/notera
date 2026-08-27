import Button from '@atlaskit/button/new';
import { ButtonGroup } from '@atlaskit/button';
import SectionMessage from '@atlaskit/section-message';
import { Stack, Text } from '@atlaskit/primitives';

export function TrashContentModal({
  name,
  onConfirm,
  onCancel,
}: {
  readonly name: string;
  readonly onConfirm: () => Promise<void> | void;
  readonly onCancel: () => void;
}) {
  return (
    <Stack space="space.200">
      <SectionMessage appearance="warning" title="Move content to trash?">
        <Text as="p">
          {name} can be restored from the trash until it expires.
        </Text>
      </SectionMessage>
      <ButtonGroup label="Trash content actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button appearance="danger" onClick={() => void onConfirm()}>
          Move to trash
        </Button>
      </ButtonGroup>
    </Stack>
  );
}
