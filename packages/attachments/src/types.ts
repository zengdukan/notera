export interface AttachmentManifestChunk {
  readonly index: number;
  readonly plaintextOffset: number;
  readonly ciphertextOffset: number;
  readonly plaintextLength: number;
  readonly ciphertextLength: number;
  readonly ciphertextSha256: Uint8Array;
}

export interface AttachmentManifestV1 {
  readonly version: 1;
  readonly chunkSize: number;
  readonly noncePrefix: Uint8Array;
  readonly plaintextLength: number;
  readonly ciphertextLength: number;
  readonly chunks: readonly AttachmentManifestChunk[];
}
