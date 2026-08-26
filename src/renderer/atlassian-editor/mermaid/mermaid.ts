const importMermaid = () => import('mermaid').then((module) => module.default);

type MermaidApi = Awaited<ReturnType<typeof importMermaid>>;

export type MermaidRenderResult =
  | { error: null; svg: string }
  | { error: string; svg: null };

let mermaidPromise: Promise<MermaidApi> | undefined;

const mermaidConfig = {
  startOnLoad: false,
  securityLevel: 'strict' as const,
  theme: 'base' as const,
  themeVariables: {
    background: '#FFFFFF',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    lineColor: '#44546F',
    mainBkg: '#E9F2FF',
    nodeBorder: '#0C66E4',
    primaryBorderColor: '#0C66E4',
    primaryColor: '#E9F2FF',
    primaryTextColor: '#172B4D',
    secondaryColor: '#F1F2F4',
    tertiaryColor: '#F7F8F9',
    textColor: '#172B4D',
    // Mermaid derives pie colors from primary/secondary/tertiary by default.
    // Those editor surface colors are intentionally very light, so use the
    // Atlassian categorical chart palette explicitly for data visualisation.
    pie1: '#357DE8',
    pie2: '#82B536',
    pie3: '#BF63F3',
    pie4: '#F68909',
    pie5: '#1558BC',
    pie6: '#964AC0',
    pie7: '#42B2D7',
    pie8: '#BD5B00',
    pie9: '#357DE8',
    pie10: '#82B536',
    pie11: '#BF63F3',
    pie12: '#F68909',
    pieOpacity: '1',
  },
};

async function getMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= importMermaid().then((mermaid) => {
    mermaid.initialize(mermaidConfig);
    return mermaid;
  });

  return mermaidPromise;
}

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.replace(/^Error:\s*/i, '').trim();
  return message || 'Unable to render this Mermaid diagram';
}

export async function renderMermaid(
  id: string,
  source: string,
): Promise<MermaidRenderResult> {
  if (!source.trim()) {
    return { error: 'Enter a Mermaid diagram definition', svg: null };
  }

  try {
    const mermaid = await getMermaid();
    const valid = await mermaid.parse(source, { suppressErrors: true });
    if (!valid) {
      return { error: 'Invalid Mermaid syntax', svg: null };
    }

    const { svg } = await mermaid.render(id, source);
    return { error: null, svg };
  } catch (error) {
    return { error: errorMessage(error), svg: null };
  }
}
