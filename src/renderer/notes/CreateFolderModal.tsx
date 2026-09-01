import Button from '@atlaskit/button/new';
import Form, { ErrorMessage, Field } from '@atlaskit/form';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import Textfield from '@atlaskit/textfield';

const CREATE_FOLDER_FORM_ID = 'notera-create-folder-form';

export function CreateFolderModal({
  onCreate,
}: {
  readonly onCreate: (name: string) => Promise<void> | void;
}) {
  return (
    <Form<{ name: string }>
      onSubmit={async ({ name }) => {
        await onCreate(name.trim());
      }}
    >
      {({ formProps, submitting }) => (
        <>
          <ModalBody>
            <form {...formProps} id={CREATE_FOLDER_FORM_ID}>
              <Field
                name="name"
                label="Folder name"
                defaultValue=""
                isRequired
                validate={(value) =>
                  typeof value !== 'string' || value.trim().length === 0
                    ? 'Folder name is required'
                    : undefined
                }
              >
                {({ fieldProps, error }) => (
                  <>
                    <Textfield {...fieldProps} autoFocus />
                    {error ? <ErrorMessage>{error}</ErrorMessage> : null}
                  </>
                )}
              </Field>
            </form>
          </ModalBody>
          <ModalFooter>
            <Button
              appearance="primary"
              type="submit"
              form={CREATE_FOLDER_FORM_ID}
              isLoading={submitting}
            >
              Create folder
            </Button>
          </ModalFooter>
        </>
      )}
    </Form>
  );
}
