export interface TrackedOperation {
  readonly operationId: string;
  readonly state: 'running' | 'succeeded' | 'failed' | 'cancelled';
  readonly progress: number | null;
}

export type OperationsState = Readonly<Record<string, TrackedOperation>>;

export type OperationsAction =
  | { readonly type: 'track'; readonly operation: TrackedOperation }
  | { readonly type: 'clear' };

export function operationsReducer(
  state: OperationsState,
  action: OperationsAction,
): OperationsState {
  if (action.type === 'clear') return {};
  return { ...state, [action.operation.operationId]: action.operation };
}
