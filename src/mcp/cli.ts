#!/usr/bin/env node
import process from "node:process";
import { run } from "./server.js";

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
