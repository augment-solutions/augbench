#!/usr/bin/env node
import 'dotenv/config';
import { BenchmarkCLI } from "../src/cli/BenchmarkCLI.js";

// Entry point
const cli = new BenchmarkCLI();
cli.run(process.argv.slice(2)).catch(err => {
  console.error("Fatal error:", err?.stack || err);
  process.exit(1);
});

