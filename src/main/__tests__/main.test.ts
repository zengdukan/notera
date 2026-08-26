import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('Electron Main Media assembly', () => {
  it('starts demo Media before creating the renderer window and closes it on shutdown', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/main/main.ts'),
      'utf8',
    );

    expect(source).toContain('startElectronDemoMedia');
    expect(source.indexOf('await startElectronDemoMedia')).toBeLessThan(
      source.indexOf('mainWindow = createSecureWindow'),
    );
    expect(source).toContain('createMediaApiArgument');
    expect(source).toContain('demoMediaServer?.close()');
  });
});
