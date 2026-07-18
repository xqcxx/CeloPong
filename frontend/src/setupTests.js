// jest-dom adds custom matchers (e.g. toBeInTheDocument)
import '@testing-library/jest-dom';

// jsdom does not provide TextEncoder/TextDecoder, which viem requires.
// Polyfill from Node's util so wallet/eth helpers can be unit tested.
import { TextEncoder, TextDecoder } from 'util';

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}
