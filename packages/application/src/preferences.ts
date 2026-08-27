import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { asLocalProfileId, type LocalProfileId } from '@notera/domain';

import { replaceFileAtomically } from './atomic-file';
import { ApplicationError } from './errors';
import { createApplicationPaths } from './paths';

export type ThemePreference = 'SYSTEM' | 'LIGHT' | 'DARK';
export type LanguagePreference = 'zh-CN' | 'en';
export type AutoLockMinutes = 1 | 5 | 15 | 30 | 60;

export interface DeviceSettings {
  readonly theme: ThemePreference;
  readonly language: LanguagePreference;
}

export interface ProfileSettings {
  readonly autoLockMinutes: AutoLockMinutes;
}

export interface PreferencesStore {
  getDevice(): DeviceSettings;
  updateDevice(input: Partial<DeviceSettings>): Promise<DeviceSettings>;
  getProfile(localProfileId: LocalProfileId | string): ProfileSettings;
  updateProfile(
    localProfileId: LocalProfileId | string,
    input: ProfileSettings,
  ): Promise<ProfileSettings>;
  removeProfile(localProfileId: LocalProfileId | string): Promise<void>;
}

interface Snapshot {
  readonly version: 1;
  readonly device: DeviceSettings;
  readonly profiles: Readonly<Record<string, ProfileSettings>>;
}

const themes = new Set<ThemePreference>(['SYSTEM', 'LIGHT', 'DARK']);
const languages = new Set<LanguagePreference>(['zh-CN', 'en']);
const lockMinutes = new Set<AutoLockMinutes>([1, 5, 15, 30, 60]);

function languageFor(systemLocale: string): LanguagePreference {
  return systemLocale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

function defaults(systemLocale: string): Snapshot {
  return Object.freeze({
    version: 1,
    device: Object.freeze({
      theme: 'SYSTEM' as const,
      language: languageFor(systemLocale),
    }),
    profiles: Object.freeze({}),
  });
}

function normalizeDevice(value: unknown): DeviceSettings {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid');
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    !themes.has(record.theme as ThemePreference) ||
    !languages.has(record.language as LanguagePreference)
  ) {
    throw new Error('invalid');
  }
  return Object.freeze({
    theme: record.theme as ThemePreference,
    language: record.language as LanguagePreference,
  });
}

function normalizeProfile(value: unknown): ProfileSettings {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid');
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 1 ||
    !lockMinutes.has(record.autoLockMinutes as AutoLockMinutes)
  ) {
    throw new Error('invalid');
  }
  return Object.freeze({
    autoLockMinutes: record.autoLockMinutes as AutoLockMinutes,
  });
}

function normalize(value: unknown): Snapshot {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid');
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 3 ||
    record.version !== 1 ||
    record.profiles === null ||
    typeof record.profiles !== 'object' ||
    Array.isArray(record.profiles)
  ) {
    throw new Error('invalid');
  }
  const profiles = Object.fromEntries(
    Object.entries(record.profiles as Record<string, unknown>).map(
      ([rawId, settings]) => [
        asLocalProfileId(rawId),
        normalizeProfile(settings),
      ],
    ),
  );
  return Object.freeze({
    version: 1,
    device: normalizeDevice(record.device),
    profiles: Object.freeze(profiles),
  });
}

function encode(value: Snapshot): Uint8Array {
  return Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
}

class LocalPreferencesStore implements PreferencesStore {
  private snapshot: Snapshot;

  private queue: Promise<void> = Promise.resolve();

  constructor(
    snapshot: Snapshot,
    private readonly path: string,
    private readonly createSessionName: () => string,
  ) {
    this.snapshot = snapshot;
  }

  getDevice(): DeviceSettings {
    return Object.freeze({ ...this.snapshot.device });
  }

  updateDevice(input: Partial<DeviceSettings>): Promise<DeviceSettings> {
    const next = normalizeDevice({ ...this.snapshot.device, ...input });
    return this.commit({ ...this.snapshot, device: next }).then(() => next);
  }

  getProfile(localProfileId: LocalProfileId | string): ProfileSettings {
    const id = asLocalProfileId(localProfileId);
    return Object.freeze({
      ...(this.snapshot.profiles[id] ?? { autoLockMinutes: 15 as const }),
    });
  }

  updateProfile(
    localProfileId: LocalProfileId | string,
    input: ProfileSettings,
  ): Promise<ProfileSettings> {
    const id = asLocalProfileId(localProfileId);
    const next = normalizeProfile(input);
    return this.commit({
      ...this.snapshot,
      profiles: { ...this.snapshot.profiles, [id]: next },
    }).then(() => next);
  }

  removeProfile(localProfileId: LocalProfileId | string): Promise<void> {
    const id = asLocalProfileId(localProfileId);
    if (!(id in this.snapshot.profiles)) return Promise.resolve();
    const profiles = { ...this.snapshot.profiles };
    delete profiles[id];
    return this.commit({ ...this.snapshot, profiles });
  }

  private commit(value: Snapshot): Promise<void> {
    const next = normalize(value);
    const operation = this.queue.then(async () => {
      try {
        await replaceFileAtomically(
          this.path,
          encode(next),
          this.createSessionName(),
        );
        this.snapshot = next;
      } catch (error) {
        if (error instanceof ApplicationError) throw error;
        throw new ApplicationError('SAVE_FAILED');
      }
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}

export async function createPreferencesStore(input: {
  readonly appDataRoot: string;
  readonly systemLocale?: string;
  readonly createSessionName?: () => string;
}): Promise<PreferencesStore> {
  const paths = await createApplicationPaths(input.appDataRoot);
  const fallback = defaults(
    input.systemLocale ?? Intl.DateTimeFormat().resolvedOptions().locale,
  );
  let snapshot = fallback;
  try {
    const bytes = await readFile(paths.preferences);
    if (bytes.byteLength > 1024 * 1024) throw new Error('large');
    snapshot = normalize(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    );
  } catch {
    snapshot = fallback;
  }
  return new LocalPreferencesStore(
    snapshot,
    paths.preferences,
    input.createSessionName ?? (() => randomBytes(16).toString('hex')),
  );
}
