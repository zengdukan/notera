import Heading from '@atlaskit/heading';
import { Inline, Text } from '@atlaskit/primitives';
import { FormattedMessage } from 'react-intl';

export function ProfileAccessHeader() {
  return (
    <header className="notera-profile-access__header">
      <Inline space="space.100" alignBlock="center">
        <span className="notera-profile-access__brand-mark">
          <span className="notera-profile-access__brand-image" />
        </span>
        <Heading size="medium">Notera</Heading>
      </Inline>
      <Text color="color.text.subtle" size="small">
        <span className="notera-profile-access__status-dot" />
        <span className="notera-profile-access__wide-status">
          <FormattedMessage id="profile.header.languages" />
        </span>
        <span className="notera-profile-access__narrow-status">
          <FormattedMessage id="profile.header.localMode" />
        </span>
      </Text>
    </header>
  );
}
