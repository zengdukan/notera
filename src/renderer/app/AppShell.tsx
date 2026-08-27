import { useEffect, useState } from 'react';
import Heading from '@atlaskit/heading';
import { Box, Stack, Text, xcss } from '@atlaskit/primitives';
import Spinner from '@atlaskit/spinner';
import { FormattedMessage } from 'react-intl';

import type { NoteraClient } from '../platform/notera-client';
import { NoteraClientError } from '../platform/notera-client';
import { handleCloseRequest, type CloseFailureChoice } from '../profile/close-guard';
import { ProfileGate } from '../profile/ProfileGate';
import type { ProfileListItem } from '../profile/ProfileList';
import { NavigationWorkspace } from '../navigation/NavigationWorkspace';
import { useSession } from './session';

const shellStyles = xcss({
  minHeight: '100vh',
  backgroundColor: 'elevation.surface',
  padding: 'space.300',
});

export function AppShell({
  client,
  documentCloseGuard = {
    isDirty: () => false,
    flush: async () => undefined,
    chooseAfterFailure: async () => 'stay' as const,
  },
}: {
  readonly client: NoteraClient;
  readonly documentCloseGuard?: {
    readonly isDirty: () => boolean;
    readonly flush: () => Promise<void>;
    readonly chooseAfterFailure: () => Promise<CloseFailureChoice>;
  };
}) {
  const { state, dispatch } = useSession();
  const [loaded, setLoaded] = useState(false);
  const [profiles, setProfiles] = useState<readonly ProfileListItem[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      client.request('profile.list', { limit: 50 }),
      client.request('profile.getSessionState', {}),
    ])
      .then(([profilePage, session]) => {
        if (!active) return;
        setProfiles(profilePage.items);
        if (session.state === 'UNLOCKED') {
          dispatch({ type: 'unlocked', profile: session });
        } else {
          dispatch({ type: 'locked' });
        }
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        dispatch({
          type: 'fatal',
          code:
            error instanceof NoteraClientError
              ? error.code
              : 'IPC_OPERATION_FAILED',
        });
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [client, dispatch]);

  useEffect(
    () =>
      client.subscribe('app.closeRequested', ({ requestId }) => {
        void handleCloseRequest({
          requestId,
          ...documentCloseGuard,
          complete: (value) => client.request('app.completeClose', value),
        }).catch(() => undefined);
      }),
    [client, documentCloseGuard],
  );

  return (
    <Box as="main" xcss={shellStyles}>
      <Stack space="space.200">
        <Heading size="xlarge">
          <FormattedMessage id="app.name" />
        </Heading>
        {!loaded || state.status === 'booting' || state.status === 'unlocking' ? (
          <Box as="div" role="status">
            <Stack alignInline="center" space="space.100">
              <Spinner size="large" />
              <Text>
                <FormattedMessage id="app.starting" />
              </Text>
            </Stack>
          </Box>
        ) : null}
        {loaded &&
        (state.status === 'locked' || state.status === 'unlocked') ? (
          <ProfileGate client={client} profiles={profiles}>
            <NavigationWorkspace client={client}>
              <Text as="p">
                <FormattedMessage id="app.workspaceReady" />
              </Text>
            </NavigationWorkspace>
          </ProfileGate>
        ) : null}
        {state.status === 'fatal' ? (
          <Box as="div" role="alert">
            <Text as="p">
              <FormattedMessage id="app.fatal" />
            </Text>
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
}
