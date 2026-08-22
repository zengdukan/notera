import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  asLocalProfileId,
  asTimestamp,
  type LocalProfileId,
} from '@notera/domain';

import { replaceFileWithBackup } from './atomic-file';
import { ApplicationError } from './errors';
import { paginateCatalog } from './pagination';
import type { ApplicationPaths } from './paths';
import { recoverCatalog, removeVerifiedDirectory } from './recovery';
import type {
  CatalogEntry,
  Page,
  PageRequest,
  ProfileSummary,
  RecoveryReport,
} from './types';

const MAX_CATALOG_BYTES = 1024 * 1024;
const MAX_PROFILES = 1000;

type SnapshotWriter = (
  target: string,
  backup: string,
  current: Uint8Array,
  next: Uint8Array,
  sessionName: string,
) => Promise<void>;

export interface ProfileCatalog {
  get(id: LocalProfileId): CatalogEntry | undefined;
  has(id: LocalProfileId): boolean;
  list(input: PageRequest, currentId?: LocalProfileId): Page<ProfileSummary>;
  add(entry: CatalogEntry): Promise<void>;
  updateCache(entry: CatalogEntry): Promise<void>;
  remove(id: LocalProfileId): Promise<void>;
  hide(id: LocalProfileId): void;
}

export interface CreateProfileCatalogOptions {
  readonly createSessionName?: () => string;
  readonly writeSnapshot?: SnapshotWriter;
  readonly removeDirectory?: (absolutePath: string) => Promise<void>;
}

function validName(value: unknown): string {
  if (typeof value !== 'string') throw new ApplicationError('INVALID_NAME');
  const trimmed = value.trim();
  if ([...trimmed].length < 1 || [...trimmed].length > 100) {
    throw new ApplicationError('INVALID_NAME');
  }
  return trimmed;
}

function normalizeEntry(value: unknown, persisted = false): CatalogEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApplicationError('OPERATION_FAILED');
  }
  const record = value as Record<string, unknown>;
  const keys = ['localProfileId', 'displayName', 'sortOrder', 'lastUsedAt'];
  if (
    Object.keys(record).length !== keys.length ||
    Object.keys(record).some((key) => !keys.includes(key))
  ) {
    throw new ApplicationError('OPERATION_FAILED');
  }
  const displayName = validName(record.displayName);
  if (persisted && displayName !== record.displayName) {
    throw new ApplicationError('OPERATION_FAILED');
  }
  if (
    !Number.isSafeInteger(record.sortOrder) ||
    (record.sortOrder as number) < 0
  ) {
    throw new ApplicationError('OPERATION_FAILED');
  }
  return Object.freeze({
    localProfileId: asLocalProfileId(record.localProfileId),
    displayName,
    sortOrder: record.sortOrder as number,
    lastUsedAt: asTimestamp(record.lastUsedAt),
  });
}

function sorted(entries: readonly CatalogEntry[]): readonly CatalogEntry[] {
  return Object.freeze(
    [...entries].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.localProfileId.localeCompare(right.localProfileId),
    ),
  );
}

function encode(entries: readonly CatalogEntry[]): Uint8Array {
  return Buffer.from(`${JSON.stringify({ version: 1, entries })}\n`, 'utf8');
}

function decode(bytes: Uint8Array): readonly CatalogEntry[] {
  if (bytes.byteLength > MAX_CATALOG_BYTES) throw new Error('large');
  const parsed = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  ) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('shape');
  const record = parsed as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    record.version !== 1 ||
    !Array.isArray(record.entries) ||
    record.entries.length > MAX_PROFILES
  )
    throw new Error('shape');
  const entries = record.entries.map((entry) => normalizeEntry(entry, true));
  if (
    new Set(entries.map(({ localProfileId }) => localProfileId)).size !==
    entries.length
  )
    throw new Error('duplicate');
  return sorted(entries);
}

