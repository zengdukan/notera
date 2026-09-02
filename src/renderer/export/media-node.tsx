import type { CSSProperties, PropsWithChildren } from 'react';

import type { ExportRenderDocument } from '../../shared';

interface ExportMediaNodeProps {
  readonly alt?: unknown;
  readonly height?: unknown;
  readonly id?: unknown;
  readonly type?: unknown;
  readonly width?: unknown;
}

function dimension(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

export function createExportMediaNodeComponents(
  payload: Pick<ExportRenderDocument, 'attachments' | 'mediaBaseUrl'>,
) {
  const attachments = new Map(
    payload.attachments.map((attachment) => [attachment.id, attachment]),
  );

  const render = (
    props: PropsWithChildren<ExportMediaNodeProps>,
    inline: boolean,
  ) => {
    const id = typeof props.id === 'string' ? props.id : '';
    const attachment = attachments.get(id);
    const label =
      typeof props.alt === 'string' && props.alt.length > 0
        ? props.alt
        : attachment?.fileName || 'Attachment';
    if (
      props.type !== 'file' ||
      attachment === undefined ||
      !attachment.mimeType.startsWith('image/')
    ) {
      return (
        <span data-export-lossy="true" data-export-media-id={id}>
          {label}
        </span>
      );
    }
    const style: CSSProperties | undefined = inline
      ? {
          height: dimension(props.height),
          maxWidth: '100%',
          width: dimension(props.width),
        }
      : undefined;
    return (
      <img
        alt={label}
        className={
          inline ? 'notera-export-media-inline' : 'notera-export-media'
        }
        data-export-media-id={id}
        decoding="sync"
        draggable={false}
        loading="eager"
        src={`${payload.mediaBaseUrl}/file/${encodeURIComponent(id)}/image`}
        style={style}
      />
    );
  };

  function ExportMediaNode(props: PropsWithChildren<ExportMediaNodeProps>) {
    return render(props, false);
  }

  function ExportMediaInlineNode(
    props: PropsWithChildren<ExportMediaNodeProps>,
  ) {
    return render(props, true);
  }

  return Object.freeze({
    media: ExportMediaNode,
    mediaInline: ExportMediaInlineNode,
  });
}
