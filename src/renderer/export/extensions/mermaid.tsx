import { useEffect, useId, useState } from 'react';
import type {
  ExtensionHandler,
  ExtensionParams,
} from '@atlaskit/editor-common/extensions';

import type { ExportReadiness } from '../readiness';

export const MERMAID_EXTENSION_TYPE = 'com.atlassian.editor.mermaid';

type MermaidResult =
  | { status: 'loading' }
  | { status: 'success'; svg: string }
  | { status: 'error'; message: string };

let mermaidPromise: Promise<typeof import('mermaid')['default']> | undefined;

async function renderMermaid(
  id: string,
  source: string,
): Promise<Exclude<MermaidResult, { status: 'loading' }>> {
  if (!source.trim()) {
    return { status: 'error', message: 'Mermaid 内容为空' };
  }
  try {
    mermaidPromise ??= import('mermaid').then((module) => {
      module.default.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
      });
      return module.default;
    });
    const mermaid = await mermaidPromise;
    const valid = await mermaid.parse(source, { suppressErrors: true });
    if (!valid) return { status: 'error', message: 'Mermaid 语法无效' };
    const { svg } = await mermaid.render(id, source);
    return { status: 'success', svg };
  } catch {
    return { status: 'error', message: 'Mermaid 渲染失败' };
  }
}

function sourceOf(parameters: unknown): string {
  if (typeof parameters !== 'object' || parameters === null) return '';
  const source = (parameters as { source?: unknown }).source;
  return typeof source === 'string' ? source : '';
}

function MermaidDiagram(props: {
  readonly source: string;
  readonly readiness: ExportReadiness;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/gu, '-');
  const [result, setResult] = useState<MermaidResult>({ status: 'loading' });

  useEffect(() => {
    const settle = props.readiness.registerMermaid();
    let active = true;
    void renderMermaid(`notera-export-mermaid-${id}`, props.source).then(
      (value) => {
        if (active) setResult(value);
        settle();
      },
    );
    return () => {
      active = false;
      settle();
    };
  }, [id, props.readiness, props.source]);

  if (result.status === 'loading') {
    return <div role="status">正在渲染 Mermaid…</div>;
  }
  if (result.status === 'error') {
    return (
      <div aria-label="无效 Mermaid 图表" role="group">
        <div>{result.message}</div>
        <pre data-export-lossy="true">{props.source || 'Mermaid 内容为空'}</pre>
      </div>
    );
  }
  return (
    <div
      aria-label="Mermaid 图表"
      dangerouslySetInnerHTML={{ __html: result.svg }}
      role="img"
    />
  );
}

export function createMermaidExtensionHandler(
  readiness: ExportReadiness,
): ExtensionHandler {
  return (extension: ExtensionParams<any>) => {
    const source = sourceOf(extension.parameters);
    if (extension.extensionKey !== 'mermaid:block') {
      return <pre data-export-lossy="true">{source || '不支持的 Mermaid 扩展'}</pre>;
    }
    return <MermaidDiagram readiness={readiness} source={source} />;
  };
}
