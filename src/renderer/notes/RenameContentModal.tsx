import Button from '@atlaskit/button/new';
import Form, { ErrorMessage, Field, MessageWrapper } from '@atlaskit/form';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import Textfield from '@atlaskit/textfield';

const RENAME_CONTENT_FORM_ID = 'notera-rename-content-form';

export function RenameContentModal({
  initialName,
  onRename,
}: {
  readonly initialName: string;
  readonly onRename: (name: string) => Promise<void> | void;
}) {
  return (
    <Form<{ name: string }>
      onSubmit={async ({ name }) => onRename(name.trim())}
    >
      {({ formProps, submitting }) => (
        <>
          <ModalBody>
            <form {...formProps} id={RENAME_CONTENT_FORM_ID}>
              <Field
                name="name"
                label="Name"
                defaultValue={initialName}
                isRequired
                validate={(value) =>
                  typeof value !== 'string' || value.trim().length === 0
                    ? 'Name is required'
                    : undefined
                }
              >
                {({ fieldProps, error }) => (
                  <>
                    <Textfield {...fieldProps} autoFocus />
                    <MessageWrapper>
                      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
                    </MessageWrapper>
                  </>
                )}
              </Field>
            </form>
          </ModalBody>
          <ModalFooter>
            <Button
              appearance="primary"
              type="submit"
              form={RENAME_CONTENT_FORM_ID}
              isLoading={submitting}
            >
              Rename
            </Button>
          </ModalFooter>
        </>
      )}
    </Form>
  );
}
