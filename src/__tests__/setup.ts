import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'node:util';

Object.assign(global, { TextDecoder, TextEncoder });

if (typeof HTMLDialogElement !== 'undefined') {
  const escapeHandlers = new WeakMap<
    HTMLDialogElement,
    (event: KeyboardEvent) => void
  >();
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
    const toggle = new Event('toggle');
    Object.assign(toggle, { oldState: 'closed', newState: 'open' });
    this.dispatchEvent(toggle);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const shouldClose = this.dispatchEvent(
        new Event('cancel', { cancelable: true }),
      );
      if (shouldClose) this.close();
    };
    escapeHandlers.set(this, handleEscape);
    document.addEventListener('keydown', handleEscape);
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
    const toggle = new Event('toggle');
    Object.assign(toggle, { oldState: 'open', newState: 'closed' });
    this.dispatchEvent(toggle);
    const handleEscape = escapeHandlers.get(this);
    if (handleEscape !== undefined) {
      document.removeEventListener('keydown', handleEscape);
      escapeHandlers.delete(this);
    }
  };
}
