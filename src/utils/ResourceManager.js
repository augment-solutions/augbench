/**
 * ResourceManager - Manages system resources for parallel execution
 */

const os = require('os');
const { Logger } = require('./Logger');

class ResourceManager {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(options);
    
    // Resource limits
    this.maxMemoryUsagePercent = options.maxMemoryUsagePercent || 80;
    this.maxCpuUsagePercent = options.maxCpuUsagePercent || 90;
    this.checkInterval = options.checkInterval || 5000; // 5 seconds
    
    // State
    this.monitoring = false;
    this.resourceChecks = new Map();
  }

  /**
   * Calculate safe concurrency limit based on system resources
   */
  calculateSafeConcurrency(requestedConcurrency) {
    const cpuCount = os.cpus().length;
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    
    // CPU-based limit (leave at least 1 CPU free for system)
    const cpuLimit = Math.max(1, cpuCount - 1);
    
    // Memory-based limit (assume each task uses ~500MB)
    const memoryPerTask = 500 * 1024 * 1024; // 500MB in bytes
    const availableMemory = freeMemory * (this.maxMemoryUsagePercent / 100);
    const memoryLimit = Math.max(1, Math.floor(availableMemory / memoryPerTask));
    
    // Take the minimum of all limits
    const systemLimit = Math.min(cpuLimit, memoryLimit);
    const finalLimit = Math.min(requestedConcurrency, systemLimit);
    
    this.logger.info(`Resource limits - CPUs: ${cpuCount}, Free Memory: ${(freeMemory / 1024 / 1024 / 1024).toFixed(2)}GB`);
    this.logger.info(`Concurrency limits - Requested: ${requestedConcurrency}, CPU: ${cpuLimit}, Memory: ${memoryLimit}, Final: ${finalLimit}`);
    
    return finalLimit;
  }

  /**
   * Start monitoring system resources
   */
  startMonitoring() {
    if (this.monitoring) return;
    
    this.monitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.checkResources();
    }, this.checkInterval);
    
    this.logger.debug('Started resource monitoring');
  }

  /**
   * Stop monitoring system resources
   */
  stopMonitoring() {
    if (!this.monitoring) return;
    
    this.monitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.logger.debug('Stopped resource monitoring');
  }

  /**
   * Check current resource usage
   */
  checkResources() {
    const usage = this.getResourceUsage();
    
    // Log warnings if usage is high
    if (usage.memoryPercent > this.maxMemoryUsagePercent) {
      this.logger.warn(`High memory usage: ${usage.memoryPercent.toFixed(1)}%`);
    }
    
    if (usage.cpuPercent > this.maxCpuUsagePercent) {
      this.logger.warn(`High CPU usage: ${usage.cpuPercent.toFixed(1)}%`);
    }
    
    return usage;
  }

  /**
   * Get current resource usage
   */
  getResourceUsage() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryPercent = (usedMemory / totalMemory) * 100;
    
    // Simple CPU usage calculation (not perfect but good enough)
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    const cpuPercent = 100 - ~~(100 * totalIdle / totalTick);
    
    return {
      memoryPercent,
      cpuPercent,
      freeMemory,
      totalMemory,
      cpuCount: cpus.length
    };
  }

  /**
   * Wait until resources are available
   */
  async waitForResources(timeout = 60000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const usage = this.getResourceUsage();
      
      if (usage.memoryPercent < this.maxMemoryUsagePercent && 
          usage.cpuPercent < this.maxCpuUsagePercent) {
        return true;
      }
      
      this.logger.debug(`Waiting for resources - Memory: ${usage.memoryPercent.toFixed(1)}%, CPU: ${usage.cpuPercent.toFixed(1)}%`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return false;
  }

  /**
   * Create a resource-aware executor
   */
  createResourceAwareExecutor(ParallelExecutor, requestedConcurrency) {
    const safeConcurrency = this.calculateSafeConcurrency(requestedConcurrency);
    
    const executor = new ParallelExecutor({
      ...this.options,
      maxConcurrent: safeConcurrency
    });
    
    // Add resource monitoring
    this.startMonitoring();
    
    // Clean up monitoring when executor is done
    const originalExecute = executor.execute.bind(executor);
    executor.execute = async (tasks) => {
      try {
        return await originalExecute(tasks);
      } finally {
        this.stopMonitoring();
      }
    };
    
    return executor;
  }
}

module.exports = { ResourceManager };
