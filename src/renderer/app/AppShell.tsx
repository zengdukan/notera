import { useEffect, useMemo, useState } from 'react';
import Heading from '@atlaskit/heading';
import { Box, Inline, Stack, Text, xcss } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import { FormattedMessage, useIntl } from 'react-intl';

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
import './AppShell.css';

const shellStyles = xcss({
  minHeight: '100vh',
  backgroundColor: 'elevation.surface',
});

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
      {!loaded || state.status === 'booting' ? <StartupView /> : null}
      {loaded && (state.status === 'locked' || state.status === 'unlocking') ? (
        <ProfileGate client={client} profiles={profiles}>
          {null}
        </ProfileGate>
      ) : null}
      {loaded && state.status === 'fatal' ? <FatalStartupView /> : null}
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

function StartupBrand() {
  return (
    <Inline alignBlock="center" space="space.150">
      <span className="notera-startup__mark">
        <span className="notera-startup__brand-image" />
      </span>
      <Heading size="large">
        <FormattedMessage id="app.name" />
      </Heading>
    </Inline>
  );
}

function StartupView() {
  return (
    <div className="notera-startup">
      <div className="notera-startup__content">
        <Stack alignInline="center" space="space.300">
          <StartupBrand />
          <Box as="div" role="status">
            <Stack alignInline="center" space="space.100">
              <Spinner size="large" />
              <Text color="color.text.subtle">
                <FormattedMessage id="app.starting" />
              </Text>
            </Stack>
          </Box>
        </Stack>
      </div>
    </div>
  );
}

function FatalStartupView() {
  const intl = useIntl();

  return (
    <div className="notera-startup">
      <div className="notera-startup__content">
        <Stack space="space.300">
          <StartupBrand />
          <SectionMessage
            appearance="error"
            headingLevel="h2"
            title={intl.formatMessage({ id: 'app.fatal' })}
          >
            <Text as="p">
              <FormattedMessage id="app.fatalDescription" />
            </Text>
          </SectionMessage>
        </Stack>
      </div>
    </div>
  );
}
