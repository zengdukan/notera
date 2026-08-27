import { useEffect, useState } from 'react';
import Heading from '@atlaskit/heading';
import { Box, Stack, Text, xcss } from '@atlaskit/primitives';
import Spinner from '@atlaskit/spinner';
import { FormattedMessage } from 'react-intl';

import type { NoteraClient } from '../platform/notera-client';
import { NoteraClientError } from '../platform/notera-client';
import { useSession } from './session';

const shellStyles = xcss({
  minHeight: '100vh',
  backgroundColor: 'elevation.surface',
  padding: 'space.300',
});

export function AppShell({ client }: { readonly client: NoteraClient }) {
  const { state, dispatch } = useSession();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      client.request('profile.list', { limit: 50 }),
      client.request('profile.getSessionState', {}),
    ])
      .then(([, session]) => {
        if (!active) return;
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
        {state.status === 'locked' ? (
          <Text as="p">
            <FormattedMessage id="app.chooseProfile" />
          </Text>
        ) : null}
        {state.status === 'unlocked' ? (
          <Text as="p">
            <FormattedMessage id="app.workspaceReady" />
          </Text>
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
