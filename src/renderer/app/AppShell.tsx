import { useEffect, useMemo, useState } from 'react';
import Heading from '@atlaskit/heading';
import { Box, Stack, Text, xcss } from '@atlaskit/primitives';
import Spinner from '@atlaskit/spinner';
import { FormattedMessage } from 'react-intl';

import type { NoteraClient } from '../platform/notera-client';
import { NoteraClientError } from '../platform/notera-client';
import {
  handleCloseRequest,
  type CloseFailureChoice,
} from '../profile/close-guard';
import { ProfileGate } from '../profile/ProfileGate';
import type { ProfileListItem } from '../profile/ProfileList';
import { NavigationWorkspace } from '../navigation/NavigationWorkspace';
import { ActiveDocumentLifecycle } from '../notes/document-lifecycle';
import { NoteWriteCoordinator } from '../notes/note-write-coordinator';
import { useSession } from './session';

const shellStyles = xcss({
  minHeight: '100vh',
  backgroundColor: 'elevation.surface',
});
const accessStyles = xcss({ padding: 'space.300' });

export function AppShell({
  client,
  documentCloseGuard,
}: {
  readonly client: NoteraClient;
  readonly documentCloseGuard?: {
    readonly isDirty: () => boolean;
    readonly flush: () => Promise<void>;
    readonly chooseAfterFailure: () => Promise<CloseFailureChoice>;
  };
}) {
  const { state, dispatch } = useSession();
  const lifecycle = useMemo(() => new ActiveDocumentLifecycle(), []);
  const writeCoordinator = useMemo(() => new NoteWriteCoordinator(), []);
  const activeCloseGuard = useMemo(
    () =>
      documentCloseGuard ?? {
        isDirty: lifecycle.isDirty,
        flush: lifecycle.flush,
        chooseAfterFailure: async () => 'stay' as const,
      },
    [documentCloseGuard, lifecycle],
  );
  const [loaded, setLoaded] = useState(false);
  const [profiles, setProfiles] = useState<readonly ProfileListItem[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      client.request('profile.list', { limit: 50 }),
      client.request('profile.getSessionState', {}),
    ])
      .then(([profilePage, session]) => {
        if (!active) return undefined;
        setProfiles(profilePage.items);
        if (session.state === 'UNLOCKED') {
          dispatch({ type: 'unlocked', profile: session });
        } else {
          dispatch({ type: 'locked' });
        }
        setLoaded(true);
        return undefined;
      })
      .catch((error: unknown) => {
        if (!active) return undefined;
        dispatch({
          type: 'fatal',
          code:
            error instanceof NoteraClientError
              ? error.code
              : 'IPC_OPERATION_FAILED',
        });
        setLoaded(true);
        return undefined;
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
          ...activeCloseGuard,
          complete: (value) => client.request('app.completeClose', value),
        }).catch(() => undefined);
      }),
    [activeCloseGuard, client],
  );

  return (
    <Box as="main" xcss={shellStyles}>
      {state.status !== 'unlocked' ? (
        <Box xcss={accessStyles}>
          <Stack space="space.200">
            <Heading size="xlarge">
              <FormattedMessage id="app.name" />
            </Heading>
            {!loaded ||
            state.status === 'booting' ||
            state.status === 'unlocking' ? (
              <Box as="div" role="status">
                <Stack alignInline="center" space="space.100">
                  <Spinner size="large" />
                  <Text>
                    <FormattedMessage id="app.starting" />
                  </Text>
                </Stack>
              </Box>
            ) : null}
            {loaded && state.status === 'locked' ? (
              <ProfileGate client={client} profiles={profiles}>
                {null}
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
      ) : null}
      {loaded && state.status === 'unlocked' ? (
        <ProfileGate client={client} profiles={profiles}>
          <NavigationWorkspace
            client={client}
            lifecycle={lifecycle}
            writeCoordinator={writeCoordinator}
          />
        </ProfileGate>
      ) : null}
    </Box>
  );
}
