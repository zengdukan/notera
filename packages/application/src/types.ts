export type InternalSessionName = string & {
  readonly __internalSessionName: unique symbol;
};
