import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('renderer document template', () => {
  it('uses the device viewport so responsive layouts match the window width', () => {
    const template = readFileSync(join(__dirname, '..', 'index.ejs'), 'utf8');

    expect(template).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    );
  });
});
