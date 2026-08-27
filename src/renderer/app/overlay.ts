export type PrimaryOverlayKind =
  | 'search'
  | 'favorites'
  | 'recent'
  | 'trash'
  | 'settings';

export type NoteOperation =
  | 'create-folder'
  | 'rename'
  | 'move'
  | 'copy'
  | 'trash';

export type OverlayState =
  | { readonly kind: 'none' }
  | { readonly kind: PrimaryOverlayKind }
  | { readonly kind: 'note-operation'; readonly operation: NoteOperation };

export type OverlayAction =
  | {
      readonly type: 'open';
      readonly overlay: Exclude<OverlayState, { kind: 'none' }>;
    }
  | { readonly type: 'close' };

export const initialOverlayState: OverlayState = { kind: 'none' };

export function overlayReducer(
  _state: OverlayState,
  action: OverlayAction,
): OverlayState {
  return action.type === 'open' ? action.overlay : initialOverlayState;
}
