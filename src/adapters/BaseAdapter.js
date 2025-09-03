export class BaseAdapter {
  constructor(name, logger) {
    this.name = name;
    this.logger = logger;
  }
  // eslint-disable-next-line no-unused-vars
  async execute(promptPathOrText, context) {
    throw new Error("Not implemented");
  }
}

