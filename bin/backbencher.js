#!/usr/bin/env node

/**
 * Backbencher CLI Entry Point
 * Cross-platform Node.js CLI benchmarking tool for AI coding assistants
 */

const path = require('path');
const { fileURLToPath } = require('url');

// Add the src directory to the module path
const srcPath = path.join(__dirname, '..', 'src');
require('module').globalPaths.unshift(srcPath);

// Import and run the main CLI
const { main } = require('../src/index.js');

// Handle uncaught exceptions gracefully
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main CLI function
main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
