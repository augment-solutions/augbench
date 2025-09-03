export class BaseMetric {
  constructor(name) { this.name = name; }
  // eslint-disable-next-line no-unused-vars
  async measure(context) { throw new Error("Not implemented"); }
}

