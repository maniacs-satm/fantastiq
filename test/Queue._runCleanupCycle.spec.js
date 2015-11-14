'use strict';

var assert = require('chai').assert;
var Promise = require('bluebird');
var sinon = require('sinon');

module.exports = function (queue) {
  return function () {

    var clock = null;

    afterEach(function () {
      if (clock) {
        clock.restore();
        clock = null;
      }
    });

    it('should clean up jobs when expired', Promise.coroutine(function * () {
      clock = sinon.useFakeTimers(Date.now());
      var ids = yield queue.addN([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      yield Promise.each(ids, Promise.coroutine(function * () {
        var result = yield queue.retrieve();
        var error = ((result.data % 2) === 0) ? new Error('Failed') : null;
        queue.acknowledge(result.id, error);
      }));

      yield queue.config({
        removeFailedAfter: 5000, removeCompletedAfter: 10000
      });

      clock.tick(4999);
      var cleanedCount = yield queue._runCleanupCycle();
      assert.strictEqual(cleanedCount, 0);

      var stats = yield queue.stat();
      assert.propertyVal(stats, 'completedCount', 5);
      assert.propertyVal(stats, 'failedCount', 5);

      clock.tick(2);
      cleanedCount = yield queue._runCleanupCycle();
      assert.strictEqual(cleanedCount, 5);

      stats = yield queue.stat();
      assert.propertyVal(stats, 'completedCount', 5);
      assert.propertyVal(stats, 'failedCount', 0);

      clock.tick(4998);
      stats = yield queue.stat();
      assert.propertyVal(stats, 'completedCount', 5);
      assert.propertyVal(stats, 'failedCount', 0);

      clock.tick(2);
      cleanedCount = yield queue._runCleanupCycle();
      assert.strictEqual(cleanedCount, 5);

      stats = yield queue.stat();
      assert.propertyVal(stats, 'completedCount', 0);
      assert.propertyVal(stats, 'failedCount', 0);
    }));

    it('should return 0 when locked', Promise.coroutine(function * () {
      clock = sinon.useFakeTimers(Date.now());

      var ids = yield queue.addN([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      yield Promise.each(ids, Promise.coroutine(function * () {
        var result = yield queue.retrieve();
        var error = ((result.data % 2) === 0) ? new Error('Failed') : null;
        queue.acknowledge(result.id, error);
      }));

      yield queue.config({
        removeFailedAfter: 1000, removeCompletedAfter: 2000
      });

      clock.tick(1500);
      var cleanedCount = yield queue._runCleanupCycle(10000);
      assert.strictEqual(cleanedCount, 5);

      clock.tick(1000);
      // completed ones are now ready to be cleaned but the lock should prevent it
      cleanedCount = yield queue._runCleanupCycle(10000);
      assert.strictEqual(cleanedCount, 0);
    }));
  };
};
