/**
 * Tests for ParallelExecutor
 */

const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');
const { ParallelExecutor } = require('../src/utils/ParallelExecutor');

describe('ParallelExecutor', function() {
  let executor;

  beforeEach(function() {
    executor = new ParallelExecutor({ maxConcurrent: 2 });
  });

  it('should execute tasks sequentially when maxConcurrent is 1', async function() {
    const sequentialExecutor = new ParallelExecutor({ maxConcurrent: 1 });
    const executionOrder = [];
    
    const tasks = [
      {
        id: 'task1',
        fn: async () => {
          executionOrder.push('start-1');
          await new Promise(resolve => setTimeout(resolve, 50));
          executionOrder.push('end-1');
          return 'result1';
        }
      },
      {
        id: 'task2',
        fn: async () => {
          executionOrder.push('start-2');
          await new Promise(resolve => setTimeout(resolve, 50));
          executionOrder.push('end-2');
          return 'result2';
        }
      }
    ];

    const results = await sequentialExecutor.execute(tasks);

    expect(executionOrder).to.deep.equal(['start-1', 'end-1', 'start-2', 'end-2']);
    expect(results.get('task1')).to.deep.equal({ success: true, result: 'result1' });
    expect(results.get('task2')).to.deep.equal({ success: true, result: 'result2' });
  });

  it('should execute tasks in parallel when maxConcurrent > 1', async function() {
    const executionOrder = [];
    
    const tasks = [
      {
        id: 'task1',
        fn: async () => {
          executionOrder.push('start-1');
          await new Promise(resolve => setTimeout(resolve, 100));
          executionOrder.push('end-1');
          return 'result1';
        }
      },
      {
        id: 'task2',
        fn: async () => {
          executionOrder.push('start-2');
          await new Promise(resolve => setTimeout(resolve, 50));
          executionOrder.push('end-2');
          return 'result2';
        }
      }
    ];

    const results = await executor.execute(tasks);

    // With parallel execution, task2 should finish before task1
    expect(executionOrder).to.deep.equal(['start-1', 'start-2', 'end-2', 'end-1']);
    expect(results.get('task1')).to.deep.equal({ success: true, result: 'result1' });
    expect(results.get('task2')).to.deep.equal({ success: true, result: 'result2' });
  });

  it('should handle task errors gracefully', async function() {
    const tasks = [
      {
        id: 'task1',
        fn: async () => {
          throw new Error('Task 1 failed');
        }
      },
      {
        id: 'task2',
        fn: async () => 'result2'
      }
    ];

    const results = await executor.execute(tasks);

    expect(results.get('task1').success).to.be.false;
    expect(results.get('task1').error.message).to.equal('Task 1 failed');
    expect(results.get('task2')).to.deep.equal({ success: true, result: 'result2' });
  });

  it('should respect concurrency limits', async function() {
    let concurrentCount = 0;
    let maxConcurrent = 0;
    
    const tasks = [];
    for (let i = 1; i <= 5; i++) {
      tasks.push({
        id: `task${i}`,
        fn: async () => {
          concurrentCount++;
          maxConcurrent = Math.max(maxConcurrent, concurrentCount);
          await new Promise(resolve => setTimeout(resolve, 50));
          concurrentCount--;
          return `result${i}`;
        }
      });
    }

    await executor.execute(tasks);

    expect(maxConcurrent).to.equal(2); // Should not exceed maxConcurrent setting
  });

  it('should handle timeouts', async function() {
    const tasks = [
      {
        id: 'task1',
        fn: async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'should not reach here';
        },
        timeout: 100
      }
    ];

    const results = await executor.execute(tasks);

    expect(results.get('task1').success).to.be.false;
    expect(results.get('task1').error.message).to.contain('timed out');
  });

  it('should emit progress events', async function() {
    const events = [];
    
    executor.on('taskStart', (event) => events.push({ type: 'start', ...event }));
    executor.on('taskComplete', (event) => events.push({ type: 'complete', id: event.id }));
    executor.on('taskError', (event) => events.push({ type: 'error', id: event.id }));
    
    const tasks = [
      {
        id: 'task1',
        fn: async () => 'result1'
      },
      {
        id: 'task2',
        fn: async () => {
          throw new Error('Task 2 failed');
        }
      }
    ];

    await executor.execute(tasks);

    const eventTypes = events.map(e => ({ type: e.type, id: e.id }));
    expect(eventTypes).to.deep.include({ type: 'start', id: 'task1' });
    expect(eventTypes).to.deep.include({ type: 'complete', id: 'task1' });
    expect(eventTypes).to.deep.include({ type: 'start', id: 'task2' });
    expect(eventTypes).to.deep.include({ type: 'error', id: 'task2' });
  });

  it('createBenchmarkTasks should create proper task structure', function() {
    const executeFn = () => {};
    const tasks = ParallelExecutor.createBenchmarkTasks(3, executeFn);

    expect(tasks).to.have.lengthOf(3);
    expect(tasks[0]).to.deep.include({
      id: 'run-1',
      metadata: { runId: 1 }
    });
    expect(tasks[0].fn).to.be.a('function');
    expect(tasks[1].id).to.equal('run-2');
    expect(tasks[2].id).to.equal('run-3');
  });
});
