import { ProviderFactory } from '@atlaskit/editor-common/provider-factory';

import {
  currentUser,
  getEmojiProvider,
} from '../atlassian-editor/emoji/get-emoji-provider';
import { mediaProviderForNote } from '../atlassian-editor/media-provider';

export const emojiProvider = getEmojiProvider({
  currentUser,
  uploadSupported: false,
});

const rendererProviders = new Map<
  string,
  ReturnType<typeof ProviderFactory.create>
>();

export function rendererDataProvidersForNote(noteId: string) {
  let providers = rendererProviders.get(noteId);
  if (providers === undefined) {
    providers = ProviderFactory.create({
      emojiProvider,
      mediaProvider: mediaProviderForNote(noteId),
    });
    rendererProviders.set(noteId, providers);
  }
  return providers;
}
