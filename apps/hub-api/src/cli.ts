#!/usr/bin/env node
import { listenHub } from "./server.js";

listenHub().catch((err) => {
  console.error(err);
  process.exit(1);
});