async function tryRead(
  path: string,
): Promise<
  { bytes: Uint8Array; entries: readonly CatalogEntry[] } | undefined
> {
  try {
    const bytes = await readFile(path);
    return { bytes, entries: decode(bytes) };
  } catch {
    return undefined;
  }
}

class Catalog implements ProfileCatalog {
  private entries: readonly CatalogEntry[];

  private bytes: Uint8Array;

  constructor(
    entries: readonly CatalogEntry[],
    bytes: Uint8Array,
    private readonly paths: ApplicationPaths,
    private readonly session: () => string,
    private readonly writer: SnapshotWriter,
  ) {
    this.entries = sorted(entries);
    this.bytes = Uint8Array.from(bytes);
  }

  get(id: LocalProfileId): CatalogEntry | undefined {
    const found = this.entries.find((entry) => entry.localProfileId === id);
    return found === undefined ? undefined : Object.freeze({ ...found });
  }

  has(id: LocalProfileId): boolean {
    return this.get(id) !== undefined;
  }

  list(input: PageRequest, currentId?: LocalProfileId): Page<ProfileSummary> {
    return paginateCatalog(this.entries, input, currentId);
  }

  private async commit(nextEntries: readonly CatalogEntry[]): Promise<void> {
    const normalized = sorted(nextEntries);
    if (normalized.length > MAX_PROFILES)
      throw new ApplicationError('OPERATION_FAILED');
    const next = encode(normalized);
    await this.writer(
      this.paths.catalog,
      this.paths.catalogBackup,
      this.bytes,
      next,
      this.session(),
    );
    this.entries = normalized;
    this.bytes = Uint8Array.from(next);
  }

  async add(value: CatalogEntry): Promise<void> {
    const entry = normalizeEntry(value);
    if (this.has(entry.localProfileId))
      throw new ApplicationError('OPERATION_FAILED');
    await this.commit([...this.entries, entry]);
  }

  async updateCache(value: CatalogEntry): Promise<void> {
    const entry = normalizeEntry(value);
    if (!this.has(entry.localProfileId))
      throw new ApplicationError('ENTITY_NOT_FOUND');
    await this.commit(
      this.entries.map((item) =>
        item.localProfileId === entry.localProfileId ? entry : item,
      ),
    );
  }

  async remove(id: LocalProfileId): Promise<void> {
    if (!this.has(id)) throw new ApplicationError('ENTITY_NOT_FOUND');
    await this.commit(
      this.entries.filter((entry) => entry.localProfileId !== id),
    );
  }

  hide(id: LocalProfileId): void {
    this.entries = this.entries.filter((entry) => entry.localProfileId !== id);
    this.bytes = encode(this.entries);
  }
}

export async function createProfileCatalog(
  paths: ApplicationPaths,
  options: CreateProfileCatalogOptions = {},
): Promise<{
  readonly catalog: ProfileCatalog;
  readonly report: RecoveryReport;
}> {
  const session =
    options.createSessionName ?? (() => randomBytes(16).toString('hex'));
  const writer = options.writeSnapshot ?? replaceFileWithBackup;
  const primary = await tryRead(paths.catalog);
  const backup =
    primary === undefined ? await tryRead(paths.catalogBackup) : undefined;
  const loaded = primary ?? backup ?? { bytes: encode([]), entries: [] };
  const recovered = await recoverCatalog(paths, loaded.entries, {
    createSessionName: session,
    removeDirectory: options.removeDirectory ?? removeVerifiedDirectory,
  });
  const nextBytes = encode(recovered.entries);
  if (primary === undefined || recovered.changed) {
    await writer(
      paths.catalog,
      paths.catalogBackup,
      loaded.bytes,
      nextBytes,
      session(),
    );
  }
  return Object.freeze({
    catalog: new Catalog(recovered.entries, nextBytes, paths, session, writer),
    report: recovered.report,
  });
}
