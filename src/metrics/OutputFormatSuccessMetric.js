/**
 * Output Format Success Metric - Checks if assistant output matches a configured pattern or JSON schema
 */

const { MeasurableMetric } = require('./MeasurableMetric');
const { Logger } = require('../utils/Logger');
const { FileSystem } = require('../utils/FileSystem');
const Ajv = require('ajv');

class OutputFormatSuccessMetric extends MeasurableMetric {
  constructor(name, options = {}) {
    super(name, {
      description: 'Validates output format against a regex or JSON schema; emits 1 on success, 0 on failure',
      unit: 'binary',
      precision: 0,
      ...options
    });
    this.logger = new Logger(options);
    this.fs = new FileSystem(options);
    this.metricsConfig = options.metrics_config || {};
    this.ajv = new Ajv({ allErrors: true, strict: false });
  }

  validateValue(value) {
    if (value === null) return true; // allow null when unconfigured or validation error
    return value === 0 || value === 1;
  }

  async performMeasurement(output, context = {}) {
    try {
      if (!output) return null;

      const cfg = this.metricsConfig.output_format || {};
      const { regex, json_schema_path: schemaPath } = cfg;

      if (!regex && !schemaPath) {
        // Not configured; return null as per spec
        return null;
      }

      // Regex path
      if (regex) {
        const re = new RegExp(regex);
        return re.test(output) ? 1 : 0;
      }

      // JSON Schema path
      if (schemaPath) {
        try {
          const abs = this.fs.getAbsolutePath(schemaPath);
          if (!(await this.fs.exists(abs))) {
            this.logger.warn(`output_format.json_schema_path does not exist: ${schemaPath}`);
            return null;
          }
          const schema = await this.fs.readJSON(abs);

          // Parse output as JSON
          let data;
          try {
            data = JSON.parse(output);
          } catch (e) {
            return 0; // output is not valid JSON
          }

          const validate = this.ajv.compile(schema);
          const valid = validate(data);
          return valid ? 1 : 0;
        } catch (err) {
          this.logger.warn(`JSON schema validation error: ${err.message}`);
          return null; // misconfiguration or schema error
        }
      }

      return null;
    } catch (error) {
      this.logger.warn(`OutputFormatSuccessMetric failed: ${error.message}`);
      return null;
    }
  }
}

module.exports = { OutputFormatSuccessMetric };

