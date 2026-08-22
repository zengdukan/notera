import {
  addNoteTag,
  asTagId,
  asTagName,
  createTag as createDomainTag,
  type Timestamp,
} from '@notera/domain';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import { ApplicationError } from '../errors';
import type { Page, PageRequest } from '../types';
import { tagSummary } from './mapping';
import { getActiveNoteEntity } from './notes';
import type { TagSummary } from './types';

function tagName(value: unknown) {
  if (typeof value !== 'string' || [...value.trim()].length > 100) {
    throw new ApplicationError('INVALID_NAME');
  }
  return asTagName(value);
}

export function listTags(
  database: VaultDatabase,
  input: PageRequest,
): Page<TagSummary> {
  const page = database.tags.list({
    cursor: input?.cursor,
    limit: input?.limit,
  });
  return Object.freeze({
    items: Object.freeze(page.items.map(tagSummary)),
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
  });
}

export function createTag(
  database: VaultDatabase,
  value: unknown,
  id: string,
  now: Timestamp,
): TagSummary {
  const root = database.folders.listAll().find(({ kind }) => kind === 'ROOT');
  if (root === undefined) throw new ApplicationError('OPERATION_FAILED');
  const tag = createDomainTag({
    id: asTagId(id),
    vaultId: root.vaultId,
    name: tagName(value),
    createdAt: now,
    updatedAt: now,
  });
  database.transaction((transaction) => transaction.tags.insert(tag));
  return tagSummary(tag);
}

export function renameTag(
  database: VaultDatabase,
  input: { readonly tagId: unknown; readonly name: unknown },
  now: Timestamp,
): TagSummary {
  const tagId = asTagId(input?.tagId);
  const name = tagName(input?.name);
  const renamed = database.transaction((transaction) => {
    const current = transaction.tags.get(tagId);
    if (current === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
    const next = createDomainTag({ ...current, name, updatedAt: now });
    transaction.tags.replace(next);
    return next;
  });
  return tagSummary(renamed);
}

export function deleteTag(database: VaultDatabase, value: unknown): void {
  const tagId = asTagId(value);
  database.transaction((transaction) => {
    if (transaction.tags.get(tagId) === undefined) {
      throw new ApplicationError('ENTITY_NOT_FOUND');
    }
    transaction.tags.delete(tagId);
  });
}

export function addTagToNote(
  database: VaultDatabase,
  input: { readonly noteId: unknown; readonly tagId: unknown },
): void {
  const tagId = asTagId(input?.tagId);
  database.transaction((transaction) => {
    const note = getActiveNoteEntity(database, input?.noteId);
    const tag = transaction.tags.get(tagId);
    if (tag === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
    const [relation] = addNoteTag(note, tag, []);
    if (relation === undefined) throw new ApplicationError('OPERATION_FAILED');
    transaction.tags.addToNote(relation);
  });
}

export function removeTagFromNote(
  database: VaultDatabase,
  input: { readonly noteId: unknown; readonly tagId: unknown },
): void {
  const tagId = asTagId(input?.tagId);
  database.transaction((transaction) => {
    const note = getActiveNoteEntity(database, input?.noteId);
    if (transaction.tags.get(tagId) === undefined) {
      throw new ApplicationError('ENTITY_NOT_FOUND');
    }
    transaction.tags.removeFromNote(note.id, tagId);
  });
}
