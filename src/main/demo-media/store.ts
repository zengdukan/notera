import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream, type Stats } from 'node:fs';
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

export type MediaType =
  | 'archive'
  | 'audio'
  | 'doc'
  | 'image'
  | 'unknown'
  | 'video';

export interface MediaFileDetails {
  readonly name: string;
  readonly size: number;
  readonly mimeType?: string;
  readonly mediaType?: MediaType;
  readonly processingStatus?: 'succeeded';
  readonly artifacts?: Record<
    string,
    { readonly url: string; readonly processingStatus: 'succeeded' }
  >;
  readonly representations?: { readonly image?: Record<string, never> };
  readonly createdAt?: number;
}

export interface MediaFileRecord {
  readonly id: string;
  collection: string;
  readonly occurrenceKey: string;
  readonly createdAt: number;
  details: MediaFileDetails;
}

interface MediaDatabase {
  readonly version: 1;
  readonly files: Record<string, MediaFileRecord>;
}

export interface MediaUpload {
  readonly id: string;
  readonly created: number;
  readonly expires: number;
  readonly chunks: string[];
}

const EMPTY_DATABASE: MediaDatabase = { version: 1, files: {} };

export function mediaTypeFor(mimeType = ''): MediaType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (
    /^application\/(zip|x-zip-compressed|x-7z-compressed|x-rar-compressed|gzip|x-gzip)$/u.test(
      mimeType,
    )
  ) {
    return 'archive';
  }
  return mimeType.length > 0 ? 'doc' : 'unknown';
}

function representationsFor(
  mediaType: MediaType,
): MediaFileDetails['representations'] {
  return mediaType === 'image' || mediaType === 'video' ? { image: {} } : {};
}

function artifactsFor(
  id: string,
  mediaType: MediaType,
): NonNullable<MediaFileDetails['artifacts']> {
  const artifactName =
    mediaType === 'video'
      ? 'video_1280.mp4'
      : mediaType === 'audio'
        ? 'audio.mp3'
        : undefined;
  return artifactName === undefined
    ? {}
    : {
        [artifactName]: {
          url: `/file/${id}/binary`,
          processingStatus: 'succeeded',
        },
      };
}

function safeSegment(value: string): string {
  if (!/^[a-zA-Z0-9._-]+$/u.test(value)) {
    throw new Error('Invalid storage identifier');
  }
  return value;
}

