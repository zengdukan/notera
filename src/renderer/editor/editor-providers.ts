import { ProviderFactory } from '@atlaskit/editor-common/provider-factory';

import { currentUser, getEmojiProvider } from '../atlassian-editor/emoji/get-emoji-provider';
import { mediaProvider } from '../atlassian-editor/media-provider';

export const emojiProvider = getEmojiProvider({
  currentUser,
  uploadSupported: false,
});

export const rendererDataProviders = ProviderFactory.create({
  emojiProvider,
  mediaProvider,
});
