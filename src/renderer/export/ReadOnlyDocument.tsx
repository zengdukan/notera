import { useEffect, useMemo } from 'react';
import type { DocNode } from '@atlaskit/adf-schema';
import type {
  ExtensionHandler,
  ExtensionHandlers,
  ExtensionParams,
} from '@atlaskit/editor-common/extensions';
import { ProviderFactory } from '@atlaskit/editor-common/provider-factory';
import { ReactRenderer } from '@atlaskit/renderer';
import { IntlProvider } from 'react-intl';

import type { ExportRenderDocument } from '../../shared';
import { messagesFor, resolveLocale } from '../app/i18n';
import { MATH_EXTENSION_TYPE, renderMathExtension } from './extensions/math';
import {
  createMermaidExtensionHandler,
  MERMAID_EXTENSION_TYPE,
} from './extensions/mermaid';
import { createExportMediaProvider } from './media-provider';
import { createExportMediaNodeComponents } from './media-node';
import type { ExportReadiness } from './readiness';

function sourceOf(parameters: unknown): string {
  if (typeof parameters !== 'object' || parameters === null) return '';
  const value = parameters as { latex?: unknown; source?: unknown };
  if (typeof value.source === 'string') return value.source;
  if (typeof value.latex === 'string') return value.latex;
  try {
    return JSON.stringify(parameters);
  } catch {
    return '';
  }
}

const unsupportedExtension: ExtensionHandler = (
  extension: ExtensionParams<any>,
) => (
  <div aria-label="不支持的扩展" role="group">
    <strong>
      不支持的扩展：{extension.extensionType}/{extension.extensionKey}
    </strong>
    <pre data-export-lossy="true">
      {sourceOf(extension.parameters) || '无可显示的原始内容'}
    </pre>
  </div>
);

function extensionTypes(document: unknown): ReadonlySet<string> {
  const types = new Set<string>();
  const stack: unknown[] = [document];
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value !== 'object' || value === null) continue;
    const record = value as Record<string, unknown>;
    const { attrs } = record;
    if (
      (record.type === 'extension' ||
        record.type === 'inlineExtension' ||
        record.type === 'bodiedExtension') &&
      typeof attrs === 'object' &&
      attrs !== null
    ) {
      const { extensionType } = attrs as Record<string, unknown>;
      if (typeof extensionType === 'string') types.add(extensionType);
    }
    Object.values(record).forEach((child) => {
      if (Array.isArray(child)) stack.push(...child);
      else if (typeof child === 'object' && child !== null) stack.push(child);
    });
  }
  return types;
}

export function createExportExtensionHandlers(
  document: unknown,
  readiness: ExportReadiness,
): ExtensionHandlers {
  const handlers: ExtensionHandlers = {
    [MATH_EXTENSION_TYPE]: renderMathExtension,
    [MERMAID_EXTENSION_TYPE]: createMermaidExtensionHandler(readiness),
  };
  extensionTypes(document).forEach((extensionType) => {
    handlers[extensionType] ??= unsupportedExtension;
  });
  return handlers;
}

export function ReadOnlyDocument(props: {
  readonly payload: ExportRenderDocument;
  readonly readiness: ExportReadiness;
  readonly onRendered?: () => void;
}) {
  const locale = resolveLocale(navigator.language);
  const mediaProvider = useMemo(
    () => createExportMediaProvider(props.payload),
    [props.payload],
  );
  const providers = useMemo(
    () => ProviderFactory.create({ mediaProvider }),
    [mediaProvider],
  );
  const extensionHandlers = useMemo(
    () =>
      createExportExtensionHandlers(props.payload.document, props.readiness),
    [props.payload.document, props.readiness],
  );
  const nodeComponents = useMemo(
    () => createExportMediaNodeComponents(props.payload),
    [props.payload],
  );
  useEffect(() => () => providers.destroy(), [providers]);

  return (
    <IntlProvider locale={locale} messages={messagesFor(locale)}>
      <article className="notera-export-document">
        <h1>{props.payload.title}</h1>
        <ReactRenderer
          adfStage="stage0"
          allowAltTextOnImages
          appearance="full-page"
          dataProviders={providers}
          disableActions
          disableTableOverflowShadow
          document={props.payload.document as unknown as DocNode}
          extensionHandlers={extensionHandlers}
          media={{
            allowCaptions: true,
            allowLinking: false,
            enableDownloadButton: false,
          }}
          nodeComponents={nodeComponents}
          onRendered={props.onRendered}
          shouldOpenMediaViewer={false}
        />
      </article>
    </IntlProvider>
  );
}
