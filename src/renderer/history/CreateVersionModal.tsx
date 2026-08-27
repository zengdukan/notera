import { useState } from 'react';
import Button from '@atlaskit/button/new';
import { Field } from '@atlaskit/form';
import SectionMessage from '@atlaskit/section-message';
import Textfield from '@atlaskit/textfield';
import { Stack } from '@atlaskit/primitives';

export function CreateVersionModal({
  defaultName,
  onCreate,
}: {
  readonly defaultName: string;
  readonly onCreate: (versionName: string) => Promise<void> | void;
}) {
  const [name, setName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const create = async () => {
    setSubmitting(true);
    setFailed(false);
    try {
      await onCreate(name.trim());
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Stack space="space.200">
      <Field name="versionName" label="Version name">
        {({ fieldProps }) => (
          <Textfield
            {...fieldProps}
            aria-label="Version name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        )}
      </Field>
      {failed ? (
        <SectionMessage appearance="error" title="Version was not created">
          Your name is preserved. Try again when the note can be saved.
        </SectionMessage>
      ) : null}
      <Button
        appearance="primary"
        isLoading={submitting}
        isDisabled={name.trim().length === 0}
        onClick={() => void create()}
      >
        Create version
      </Button>
    </Stack>
  );
}
