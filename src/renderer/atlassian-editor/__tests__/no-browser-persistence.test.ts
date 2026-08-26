import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

function findTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) return findTypeScriptFiles(candidate);
    return /\.tsx?$/u.test(entry.name) ? [candidate] : [];
  });
}

describe('editor browser persistence boundary', () => {
  it('does not use the browser local-storage API', () => {
    const forbiddenApi = ['local', 'Storage'].join('');
    const root = path.join(
      process.cwd(),
      'src',
      'renderer',
      'atlassian-editor',
    );
    const offenders = findTypeScriptFiles(root).filter((candidate) =>
      readFileSync(candidate, 'utf8').includes(forbiddenApi),
    );

    expect(offenders).toEqual([]);
  });
});
