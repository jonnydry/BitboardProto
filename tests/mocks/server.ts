/**
 * MSW Server for Node.js (used in Vitest tests)
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
