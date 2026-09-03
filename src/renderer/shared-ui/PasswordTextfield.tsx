import { IconButton } from '@atlaskit/button/new';
import EyeOpenIcon from '@atlaskit/icon/core/eye-open';
import EyeOpenStrikethroughIcon from '@atlaskit/icon/core/eye-open-strikethrough';
import Textfield, { type TextFieldProps } from '@atlaskit/textfield';
import { useState } from 'react';
import { useIntl } from 'react-intl';

export function PasswordTextfield(props: TextFieldProps) {
  const intl = useIntl();
  const [visible, setVisible] = useState(false);
  const label = intl.formatMessage({
    id: visible ? 'settings.password.hide' : 'settings.password.show',
  });
  return (
    <Textfield
      {...props}
      type={visible ? 'text' : 'password'}
      elemAfterInput={
        <IconButton
          appearance="subtle"
          icon={visible ? EyeOpenStrikethroughIcon : EyeOpenIcon}
          label={label}
          spacing="compact"
          type="button"
          onClick={() => setVisible((current) => !current)}
        />
      }
    />
  );
}
