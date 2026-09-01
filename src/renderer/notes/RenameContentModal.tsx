import Button from '@atlaskit/button/new';
import Form, { Field } from '@atlaskit/form';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import Textfield from '@atlaskit/textfield';

const RENAME_CONTENT_FORM_ID = 'notera-rename-content-form';

export function RenameContentModal({
  initialName,
  allowBlank = false,
  onRename,
}: {
  readonly initialName: string;
  readonly allowBlank?: boolean;
  readonly onRename: (name: string) => Promise<void> | void;
}) {
  return (
    <Form<{ name: string }>
      onSubmit={async ({ name }) => onRename(allowBlank ? name : name.trim())}
    >
      {({ formProps, submitting }) => (
        <>
          <ModalBody>
            <form {...formProps} id={RENAME_CONTENT_FORM_ID}>
              <Field
                name="name"
                label="Name"
                defaultValue={initialName}
                validate={(value) =>
                  !allowBlank &&
                  (typeof value !== 'string' || value.trim().length === 0)
                    ? 'Name is required'
                    : undefined
                }
              >
                {({ fieldProps }) => <Textfield {...fieldProps} autoFocus />}
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
