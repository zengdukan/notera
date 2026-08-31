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
    <form
      aria-label="Create version"
      className="notera-create-version"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim().length > 0 && !submitting) void create();
      }}
    >
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
        <div className="notera-create-version__actions">
          <Button
            appearance="primary"
            type="submit"
            isLoading={submitting}
            isDisabled={name.trim().length === 0}
          >
            Create version
          </Button>
        </div>
      </Stack>
    </form>
  );
}
