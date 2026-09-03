import type { ReactNode } from 'react';
import Heading from '@atlaskit/heading';
import DevicesIcon from '@atlaskit/icon/core/devices';
import LockIcon from '@atlaskit/icon/core/lock-locked';
import ShieldIcon from '@atlaskit/icon/core/shield';
import Tile from '@atlaskit/tile';
import { Hide, Inline, Show, Stack, Text } from '@atlaskit/primitives/compiled';
import SectionMessage from '@atlaskit/section-message';
import { FormattedMessage } from 'react-intl';

export function ProfileAccessHero({
  hasProfiles,
}: {
  readonly hasProfiles: boolean;
}) {
  return (
    <>
      <Hide below="md" as="section">
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
      </Hide>
      <Show below="md" as="section">
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
      </Show>
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
      <Tile
        label=""
        size="medium"
        backgroundColor="color.background.accent.blue.subtlest"
      >
        {icon}
      </Tile>
      <Stack space="space.050">
        <Heading size="xsmall">
          <FormattedMessage id={titleId} />
        </Heading>
        <Text as="p" color="color.text.subtle">
          <FormattedMessage id={descriptionId} />
        </Text>
      </Stack>
    </Inline>
  );
}
