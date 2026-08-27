import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useReducer,
} from 'react';
import type { z } from 'zod';

import type { IpcErrorCode } from '../../shared';
import { unlockedSessionSchema } from '../../shared';

export type UnlockedSession = z.output<typeof unlockedSessionSchema>;

export type SessionState =
  | { readonly status: 'booting' }
  | {
      readonly status: 'locked';
      readonly discardedDraftProfileId?: string;
    }
  | { readonly status: 'unlocking'; readonly localProfileId: string }
  | { readonly status: 'unlocked'; readonly profile: UnlockedSession }
  | { readonly status: 'fatal'; readonly code: IpcErrorCode };

export type SessionAction =
  | { readonly type: 'booting' }
  | { readonly type: 'unlocking'; readonly localProfileId: string }
  | { readonly type: 'unlocked'; readonly profile: UnlockedSession }
  | {
      readonly type: 'locked';
      readonly discardedDraftProfileId?: string;
    }
  | { readonly type: 'fatal'; readonly code: IpcErrorCode };

export const initialSessionState: SessionState = { status: 'booting' };

export function sessionReducer(
  _state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case 'booting':
      return initialSessionState;
    case 'unlocking':
      return { status: 'unlocking', localProfileId: action.localProfileId };
    case 'unlocked':
      return { status: 'unlocked', profile: action.profile };
    case 'locked':
      return {
        status: 'locked',
        ...(action.discardedDraftProfileId === undefined
          ? {}
          : { discardedDraftProfileId: action.discardedDraftProfileId }),
      };
    case 'fatal':
      return { status: 'fatal', code: action.code };
    default:
      return action satisfies never;
  }
}

const SessionContext = createContext<
  { readonly state: SessionState; readonly dispatch: Dispatch<SessionAction> }
  | undefined
>(undefined);

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (value === undefined) throw new Error('SessionProvider is missing.');
  return value;
}
