/**
 * Inquirer compatibility wrapper for CJS/ESM
 * Always use `prompt(questions)` from this module instead of importing inquirer directly.
 */

async function loadInquirer() {
  // Prefer dynamic import to support ESM-only inquirer@9+
  try {
    const mod = await import('inquirer');
    return mod && mod.default ? mod.default : mod;
  } catch (e) {
    // Fallback to require for environments where CJS is available
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const req = require('inquirer');
      return req && req.default ? req.default : req;
    } catch (e2) {
      // Throw the original error if dynamic import failed definitively
      throw e;
    }
  }
}

async function prompt(questions) {
  const inquirer = await loadInquirer();
  const promptFn = inquirer && typeof inquirer.prompt === 'function' ? inquirer.prompt : null;
  if (!promptFn) {
    throw new Error('Inquirer prompt is not available. Please ensure a compatible version of inquirer is installed.');
  }
  return promptFn(questions);
}

module.exports = { prompt, loadInquirer };

