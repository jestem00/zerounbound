/*---------------------------------------------------------------
Developed by @jams2blues – ZeroContract Studio
File:    jest.setup.js
Rev :    r3   2025-09-18
Summary: Synchronous util polyfills for TextEncoder/TextDecoder and URL.createObjectURL in jsdom.
---------------------------------------------------------------*/
import { TextEncoder as UtilTextEncoder, TextDecoder as UtilTextDecoder } from 'node:util';

if (typeof globalThis.TextEncoder === 'undefined' && typeof UtilTextEncoder === 'function') {
  globalThis.TextEncoder = UtilTextEncoder;
}

if (typeof globalThis.TextDecoder === 'undefined' && typeof UtilTextDecoder === 'function') {
  globalThis.TextDecoder = UtilTextDecoder;
}

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:jest-mock';
}

if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {};
}


