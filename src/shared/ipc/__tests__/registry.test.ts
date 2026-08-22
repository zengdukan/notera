import { eventContracts, requestContracts } from '../registry';

describe('IPC contract registry', () => {
  it('registers exactly 56 requests and 3 events', () => {
    expect(Object.keys(requestContracts)).toHaveLength(56);
    expect(Object.keys(eventContracts)).toHaveLength(3);
  });

  it('keeps keys and channels unique and consistently named', () => {
    const requests = Object.entries(requestContracts);
    const events = Object.entries(eventContracts);
    const channels = [
      ...requests.map(([, contract]) => contract.channel),
      ...events.map(([, contract]) => contract.channel),
    ];

    expect(new Set(channels).size).toBe(channels.length);
    [...requests, ...events].forEach(([key, contract]) => {
      expect(contract.key).toBe(key);
      expect(contract.channel).toMatch(/^notera:[a-z0-9-]+:[a-z0-9-]+$/);
    });
  });

  it('does not register deferred synchronization capabilities', () => {
    const publicNames = JSON.stringify({
      requestKeys: Object.keys(requestContracts),
      requestChannels: Object.values(requestContracts).map(
        (contract) => contract.channel,
      ),
      eventKeys: Object.keys(eventContracts),
      eventChannels: Object.values(eventContracts).map(
        (contract) => contract.channel,
      ),
    }).toLowerCase();

    expect(publicNames).not.toMatch(/sync|outbox|conflict|remote-state/);
  });

  it('keeps list and content replacement request requirements explicit', () => {
    expect(
      requestContracts['profile.list'].request.safeParse({ limit: 10 }).success,
    ).toBe(true);
    expect(
      requestContracts['contentTree.listChildren'].request.safeParse({
        parentFolderId: '10000000-0000-4000-8000-000000000001',
        limit: 10,
      }).success,
    ).toBe(true);
    expect(
      requestContracts['note.saveDraft'].request.safeParse({
        noteId: '10000000-0000-4000-8000-000000000001',
        title: '',
        document: { type: 'doc', version: 1 },
      }).success,
    ).toBe(false);
    expect(
      requestContracts['history.restore'].request.safeParse({
        noteId: '10000000-0000-4000-8000-000000000001',
        versionId: '10000000-0000-4000-8000-000000000002',
      }).success,
    ).toBe(false);
    expect(requestContracts['history.rename'].channel).toBe(
      'notera:history:rename',
    );
  });
});
