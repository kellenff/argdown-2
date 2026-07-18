#!/usr/bin/env node
import { run } from './server.js';

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
