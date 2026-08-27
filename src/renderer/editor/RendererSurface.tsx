import type { DocNode } from '@atlaskit/adf-schema';
import { ReactRenderer } from '@atlaskit/renderer';

import type { AdfDocument } from '../../shared/ipc/adf';
import { mathExtensionHandlers } from '../atlassian-editor/math';
import { mermaidExtensionHandlers } from '../atlassian-editor/mermaid';
import { rendererDataProvidersForNote } from './editor-providers';

export function RendererSurface({
  noteId,
  document,
}: {
  readonly noteId: string;
  readonly document: AdfDocument;
}) {
  return (
    <ReactRenderer
      adfStage="stage0"
      allowAltTextOnImages
      allowColumnSorting
      allowCopyToClipboard
      allowWrapCodeBlock
      appearance="full-width"
      dataProviders={rendererDataProvidersForNote(noteId)}
      document={document as unknown as DocNode}
      extensionHandlers={{
        ...mathExtensionHandlers,
        ...mermaidExtensionHandlers,
      }}
      media={{
        allowCaptions: true,
        allowLinking: false,
        enableDownloadButton: true,
      }}
      shouldOpenMediaViewer
    />
  );
}
