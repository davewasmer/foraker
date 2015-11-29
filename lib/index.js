import assert from 'assert';
import CoreObject from 'core-object';
import Promise from 'bluebird';
import contains from 'lodash/collection/contains';
import pluck from 'lodash/collection/pluck';
import FilterDSL from './filter-dsl';

const prototypeOf = Object.getPrototypeOf;

/**
 * The base Controller class that all your controllers should extend from.
 *
 * @title Controller
 */

export default CoreObject.extend({

  init() {
    this._super.apply(this, arguments);
    this._buildFilters();
  },

  /**
   * Return a middleware function that runs the specified action name with the
   * supplied context. Errors are passed on to next(err).
   *
   * @method action
   *
   * @param  {String}  actionName the action to run
   *
   * @return {Function}           a middleware function that will run the action
   */
  action(actionName, ...args) {
    if (args.length === 3) {
      return middleware.call(this, args[0], args[1], args[2]);
    } else {
      return middleware.bind(this);
    }
    function middleware(req, res, next) {
      // Check for the action name on the prototype of this object, to avoid
      // picking up actions defined on parent classes.
      assert(prototypeOf(this).hasOwnProperty(actionName), `${ actionName } action is not defined on this controller`);
      let handlers = this._buildHandlers(actionName);
      this._executeHandlerChain(actionName, handlers, req, res, next);
    }
  },

  /**
   * Take an action name, and build a list of before filters, the action itself,
   * and the after filters that are applicable.
   *
   * @method _buildHandlers
   *
   * @param  {String}       actionName
   *
   * @return {Array}                  an array of before filters, the action
   * handler, and after filters
   */
  _buildHandlers(actionName) {
    let beforeFilters = this._filtersForAction(actionName, 'before');
    let afterFilters = this._filtersForAction(actionName, 'after');
    return beforeFilters.concat(actionName, afterFilters);
  },

  /**
   * Execute an array of handler methods, handling the various async behaviors
   * and error results. Any handler that errors (sync or async) stops the
   * execution chain. Any handler that completes the response stops the chain as
   * well.
   *
   * @method _executeHandlerChain
   *
   * @param  {Array}             handlers an array of handler functions
   */
  _executeHandlerChain(actionName, handlers, req, res, next) {
    // Create a root promise that represents the entire chain of handlers. Mark
    // it as cancellable in case one of the filters/actions completes the
    // request.
    let handlerChain = Promise.resolve(handlers).cancellable();
    handlerChain.each((handlerName) => {
      let handler = this[handlerName];

      // If the handler isn't defined here, it must be a missing filter
      // definition. It can't be the action itself, because we check that
      // above.
      assert(handler, `${ handlerName } filter is not defined.`);

      return this._executeHandler(actionName, handler, req, res, next);

    }).then(() => {
      if (!this.isResSent(res)) {
        throw new Error(`Incomplete action! It looks like your ${ actionName } action didn't respond or throw an error.`);
      }
    }).catch(Promise.CancellationError, () => {
      next();
    }).catch((err) => {
      next(err);
    });
  },

  /**
   * Execute a single handler.
   *
   * @method _executeHandler
   *
   * @param  {Function}        handler the handler to execute
   *
   * @return {Promise}                a promise representing the result of the
   * handler; resolved indicates that the next handler should execute, rejected
   * indicates that the handler completed the response (or errored)
   */
  _executeHandler(actionName, handler, req, res, next) {
    // Track the different ways of asynchronously completing the action so we
    // can error if more than one is used
    let handlerReturnedPromise = false;
    let handlerCalledNext = false;
    // Wrap the handler in this outer promise to encapsulate the
    // different ways of handling async (i.e. return a Promise or call next).
    return new Promise((resolve, reject) => {
      req.controller = this;
      req.action = actionName;
      // Invoke the handler. Pass in a faked out "next" function which will
      // either (a) simply reject the outer promise if called with an error, or
      // (b) cancel the promise if called without an error (which is a signal to
      // skip the rest of the controller and pass control back to express).
      let result = handler.call(req.context, req, res, (err) => {
        // They called `next()` which indicates an error or we should skip the
        // remaining handlers and pass control to the next middleware
        handlerCalledNext = true;
        if (handlerReturnedPromise) {
          throw new Error(`Your ${ actionName} action returned a Promise *and* called continue - you cannot do both.`);
        }
        // Errored - reject with the error
        if (err) {
          reject(err);
        // Skip - cancel the promise and call next
        } else {
          reject(new Promise.CancellationError());
          next();
        }
      });
      // If the filter/action returns a promise, then link it to the outer
      // promise.
      if (result && typeof result.then === 'function') {
        handlerReturnedPromise = true;
        if (handlerCalledNext) {
          throw new Error(`Your ${ actionName} action returned a Promise *and* called continue - you cannot do both.`);
        }
        result.then(() => {
          if (this.isResSent(res)) {
            reject(new Promise.CancellationError());
          } else {
            resolve();
          }
        }).catch(reject);
      // The action appears to be synchronous (it didn't accept `next()` or
      // return a Promise)
      } else if (handler.length < 3) {
        if (this.strictAsyncMode) {
          throw new Error(`"${ handler.name }" did not return a promise or accept a next() callback. If you *really* want a synchronous action/filter, set 'strictAsyncMode' to false on the controller.`);
        } else {
          if (this.isResSent(res)) {
            reject(new Promise.CancellationError());
          } else {
            resolve();
          }
        }
      }
    });
  },

  /**
   * Strict async mode will throw errors when filters or action handlers fail
   * to return a Promise or accept a next callback.
   *
   * This is enabled by default. Most filters and actions are async, and the few
   * cases that aren't should be easily handled with a simple `return
   * Promise.resolve()`.
   *
   * With strict mode disabled, if you forget to return a promise from an async
   * filter or action, you'll likely end up with difficult to trace errors
   * (resulting from multiple attempts to send the response), and could
   * unintentionally allow security vulnerabilities (i.e. if your async "auth"
   * filter fails to return a Promise, Foraker would assume it is sync and allow
   * a request through which should be blocked).
   *
   * Disable at your own risk.
   *
   * @type {Boolean}
   */
  strictAsyncMode: true,

  /**
   * Returns true if the supplied response is complete. By default checks to see
   * if `res.headersSent` is true. Express only flips the `res.headersSent` flag to
   * true once the response is actually sent.
   *
   * @method isResSent
   *
   * @param  {Response}  res
   *
   * @return {Boolean}     whether or not the response as been sent
   */
  isResSent(res) {
    return res.headersSent;
  },

  /**
   * Walk the controller's prototype chain to build a list of filters to execute
   * in order. Filters defined on prototypes execute before filters defined on
   * the instance.
   *
   * This returned list of filters is *all* filters, regardless of
   * which actions they are supposed to run for. Whitelist and blacklist options
   * ({ only, except }), as well as skips, are retained but ignored for now.
   *
   * @method _buildFilters
   * @private
   *
   * @return {Array}      - an array of filters
   */
  _buildFilters() {
    let dsl = new FilterDSL();
    this._filters = dsl.filters;
    // Start with this object, then walk up it's prototype chain, finding any
    // parent prototypes that have filters defined. Build an array out of that
    // list of prototypes.
    let target = prototypeOf(this);
    let chain = [];
    while (prototypeOf(target) !== Object.prototype) {
      if (target.filters) {
        chain.push(target);
      }
      target = prototypeOf(target);
    }
    // Then reverse the list so we get the parent-most prototype first. Then
    // build the filters by invoking each one's filter method with our DSL. This
    // ensures that filters from parent prototypes run before child filters do.
    chain.reverse().forEach((proto) => {
      proto.filters.call(dsl);
    });
  },

  /**
 * Return the filters that should run for a given action from a list of all
 * filters, taking in to account whitelists, blacklists, and skips.
 *
 * @method _filtersForAction
 *
 * @private
 *
 * @param  {String}     actionName  - the name of the action to run
 * @param  {Array}   allFilters  - an array of filters to build from
 *
 * @return {Array}   The filters from the allFilters list that should apply
 * to the given actionName
   */
  _filtersForAction(actionName, stage) {
    return pluck(this._filters.filter((filter) => {
      let { only, except, skip } = filter.options;
      return filter.stage === stage &&
             !skip &&
             !contains(except, actionName) &&
             (only.length === 0 || contains(only, actionName));
    }), 'name');
  }

});
