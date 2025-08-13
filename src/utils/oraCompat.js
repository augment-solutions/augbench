/**
 * Ora compatibility wrapper for CJS/ESM
 * Usage:
 *   const { getOra } = require('../utils/oraCompat');
 *   const ora = await getOra();
 *   const spinner = ora('Working...').start();
 */

async function getOra() {
  try {
    const mod = await import('ora');
    return mod && mod.default ? mod.default : mod;
  } catch (e) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const req = require('ora');
      return req && req.default ? req.default : req;
    } catch (e2) {
      throw e;
    }
  }
}

module.exports = { getOra };

