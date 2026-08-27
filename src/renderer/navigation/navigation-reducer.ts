export const NAVIGATION_MIN_WIDTH = 240;
export const NAVIGATION_MAX_WIDTH = 480;
export const NAVIGATION_DEFAULT_WIDTH = 280;

export type NavigationSelection =
  | { readonly kind: 'folder'; readonly id: string }
  | { readonly kind: 'note'; readonly id: string; readonly folderId: string };

export interface NavigationState {
  readonly width: number;
  readonly collapsed: boolean;
  readonly selection?: NavigationSelection;
}

export type NavigationAction =
  | { readonly type: 'resize'; readonly width: number }
  | { readonly type: 'resize-by'; readonly delta: number }
  | { readonly type: 'toggle-collapse' }
  | { readonly type: 'select'; readonly selection?: NavigationSelection };

export const initialNavigationState: NavigationState = Object.freeze({
  width: NAVIGATION_DEFAULT_WIDTH,
  collapsed: false,
});

function clamped(width: number): number {
  return Math.min(NAVIGATION_MAX_WIDTH, Math.max(NAVIGATION_MIN_WIDTH, width));
}

export function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  switch (action.type) {
    case 'resize':
      return { ...state, width: clamped(action.width) };
    case 'resize-by':
      return { ...state, width: clamped(state.width + action.delta) };
    case 'toggle-collapse':
      return { ...state, collapsed: !state.collapsed };
    case 'select':
      return { ...state, selection: action.selection };
    default:
      return action satisfies never;
  }
}

export function resolveCreationFolderId(
  rootFolderId: string,
  selection: NavigationSelection | undefined,
): string {
  if (selection === undefined) return rootFolderId;
  return selection.kind === 'folder' ? selection.id : selection.folderId;
}
