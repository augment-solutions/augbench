/**
 * ParallelExecutor - Manages parallel execution of benchmark runs with resource management
 */

const { EventEmitter } = require('events');
const { Logger } = require('./Logger');

class ParallelExecutor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.logger = new Logger(options);
    this.maxConcurrent = options.maxConcurrent || 1;
    this.queue = [];
    this.running = new Map(); // Map of running tasks by ID
    this.completed = new Map(); // Map of completed tasks by ID
    this.errors = new Map(); // Map of errors by task ID
  }

  /**
   * Execute tasks with concurrency control
   * @param {Array} tasks - Array of task objects with id and fn properties
   * @returns {Promise<Map>} - Map of results by task ID
   */
  async execute(tasks) {
    this.logger.debug(`Starting parallel execution of ${tasks.length} tasks with max concurrency: ${this.maxConcurrent}`);
    
    // Reset state
    this.queue = [...tasks];
    this.running.clear();
    this.completed.clear();
    this.errors.clear();

    // Start initial batch
    const promises = [];
    for (let i = 0; i < Math.min(this.maxConcurrent, tasks.length); i++) {
      promises.push(this._runNext());
    }

    // Wait for all tasks to complete
    await Promise.all(promises);

    // Return results
    const results = new Map();
    for (const [id, result] of this.completed) {
      results.set(id, { success: true, result });
    }
    for (const [id, error] of this.errors) {
      results.set(id, { success: false, error });
    }

    return results;
  }

  /**
   * Run the next task in the queue
   */
  async _runNext() {
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;

      this.running.set(task.id, task);
      this.emit('taskStart', { id: task.id, running: this.running.size, queued: this.queue.length });

      try {
        const result = await this._executeTask(task);
        this.completed.set(task.id, result);
        this.emit('taskComplete', { id: task.id, result, running: this.running.size - 1, queued: this.queue.length });
      } catch (error) {
        this.errors.set(task.id, error);
        this.emit('taskError', { id: task.id, error, running: this.running.size - 1, queued: this.queue.length });
      } finally {
        this.running.delete(task.id);
      }
    }
  }

  /**
   * Execute a single task with timeout and error handling
   */
  async _executeTask(task) {
    const timeout = task.timeout || this.options.defaultTimeout || 600000; // 10 minutes default
    
    return new Promise(async (resolve, reject) => {
      let timeoutId;
      
      // Set up timeout
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          reject(new Error(`Task ${task.id} timed out after ${timeout}ms`));
        }, timeout);
      }

      try {
        // Execute the task function
        const result = await task.fn();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Get current execution status
   */
  getStatus() {
    return {
      running: this.running.size,
      queued: this.queue.length,
      completed: this.completed.size,
      errors: this.errors.size,
      total: this.running.size + this.queue.length + this.completed.size + this.errors.size
    };
  }

  /**
   * Cancel all pending tasks
   */
  cancelPending() {
    const cancelled = this.queue.length;
    this.queue = [];
    this.logger.info(`Cancelled ${cancelled} pending tasks`);
    return cancelled;
  }

  /**
   * Wait for all running tasks to complete
   */
  async waitForRunning() {
    while (this.running.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Create a task object from a function
   */
  static createTask(id, fn, options = {}) {
    return {
      id,
      fn,
      timeout: options.timeout,
      metadata: options.metadata || {}
    };
  }

  /**
   * Create a batch of tasks for benchmark runs
   */
  static createBenchmarkTasks(runs, executeFn) {
    const tasks = [];
    for (let i = 0; i < runs; i++) {
      const runId = i + 1;
      tasks.push({
        id: `run-${runId}`,
        fn: () => executeFn(runId),
        metadata: { runId }
      });
    }
    return tasks;
  }
}

module.exports = { ParallelExecutor };
