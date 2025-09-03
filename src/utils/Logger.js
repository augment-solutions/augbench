export class Logger {
  info(msg, ...rest) {
    console.log(`[INFO ${new Date().toISOString()}]`, msg, ...rest);
  }
  debug(msg, ...rest) {
    // Only log debug messages if DEBUG environment variable is set
    if (process.env.DEBUG) {
      console.log(`[DEBUG ${new Date().toISOString()}]`, msg, ...rest);
    }
  }
  warn(msg, ...rest) {
    console.warn(`[WARN ${new Date().toISOString()}]`, msg, ...rest);
  }
  error(msg, ...rest) {
    console.error(`[ERROR ${new Date().toISOString()}]`, msg, ...rest);
  }
  success(msg, ...rest) {
    console.log(`[SUCCESS ${new Date().toISOString()}]`, msg, ...rest);
  }
}

