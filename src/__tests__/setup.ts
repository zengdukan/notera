import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'node:util';

Object.assign(global, { TextDecoder, TextEncoder });
