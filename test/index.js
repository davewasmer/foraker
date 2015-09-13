import { expect } from 'chai';
import Promise from 'bluebird';
import Controller from '../lib/index';

function createController(actions) {
  let Klass = Controller.extend(actions);
  return new Klass();
}

function noop() {}

const request = {
  context: {}
};
const response = {
  headersSent: false,
  json() {
    this.headersSent = true;
  }
};

describe('foraker', function() {

  beforeEach(function() {
    response.headersSent = false;
  });

  it('allows subclasses via static .extend()', function() {
    expect(Controller).itself.to.respondTo('extend');
    let ExtendedController = Controller.extend({ foo: 'bar' });
    expect(ExtendedController.prototype.foo).to.equal('bar');
    expect(false, 'ExtendedController extends from Controller');
  });

  describe('action', function() {
    it('creates a middleware handler which hands off control to the action handler', function() {
      let controller = createController({
        basicActionHandler(req, res) {
          res.headersSent = true;
          expect(req).to.equal(request);
          expect(res).to.equal(response);
        }
      });
      return controller.action('basicActionHandler', request, response, noop)
        .then(() => {
          expect(response.headersSent).to.equal(true);
        });
    });
  });

  describe('action handlers', function() {

    describe('error handling', function() {

      it('should call next(err) if the handler throws with err', function() {
        let err = new Error();
        let nextRan = false;
        let controller = createController({
          actionThatThrows() {
            throw err;
          }
        });

        return controller.action('actionThatThrows', request, response, (thrownError) => {
          nextRan = true;
          expect(thrownError).to.equal(err);
        }).catch(() => {
          expect(nextRan).to.equal(true);
        });
      });

      it('should call next(err) if the handler returns a promise which rejects', function() {
        let rejection = Promise.reject();
        let nextRan = false;
        let controller = createController({
          actionThatRejects() {
            return rejection;
          }
        });
        return controller.action('actionThatRejects', request, response, (rejectionValue) => {
          nextRan = true;
          expect(rejectionValue).to.equal(rejection);
        }).catch(() => {
          expect(nextRan).to.equal(true);
        });
      });

    });

    it('should wait for a returned promise to resolve before calling next()', function() {
      let controller = createController({
        actionThatReturnsAPromise(req, res) {
          return Promise.delay(1).then(() => {
            res.headersSent = true;
          });
        }
      });

      return controller.action('actionThatReturnsAPromise', request, response, noop)
      .then(() => {
        expect(response.headersSent).to.equal(true);
      });
    });

    describe('context', function() {
      after(function() {
        request.context = {};
      });

      it('should use req.context as the action handler context', function() {
        request.context = { foo: 'bar' };
        let controller = createController({
          actionThatUsesContext(req, res) {
            expect(this.foo).to.equal('bar');
            res.headersSent = true;
          }
        });

        return controller.action('actionThatUsesContext', request, response, noop);
      });
    });

    describe('completing requests', function() {

      it('should allow the action to call next directly', function() {
        let nextRan = false;
        let controller = createController({
          actionThatExplicitlyCallsNext(req, res, next) {
            next();
          }
        });

        return controller.action('actionThatExplicitlyCallsNext', request, response, () => {
          nextRan = true;
        }).catch(Promise.CancellationError, () => {
          expect(nextRan).to.equal(true);
        });
      });

      it('should call next() with an error if next was not called, no response was sent, and no error was thrown', function() {
        let nextRan = true;
        let controller = createController({
          actionThatDoesNotComplete() {}
        });

        return controller.action('actionThatDoesNotComplete', request, response, (err) => {
          nextRan = true;
          expect(err.message).to.match(/Incomplete action/);
        }).catch(() => {
          expect(nextRan).to.equal(true);
        });
      });

      it('should call not call next() with an "incomplete action" error if a response was sent', function() {
        let nextRan = false;
        let controller = createController({
          actionThatDoesComplete(req, res) {
            res.json({});
          }
        });

        return controller.action('actionThatDoesComplete', request, response, () => {
          nextRan = true;
        }).then(() => {
          expect(nextRan).to.equal(false);
        });
      });

    });

    describe('filters', function() {

      it('should support before & after filters', function() {
        let beforeFilterRan = false;
        let afterFilterRan = false;
        let controller = createController({
          filters() {
            this.before('beforeFilter');
            this.after('afterFilter');
          },
          actionWithFilter(req, res) { res.headersSent = true; },
          beforeFilter() { beforeFilterRan = true; },
          afterFilter() { afterFilterRan = true; }
        });

        return controller.action('actionWithFilter', request, response, noop)
        .then(() => {
          expect(response.headersSent).to.equal(true);
          expect(beforeFilterRan).to.equal(true);
          expect(afterFilterRan).to.equal(true);
        });
      });

      it('should support whitelisting a single action (only: "actionName")', function() {
        let filterRan = false;
        let controller = createController({
          filters() {
            this.before('beforeFilter', { only: 'actionWithFilter' });
          },
          actionWithFilter(req, res) { res.headersSent = true; },
          actionWithoutFilter(req, res) { res.headersSent = true; },
          beforeFilter() { filterRan = true; }
        });

        return controller.action('actionWithoutFilter', request, response, noop)
        .then(() => {
          expect(filterRan).to.equal(false);
          return controller.action('actionWithFilter', request, response, noop);
        }).then(() => {
          expect(filterRan).to.equal(true);
        });
      });

      it('should support whitelisting multiple actions (only: [ "actionOne", "actionTwo" ])', function() {
        let filterRan = false;
        let controller = createController({
          filters() {
            this.before('beforeFilter', { only: [ 'actionWithFilterOne', 'actionWithFilterTwo' ] });
          },
          actionWithFilterOne(req, res) { res.headersSent = true; },
          actionWithFilterTwo(req, res) { res.headersSent = true; },
          actionWithoutFilter(req, res) { res.headersSent = true; },
          beforeFilter() { filterRan = true; }
        });

        return controller.action('actionWithoutFilter', request, response, noop)
        .then(() => {
          expect(filterRan).to.equal(false);
          return controller.action('actionWithFilterOne', request, response, noop);
        }).then(() => {
          expect(filterRan).to.equal(true);
          filterRan = false;
          return controller.action('actionWithFilterTwo', request, response, noop);
        }).then(() => {
          expect(filterRan).to.equal(true);
        });
      });

      it('should support blacklisting a single action (except: "actionWithFilter")', function() {
        let filterRan = false;
        let controller = createController({
          filters() {
            this.before('beforeFilter', { except: [ 'actionWithoutFilter' ] });
          },
          actionWithFilter(req, res) { res.headersSent = true; },
          actionWithoutFilter(req, res) { res.headersSent = true; },
          beforeFilter() { filterRan = true; }
        });

        return controller.action('actionWithoutFilter', request, response, noop)
        .then(() => {
          expect(filterRan).to.equal(false);
          return controller.action('actionWithFilter', request, response, noop);
        }).then(() => {
          expect(filterRan).to.equal(true);
        });
      });

      it('should support blacklisting multiple actions (except: [ "actionOne", "actionTwo" ])', function() {
        let filterRan = false;
        let controller = createController({
          filters() {
            this.before('beforeFilter', { except: [ 'actionWithoutFilterOne', 'actionWithoutFilterTwo' ] });
          },
          actionWithFilter(req, res) { res.headersSent = true; },
          actionWithoutFilterOne(req, res) { res.headersSent = true; },
          actionWithoutFilterTwo(req, res) { res.headersSent = true; },
          beforeFilter() { filterRan = true; }
        });

        return controller.action('actionWithoutFilterOne', request, response, noop)
        .then(() => {
          expect(filterRan).to.equal(false);
          return controller.action('actionWithoutFilterTwo', request, response, noop);
        }).then(() => {
          expect(filterRan).to.equal(false);
          return controller.action('actionWithFilter', request, response, noop);
        }).then(() => {
          expect(filterRan).to.equal(true);
        });
      });

      it('should run filters in the order they were added in the filters method', function() {
        let filtersRun = [];
        let controller = createController({
          filters() {
            this.before('beforeFilterOne');
            this.before('beforeFilterTwo');
          },
          actionWithMultipleFilters(req, res) { res.headersSent = true; },
          beforeFilterOne() { filtersRun.push('one'); },
          beforeFilterTwo() { filtersRun.push('two'); }
        });

        return controller.action('actionWithMultipleFilters', request, response, noop)
        .then(() => {
          expect(filtersRun.length).to.equal(2);
          expect(filtersRun[0]).to.equal('one');
          expect(filtersRun[1]).to.equal('two');
        });
      });

      it('should not run subsequent filters or action if an earlier filter threw an error', function() {
        let err = new Error();
        let laterFilterRan = false;
        let controller = createController({
          filters() {
            this.before('beforeFilterOne');
            this.before('beforeFilterTwo');
          },
          actionWithMultipleFilters(req, res) { res.headersSent = true; },
          beforeFilterOne() { throw err; },
          beforeFilterTwo() { laterFilterRan = true; }
        });

        return controller.action('actionWithMultipleFilters', request, response, noop)
        .catch((errorThrown) => {
          expect(errorThrown).to.equal(err);
          expect(laterFilterRan).to.equal(false);
          expect(response.headersSent).to.equal(false);
        });
      });

      it('should not run subsequent filters or action if an earlier filter returned a rejected promise', function() {
        let error = new Error();
        let laterFilterRan = false;
        let controller = createController({
          filters() {
            this.before('beforeFilterOne');
            this.before('beforeFilterTwo');
          },
          actionWithMultipleFilters(req, res) { res.headersSent = true; },
          beforeFilterOne() { return Promise.reject(error); },
          beforeFilterTwo() { laterFilterRan = true; }
        });

        return controller.action('actionWithMultipleFilters', request, response, noop)
        .catch((rejectionValue) => {
          expect(rejectionValue).to.equal(error);
          expect(laterFilterRan).to.equal(false);
          expect(response.headersSent).to.equal(false);
        });
      });

      it('should wait for a returned promise to resolve before executing later filters or actions', function() {
        let executionSequence = [];
        let controller = createController({
          filters() {
            this.before('beforeFilterOne');
            this.before('beforeFilterTwo');
          },
          beforeFilterOne() {
            executionSequence.push('one-sync');
            return Promise.delay(1).then(() => {
              executionSequence.push('one-async');
            });
          },
          beforeFilterTwo() { executionSequence.push('two'); },
          actionWithMultipleFilters(req, res) {
            executionSequence.push('action');
            res.headersSent = true;
          }
        });

        return controller.action('actionWithMultipleFilters', request, response, noop)
        .then(() => {
          expect(executionSequence).to.deep.equal([ 'one-sync', 'one-async', 'two', 'action' ]);
        });
      });

    });

  });

});
