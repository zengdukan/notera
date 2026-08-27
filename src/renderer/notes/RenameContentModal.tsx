import Button from '@atlaskit/button/new';
import Form, { Field, FormFooter } from '@atlaskit/form';
import Textfield from '@atlaskit/textfield';

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
        <form {...formProps}>
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
          <FormFooter>
            <Button appearance="primary" type="submit" isLoading={submitting}>
              Rename
            </Button>
          </FormFooter>
        </form>
      )}
    </Form>
  );
}
