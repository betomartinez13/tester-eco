import { config } from 'dotenv';
config();

// Set default test timeout (Jest ESM mode)
if (typeof jest !== 'undefined') {
  jest.setTimeout(30000);
}
