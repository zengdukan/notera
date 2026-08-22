import type { SqlcipherConnection } from '../connection';

export type MigrationDatabase = SqlcipherConnection;

export interface Migration {
  readonly targetVersion: number;
  readonly migrate: (database: MigrationDatabase) => void;
  readonly validate: (database: MigrationDatabase) => void;
}