function isMissingFile(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

export class MediaStore {
  readonly rootDirectory: string;
  readonly filesDirectory: string;
  readonly chunksDirectory: string;
  readonly databasePath: string;
  private readonly uploads = new Map<string, MediaUpload>();
  private database: MediaDatabase = structuredClone(EMPTY_DATABASE);
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(rootDirectory: string) {
    this.rootDirectory = path.resolve(rootDirectory);
    this.filesDirectory = path.join(this.rootDirectory, 'files');
    this.chunksDirectory = path.join(this.rootDirectory, 'chunks');
    this.databasePath = path.join(this.rootDirectory, 'metadata.json');
  }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.filesDirectory, { recursive: true }),
      mkdir(this.chunksDirectory, { recursive: true }),
    ]);
    try {
      this.database = JSON.parse(
        await readFile(this.databasePath, 'utf8'),
      ) as MediaDatabase;
    } catch (error) {
      if (!isMissingFile(error)) throw error;
      await this.persist();
    }
  }

  async persist(): Promise<void> {
    const snapshot = JSON.stringify(this.database, null, 2);
    const writeSnapshot = async () => {
      const temporaryPath = `${this.databasePath}.tmp`;
      await writeFile(temporaryPath, snapshot, 'utf8');
      await rename(temporaryPath, this.databasePath);
    };
    this.persistQueue = this.persistQueue.then(writeSnapshot, writeSnapshot);
    await this.persistQueue;
  }

  binaryPath(id: string): string {
    return path.join(this.filesDirectory, safeSegment(id));
  }

  chunkPath(id: string): string {
    return path.join(this.chunksDirectory, safeSegment(id));
  }

  getFile(id: string, collection?: string): MediaFileRecord | undefined {
    const file = this.database.files[id];
    return file !== undefined &&
      (collection === undefined || file.collection === collection)
      ? file
      : undefined;
  }

  async createPlaceholder(input: {
    readonly id?: string;
    readonly collection: string;
    readonly occurrenceKey?: string;
  }): Promise<MediaFileRecord> {
    const id = input.id ?? randomUUID();
    const file: MediaFileRecord = {
      id,
      collection: input.collection,
      occurrenceKey: input.occurrenceKey ?? randomUUID(),
      createdAt: Date.now(),
      details: { name: '', size: 0 },
    };
    this.database.files[id] = file;
    await this.persist();
    return file;
  }

  createUpload(): MediaUpload {
    const now = Date.now();
    const upload: MediaUpload = {
      id: randomUUID(),
      created: now,
      expires: now + 60 * 60 * 1000,
      chunks: [],
    };
    this.uploads.set(upload.id, upload);
    return upload;
  }

  async putChunk(id: string, buffer: Buffer): Promise<void> {
    await writeFile(this.chunkPath(id), buffer);
  }

  hasChunk(id: string): Promise<boolean> {
    return stat(this.chunkPath(id)).then(
      () => true,
      () => false,
    );
  }

  appendUploadChunks(uploadId: string, chunkIds: readonly string[]): boolean {
    const upload = this.uploads.get(uploadId);
    if (upload === undefined) return false;
    upload.chunks.push(...chunkIds);
    return true;
  }

  async finalizeUpload(input: {
    readonly uploadId: string;
    readonly fileId: string;
    readonly collection: string;
    readonly name: string;
    readonly mimeType: string;
  }): Promise<MediaFileRecord | undefined> {
    const upload = this.uploads.get(input.uploadId);
    const file = this.getFile(input.fileId);
    if (upload === undefined || file === undefined) return undefined;

    const destination = this.binaryPath(input.fileId);
    await writeFile(destination, Buffer.alloc(0));
    for (const chunkId of upload.chunks) {
      await appendFile(destination, await readFile(this.chunkPath(chunkId)));
    }
    const { size } = await stat(destination);
    const mediaType = mediaTypeFor(input.mimeType);
    file.collection = input.collection;
    file.details = {
      name: input.name,
      size,
      mimeType: input.mimeType,
      mediaType,
      processingStatus: 'succeeded',
      artifacts: artifactsFor(file.id, mediaType),
      representations: representationsFor(mediaType),
      createdAt: file.createdAt,
    };
    this.uploads.delete(input.uploadId);
    await Promise.all(
      upload.chunks.map((chunkId) =>
        rm(this.chunkPath(chunkId), { force: true }),
      ),
    );
    await this.persist();
    return file;
  }

  async createBinary(input: {
    readonly buffer: Buffer;
    readonly collection: string;
    readonly name: string;
    readonly mimeType: string;
    readonly occurrenceKey?: string;
  }): Promise<MediaFileRecord> {
    const file = await this.createPlaceholder({
      collection: input.collection,
      occurrenceKey: input.occurrenceKey,
    });
    await writeFile(this.binaryPath(file.id), input.buffer);
    const mediaType = mediaTypeFor(input.mimeType);
    file.details = {
      name: input.name,
      size: input.buffer.length,
      mimeType: input.mimeType,
      mediaType,
      processingStatus: 'succeeded',
      artifacts: artifactsFor(file.id, mediaType),
      representations: representationsFor(mediaType),
      createdAt: file.createdAt,
    };
    await this.persist();
    return file;
  }

  openBinary(
    id: string,
    options?: { readonly start?: number; readonly end?: number },
  ): ReadStream {
    return createReadStream(this.binaryPath(id), options);
  }

  binaryStat(id: string): Promise<Stats> {
    return stat(this.binaryPath(id));
  }

  async deleteFile(id: string): Promise<boolean> {
    if (this.database.files[id] === undefined) return false;
    delete this.database.files[id];
    await Promise.all([
      rm(this.binaryPath(id), { force: true }),
      this.persist(),
    ]);
    return true;
  }
}
