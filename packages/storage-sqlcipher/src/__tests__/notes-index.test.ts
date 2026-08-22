import type {
  AdfDocument,
  ContentVersion,
  Folder,
  FolderId,
  Note,
  NoteId,
  VaultIdentity,
} from '@notera/domain';
import {
  asAdfDocument,
  asContentVersion,
  asFolderId,
  asFolderName,
  asNoteId,
  asSortOrder,
  asTimestamp,
  createNote,
  createRegularFolder,
  updateNoteContent,
} from '@notera/domain';

import type { StorageError } from '../errors';
import {
  cleanupTempDatabases,
  databaseKey,
  openTestConnection,
  tempDatabasePath,
  TEST_IDENTITY,
  TEST_ROOT_FOLDER_ID,
  TEST_VAULT_ID,
  vaultMetaDigest,
} from './helpers';

interface NoteReaderApi {
  get(id: NoteId): Note | undefined;
  listByFolder(folderId: FolderId, page: PageRequest): Page<Note>;
  listRecent(page: PageRequest): Page<Note>;
}

interface NoteWriterApi extends NoteReaderApi {
  insert(note: Note): void;
  replaceContent(note: Note, expected: ContentVersion): void;
  replaceLocation(note: Note): void;
  replaceSortOrders(notes: readonly Note[]): void;
}

interface PageRequest {
  readonly cursor?: string;
  readonly limit: number;
}

interface Page<Value> {
  readonly items: readonly Value[];
  readonly nextCursor?: string;
}

interface VaultDatabaseApi {
  readonly notes: NoteReaderApi;
  readonly folders: {
    get(id: FolderId): Folder | undefined;
    listContent(folderId: FolderId, page: PageRequest): Page<Folder | Note>;
  };
  transaction<Result>(
    callback: (transaction: {
      readonly notes: NoteWriterApi;
      readonly folders: { insert(folder: Folder): void };
    }) => Result,
  ): Result;
  close(): void;
}

interface DatabaseModule {
  createVaultDatabase(options: {
    filePath: string;
    databaseKey: Uint8Array;
    identity: VaultIdentity;
    profileName: string;
    vaultMetaDigest: Uint8Array;
  }): VaultDatabaseApi;
  openVaultDatabase(options: {
    filePath: string;
    databaseKey: Uint8Array;
    expectedVaultId: typeof TEST_VAULT_ID;
    expectedVaultMetaDigest: Uint8Array;
  }): VaultDatabaseApi;
}

interface AdfJsonModule {
  serializeAdf(document: AdfDocument): string;
  parseAdf(json: string): AdfDocument;
}

interface SearchTextModule {
  extractAdfText(document: AdfDocument): string;
}

interface NormalizeModule {
  normalizeSearchText(source: string): {
    readonly text: string;
    readonly sourceRanges: readonly Readonly<{ start: number; end: number }>[];
  };
}

function databaseModule(): DatabaseModule {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../database') as DatabaseModule;
}

function adfJsonModule(): AdfJsonModule {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../serialization/adf-json') as AdfJsonModule;
}

function searchTextModule(): SearchTextModule {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../search/adf-text') as SearchTextModule;
}

function normalizeModule(): NormalizeModule {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../search/normalize') as NormalizeModule;
}

const openDatabases: VaultDatabaseApi[] = [];

function createVault(): { database: VaultDatabaseApi; filePath: string } {
  const filePath = tempDatabasePath();
  const database = databaseModule().createVaultDatabase({
    filePath,
    databaseKey: databaseKey(),
    identity: TEST_IDENTITY,
    profileName: 'Profile',
    vaultMetaDigest: vaultMetaDigest(),
  });
  openDatabases.push(database);
  return { database, filePath };
}

