export type ExportCoreErrorCode =
  | 'ATTACHMENT_REFERENCE_MISSING'
  | 'INVALID_EXPORT_INPUT';

export class ExportCoreError extends Error {
  readonly code: ExportCoreErrorCode;

  constructor(code: ExportCoreErrorCode) {
    super(code);
    this.name = 'ExportCoreError';
    this.code = code;
  }
}
