import { useEffect, useMemo, useState } from 'react';
import Button from '@atlaskit/button/new';
import Heading from '@atlaskit/heading';
import CheckCircleIcon from '@atlaskit/icon/core/check-circle';
import { Box, Inline, Stack, Text, xcss } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import Skeleton from '@atlaskit/skeleton';
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

const WORKSPACE_TRANSITION_MS = 800;

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

  useEffect(() => {
    if (state.status !== 'transitioning') return undefined;
    const { profile } = state;
    const timer = window.setTimeout(() => {
      dispatch({ type: 'unlocked', profile });
    }, WORKSPACE_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [dispatch, state]);

  return (
    <Box as="main" xcss={shellStyles}>
      {!loaded || state.status === 'booting' ? <StartupView /> : null}
      {loaded && (state.status === 'locked' || state.status === 'unlocking') ? (
        <ProfileGate client={client} profiles={profiles}>
          {null}
        </ProfileGate>
      ) : null}
      {loaded && state.status === 'fatal' ? <FatalStartupView /> : null}
      {loaded && state.status === 'transitioning' ? (
        <WorkspaceTransitionView />
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

function StartupBrand() {
  return (
    <Stack alignInline="center" space="space.100">
      <span className="notera-startup__mark">
        <span className="notera-startup__brand-image" />
      </span>
      <Heading size="medium">
        <FormattedMessage id="app.name" />
      </Heading>
    </Stack>
  );
}

function StartupHeader() {
  return (
    <header className="notera-startup-header">
      <Inline alignBlock="center" space="space.100">
        <span className="notera-startup-header__mark">
          <span className="notera-startup-header__brand-image" />
        </span>
        <Heading size="medium">
          <FormattedMessage id="app.name" />
        </Heading>
      </Inline>
      <Text color="color.text.subtle" size="small">
        <span className="notera-startup-header__status-dot" />
        <FormattedMessage id="profile.header.localMode" />
      </Text>
    </header>
  );
}

function StartupView() {
  return (
    <div className="notera-startup">
      <div className="notera-startup__content">
        <Stack alignInline="center" space="space.250">
          <StartupBrand />
          <Box as="div" role="status">
            <Stack alignInline="center" space="space.150">
              <Spinner size="large" />
              <Stack alignInline="center" space="space.050">
                <Text color="color.text.subtle">
                  <FormattedMessage id="app.starting" />
                </Text>
                <Text color="color.text.subtlest" size="small">
                  <FormattedMessage id="app.startingHint" />
                </Text>
              </Stack>
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
    <div className="notera-startup-page">
      <StartupHeader />
      <main className="notera-startup-page__main">
        <section className="notera-startup-card">
          <Stack space="space.400">
            <SectionMessage
              appearance="error"
              headingLevel="h2"
              title={intl.formatMessage({ id: 'app.fatal' })}
            >
              <Text as="p">
                <FormattedMessage id="app.fatalDescription" />
              </Text>
            </SectionMessage>
            <Stack space="space.250" alignInline="start">
              <Text as="p" color="color.text.subtle">
                <FormattedMessage id="app.fatalRecovery" />
              </Text>
              <Button appearance="primary" onClick={() => window.close()}>
                <FormattedMessage id="app.close" />
              </Button>
            </Stack>
          </Stack>
        </section>
      </main>
    </div>
  );
}

function WorkspaceTransitionView() {
  const intl = useIntl();

  return (
    <div className="notera-startup">
      <section className="notera-transition-card">
        <Stack alignInline="center" space="space.300">
          <span className="notera-transition-card__success">
            <CheckCircleIcon label="" />
          </span>
          <Stack alignInline="center" space="space.075">
            <Heading size="large">
              <FormattedMessage id="app.profileUnlocked" />
            </Heading>
            <Text color="color.text.subtle">
              <FormattedMessage id="app.enteringWorkspace" />
            </Text>
          </Stack>
          <div
            aria-label={intl.formatMessage({ id: 'app.preparingWorkspace' })}
            className="notera-transition-preview"
            role="status"
          >
            <Skeleton
              width={96}
              height={80}
              borderRadius="var(--ds-radius-small)"
            />
            <Stack space="space.150" grow="fill">
              <Skeleton
                width="85%"
                height={12}
                borderRadius="var(--ds-radius-xsmall)"
              />
              <Skeleton
                width="70%"
                height={12}
                borderRadius="var(--ds-radius-xsmall)"
              />
              <Skeleton
                width="78%"
                height={12}
                borderRadius="var(--ds-radius-xsmall)"
              />
            </Stack>
          </div>
        </Stack>
      </section>
    </div>
  );
}