function reopen(filePath: string): VaultDatabaseApi {
  const database = databaseModule().openVaultDatabase({
    filePath,
    databaseKey: databaseKey(),
    expectedVaultId: TEST_VAULT_ID,
    expectedVaultMetaDigest: vaultMetaDigest(),
  });
  openDatabases.push(database);
  return database;
}

function noteId(index: number): NoteId {
  return asNoteId(
    `10000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
  );
}

function note(
  index: number,
  folderId = TEST_ROOT_FOLDER_ID,
  document = asAdfDocument({
    type: 'doc',
    version: 1,
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: `Body ${index}` }] },
    ],
  }),
): Note {
  return createNote({
    id: noteId(index),
    vaultId: TEST_VAULT_ID,
    folderId,
    title: `Title ${index}`,
    document,
    sortOrder: asSortOrder(index),
    createdAt: asTimestamp(index),
    updatedAt: asTimestamp(index),
  });
}

function expectStorageCode(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect((error as StorageError).code).toBe(code);
  }
}

afterEach(() => {
  openDatabases.splice(0).forEach((database) => database.close());
  cleanupTempDatabases();
});

describe('notes, ADF serialization, and search indexing', () => {
  it('serializes, parses, and extracts ADF beyond all former fixed limits', () => {
    let nested: Record<string, unknown> = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Deep visible text' }],
    };
    for (let depth = 0; depth < 256; depth += 1) {
      nested = { type: 'blockquote', content: [nested] };
    }
    const deepRoot: Record<string, unknown> = {
      type: 'doc',
      version: 1,
      content: [nested],
    };
    deepRoot.large = 'x'.repeat(8 * 1024 * 1024 + 1);
    deepRoot.values = Array.from({ length: 100_001 }, (_, index) => index);
    const document = asAdfDocument(deepRoot);

    const serialized = adfJsonModule().serializeAdf(document);
    expect(serialized.length).toBeGreaterThan(8 * 1024 * 1024);
    const parsed = adfJsonModule().parseAdf(serialized);
    expect((parsed.large as string).length).toBe(8 * 1024 * 1024 + 1);
    expect(parsed.values as readonly unknown[]).toHaveLength(100_001);
    expect(searchTextModule().extractAdfText(parsed)).toContain(
      'Deep visible text',
    );
  });

  it('extracts only visible ADF text with stable block separators', () => {
    const document = asAdfDocument({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          attrs: { url: 'https://secret.example', attachmentId: 'hidden-blob' },
          content: [
            { type: 'text', text: 'Visible' },
            { type: 'hardBreak' },
            { type: 'text', text: 'Line' },
          ],
        },
        { type: 'heading', content: [{ type: 'text', text: 'Next' }] },
      ],
      hiddenMetadata: 'do not index',
    });
    const text = searchTextModule().extractAdfText(document);
    expect(text).toBe('Visible\nLine\nNext');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('attachment');
    expect(text).not.toContain('hiddenMetadata');
  });

  it('normalizes Unicode with source code-point ranges', () => {
    expect(normalizeModule().normalizeSearchText('Ｗeｉß').text).toBe('weiss');
    expect(normalizeModule().normalizeSearchText('中文').text).toBe('中文');

    const folded = normalizeModule().normalizeSearchText('Weiß');
    expect(folded.text).toBe('weiss');
    expect(folded.sourceRanges).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 },
      { start: 3, end: 4 },
      { start: 3, end: 4 },
    ]);
    expect(normalizeModule().normalizeSearchText('e\u0301🙂')).toEqual({
      text: 'é🙂',
      sourceRanges: [
        { start: 0, end: 2 },
        { start: 2, end: 3 },
      ],
    });
    expect(normalizeModule().normalizeSearchText('Ꭰ').text).toBe('Ꭰ');
  });

  it('keeps Note rows and FTS rows atomic with optimistic content versions', () => {
    const { database, filePath } = createVault();
    const original = note(1);
    database.transaction((transaction) => transaction.notes.insert(original));
    expect(database.notes.get(original.id)).toEqual(original);

    const raw = openTestConnection(filePath);
    expect(
      raw
        .prepare(
          `SELECT note_id, source_content_version, normalized_title, normalized_body
           FROM notes_fts`,
        )
        .get(),
    ).toEqual({
      note_id: original.id,
      source_content_version: 1,
      normalized_title: 'title 1',
      normalized_body: 'body 1',
    });
    raw.close();

    const updated = updateNoteContent(original, {
      title: 'Weiß Updated',
      document: asAdfDocument({
        type: 'doc',
        version: 1,
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '新正文' }] },
        ],
      }),
      updatedAt: asTimestamp(10),
    });
    database.transaction((transaction) =>
      transaction.notes.replaceContent(updated, asContentVersion(1)),
    );
    expect(database.notes.get(original.id)).toEqual(updated);
    expectStorageCode(
      () =>
        database.transaction((transaction) =>
          transaction.notes.replaceContent(updated, asContentVersion(1)),
        ),
      'CONTENT_VERSION_CONFLICT',
    );
    expectStorageCode(
      () =>
        database.transaction((transaction) =>
          transaction.notes.replaceContent(note(99), asContentVersion(1)),
        ),
      'ENTITY_NOT_FOUND',
    );

    database.close();
    const sabotage = openTestConnection(filePath);
    sabotage.exec('DROP TABLE notes_fts');
    sabotage.close();
    const reopened = reopen(filePath);
    const beforeFailure = reopened.notes.get(original.id) as Note;
    const failedUpdate = updateNoteContent(beforeFailure, {
      title: 'Must Roll Back',
      document: beforeFailure.document,
      updatedAt: asTimestamp(20),
    });
    expectStorageCode(
      () =>
        reopened.transaction((transaction) =>
          transaction.notes.replaceContent(
            failedUpdate,
            beforeFailure.contentVersion,
          ),
        ),
      'STORAGE_OPERATION_FAILED',
    );
    expect(reopened.notes.get(original.id)).toEqual(beforeFailure);
  });

  it('moves and sorts without changing FTS versions and paginates mixed content', () => {
    const { database, filePath } = createVault();
    const child = createRegularFolder({
      id: asFolderId('20000000-0000-4000-8000-000000000001'),
      vaultId: TEST_VAULT_ID,
      parentId: TEST_ROOT_FOLDER_ID,
      name: asFolderName('Child'),
      sortOrder: asSortOrder(1),
      createdAt: asTimestamp(1),
      updatedAt: asTimestamp(1),
    });
    const first = note(1);
    const second = note(2);
    database.transaction((transaction) => {
      transaction.folders.insert(child);
      transaction.notes.insert(first);
      transaction.notes.insert(second);
    });
    const page = database.folders.listContent(TEST_ROOT_FOLDER_ID, {
      limit: 2,
    });
    expect(page.items.map(({ id }) => id)).toEqual([child.id, first.id]);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(
      database.folders
        .listContent(TEST_ROOT_FOLDER_ID, {
          cursor: page.nextCursor,
          limit: 2,
        })
        .items.map(({ id }) => id),
    ).toEqual([second.id]);

    database.transaction((transaction) => {
      transaction.notes.replaceLocation({
        ...first,
        folderId: child.id,
        sortOrder: asSortOrder(5),
        updatedAt: asTimestamp(5),
      });
      transaction.notes.replaceSortOrders([
        { ...second, sortOrder: asSortOrder(10), updatedAt: asTimestamp(10) },
      ]);
    });
    expect(database.notes.get(first.id)?.contentVersion).toBe(1);

    database.close();
    const raw = openTestConnection(filePath);
    expect(
      raw
        .prepare<{
          source_content_version: number;
        }>('SELECT source_content_version FROM notes_fts ORDER BY note_id')
        .all(),
    ).toEqual([{ source_content_version: 1 }, { source_content_version: 1 }]);
    raw.close();
  });
});
