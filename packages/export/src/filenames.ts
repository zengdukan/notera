export function sanitizeWindowsBaseName(
  value: string,
  fallback: string,
  maxUtf16Length = 180,
): string {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_')
    .replace(/^[. ]+/u, '')
    .replace(/[. ]+$/u, '');
  const candidate = cleaned.length === 0 ? fallback : cleaned;
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(
    candidate,
  )
    ? `_${candidate}`
    : candidate;
  return truncateUtf16(reserved, maxUtf16Length) || truncateUtf16(fallback, maxUtf16Length);
}

export function allocateUniqueName(
  requested: string,
  usedCaseFolded: ReadonlySet<string>,
  maxUtf16Length = 180,
): string {
  const dot = requested.lastIndexOf('.');
  const hasExtension = dot > 0 && dot < requested.length - 1;
  const extension = hasExtension ? requested.slice(dot) : '';
  const base = hasExtension ? requested.slice(0, dot) : requested;
  const fits = (suffix: string) =>
    `${truncateUtf16(base, Math.max(1, maxUtf16Length - extension.length - suffix.length))}${suffix}${extension}`;
  let candidate = fits('');
  if (!usedCaseFolded.has(fold(candidate))) return candidate;
  for (let index = 2; index < Number.MAX_SAFE_INTEGER; index += 1) {
    candidate = fits(` (${index})`);
    if (!usedCaseFolded.has(fold(candidate))) return candidate;
  }
  throw new Error('Unable to allocate a unique export name.');
}

function fold(value: string): string {
  return value.toLocaleLowerCase('en-US');
}

function truncateUtf16(value: string, maximum: number): string {
  if (!Number.isSafeInteger(maximum) || maximum < 1) return '';
  let result = value.slice(0, maximum);
  const final = result.charCodeAt(result.length - 1);
  if (final >= 0xd800 && final <= 0xdbff) result = result.slice(0, -1);
  return result;
}
