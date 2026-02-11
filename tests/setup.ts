import { config } from 'dotenv';
config();

// Set default test timeout (Jest ESM mode)
if (typeof jest !== 'undefined') {
  jest.setTimeout(30000);
}

// Fix BigInt serialization for Jest workers
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
