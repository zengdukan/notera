import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('Electron Main Media assembly', () => {
  it('starts the encrypted Media Adapter before the renderer window and excludes demo media', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/main/main.ts'),
      'utf8',
    );

    expect(source).toContain('startElectronMediaAdapter');
    expect(source.indexOf('await startElectronMediaAdapter')).toBeLessThan(
      source.indexOf('mainWindow = createSecureWindow'),
    );
    expect(source).toContain('createMediaApiArgument');
    expect(source).toContain('mediaAdapter?.close()');
    expect(source).not.toMatch(
      /demo-media|local-media-service|atlaskit-editor-example/u,
    );
  });
});
