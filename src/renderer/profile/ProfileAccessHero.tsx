import type { ReactNode } from 'react';
import Heading from '@atlaskit/heading';
import DevicesIcon from '@atlaskit/icon/core/devices';
import LockIcon from '@atlaskit/icon/core/lock-locked';
import ShieldIcon from '@atlaskit/icon/core/shield';
import { Inline, Stack, Text } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import { FormattedMessage } from 'react-intl';

export function ProfileAccessHero({
  hasProfiles,
}: {
  readonly hasProfiles: boolean;
}) {
  return (
    <>
      <section className="notera-profile-access__hero">
        <Stack space="space.400">
          <Stack space="space.150">
            <Text
              as="p"
              color="color.text.brand"
              size="small"
              weight="semibold"
            >
              <FormattedMessage id="profile.hero.eyebrow" />
            </Text>
            <Heading size="xxlarge">
              <FormattedMessage id="profile.hero.title" />
            </Heading>
            <Text as="p" color="color.text.subtle">
              <FormattedMessage id="profile.hero.description" />
            </Text>
          </Stack>
          <Stack space="space.250">
            <Feature
              icon={<DevicesIcon label="" />}
              titleId="profile.hero.local.title"
              descriptionId="profile.hero.local.description"
            />
            <Feature
              icon={<ShieldIcon label="" />}
              titleId="profile.hero.encrypted.title"
              descriptionId="profile.hero.encrypted.description"
            />
            <Feature
              icon={<LockIcon label="" />}
              titleId="profile.hero.offline.title"
              descriptionId="profile.hero.offline.description"
            />
          </Stack>
        </Stack>
      </section>
      <section className="notera-profile-access__narrow-intro">
        <Stack space="space.250">
          <Stack space="space.100">
            <Heading size="xlarge">
              <FormattedMessage
                id={
                  hasProfiles
                    ? 'profile.narrow.unlockTitle'
                    : 'profile.narrow.createTitle'
                }
              />
            </Heading>
            <Text as="p" color="color.text.subtle">
              <FormattedMessage id="profile.narrow.description" />
            </Text>
          </Stack>
          <SectionMessage>
            <Text as="p" weight="semibold">
              <FormattedMessage id="profile.narrow.summary" />
            </Text>
            <Text as="p">
              <FormattedMessage id="profile.narrow.summaryDescription" />
            </Text>
          </SectionMessage>
        </Stack>
      </section>
    </>
  );
}

function Feature({
  icon,
  titleId,
  descriptionId,
}: {
  readonly icon: ReactNode;
  readonly titleId: string;
  readonly descriptionId: string;
}) {
  return (
    <Inline space="space.200" alignBlock="start">
      <span className="notera-profile-access__feature-icon">{icon}</span>
      <Stack space="space.050">
        <Text as="p" weight="semibold">
          <FormattedMessage id={titleId} />
        </Text>
        <Text as="p" color="color.text.subtle">
          <FormattedMessage id={descriptionId} />
        </Text>
      </Stack>
    </Inline>
  );
}
