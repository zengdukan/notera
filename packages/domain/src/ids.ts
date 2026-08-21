import { assertDomain } from './errors';

declare const idBrand: unique symbol;

type DomainId<Name extends string> = string & {
  readonly [idBrand]: Name;
};

export type VaultId = DomainId<'VaultId'>;
export type LocalProfileId = DomainId<'LocalProfileId'>;
export type FolderId = DomainId<'FolderId'>;
export type NoteId = DomainId<'NoteId'>;
export type TagId = DomainId<'TagId'>;
export type NoteVersionId = DomainId<'NoteVersionId'>;
export type AttachmentId = DomainId<'AttachmentId'>;
export type BlobId = DomainId<'BlobId'>;
export type TrashEntryId = DomainId<'TrashEntryId'>;

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function asDomainId<Name extends string>(value: unknown): DomainId<Name> {
  assertDomain(
    typeof value === 'string' && CANONICAL_UUID.test(value),
    'INVALID_ID',
  );
  return value as DomainId<Name>;
}

export const asVaultId = (value: unknown): VaultId =>
  asDomainId<'VaultId'>(value);
export const asLocalProfileId = (value: unknown): LocalProfileId =>
  asDomainId<'LocalProfileId'>(value);
export const asFolderId = (value: unknown): FolderId =>
  asDomainId<'FolderId'>(value);
export const asNoteId = (value: unknown): NoteId => asDomainId<'NoteId'>(value);
export const asTagId = (value: unknown): TagId => asDomainId<'TagId'>(value);
export const asNoteVersionId = (value: unknown): NoteVersionId =>
  asDomainId<'NoteVersionId'>(value);
export const asAttachmentId = (value: unknown): AttachmentId =>
  asDomainId<'AttachmentId'>(value);
export const asBlobId = (value: unknown): BlobId => asDomainId<'BlobId'>(value);
export const asTrashEntryId = (value: unknown): TrashEntryId =>
  asDomainId<'TrashEntryId'>(value);
