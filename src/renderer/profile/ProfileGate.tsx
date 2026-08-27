import { type ReactNode, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { clearProfileQueries } from '../app/query-client';
import { useSession } from '../app/session';
import type { NoteraClient } from '../platform/notera-client';
import { createActivityReporter } from './activity-reporter';
import { ProfileAccessPage } from './ProfileAccessPage';
import { createProfileController } from './profile-controller';
import type { ProfileListItem } from './ProfileList';

export function ProfileGate({
  client,
  profiles,
  children,
}: {
  readonly client: NoteraClient;
  readonly profiles: readonly ProfileListItem[];
  readonly children: ReactNode;
}) {
  const { state, dispatch } = useSession();
  const queryClient = useQueryClient();
  const controller = useMemo(
    () => createProfileController({ client, dispatch }),
    [client, dispatch],
  );

  useEffect(
    () =>
      client.subscribe('profile.locked', () => {
        if (state.status === 'unlocked') {
          clearProfileQueries(queryClient, state.profile.localProfileId);
        }
        dispatch({ type: 'locked' });
      }),
    [client, dispatch, queryClient, state],
  );

  useEffect(() => {
    if (state.status !== 'unlocked') return undefined;
    const reporter = createActivityReporter({
      target: window,
      now: Date.now,
      touch: () => {
        void client.request('profile.touchActivity', {}).catch(() => undefined);
      },
    });
    reporter.start();
    return () => reporter.stop();
  }, [client, state.status]);

  if (state.status === 'locked') {
    return (
      <ProfileAccessPage
        profiles={profiles}
        onCreate={(value) => controller.create(value)}
        onUnlock={(value) => controller.unlock(value)}
      />
    );
  }
  if (state.status === 'unlocked') return children;
  return null;
}
