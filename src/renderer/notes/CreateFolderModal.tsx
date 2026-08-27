import Button from '@atlaskit/button/new';
import Form, { ErrorMessage, Field, FormFooter } from '@atlaskit/form';
import Textfield from '@atlaskit/textfield';

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
        <form {...formProps}>
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
          <FormFooter>
            <Button appearance="primary" type="submit" isLoading={submitting}>
              Create folder
            </Button>
          </FormFooter>
        </form>
      )}
    </Form>
  );
}
