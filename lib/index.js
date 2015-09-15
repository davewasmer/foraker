import assert from 'assert';
import CoreObject from 'core-object';
import Promise from 'bluebird';
import contains from 'lodash-node/modern/collection/contains';
import pluck from 'lodash-node/modern/collection/pluck';
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
      assert(this[actionName], `${ actionName } action is not defined on this controller`);

      let beforeFilters = this._filtersForAction(actionName, 'before');
      let afterFilters = this._filtersForAction(actionName, 'after');
      let handlers = beforeFilters.concat(actionName, afterFilters);

      // Create a root promise that represents the entire chain of filters +
      // action handlers. Mark it as cancellable in case one of the
      // filters/actions calls next().
      let handlerChain = Promise.resolve(handlers).cancellable();
      return handlerChain.each((handler) => {
        let handlerReturnedPromise = false;
        let handlerCalledNext = false;
        // Wrap each filter/action in this outer promise to encapsulate the
        // different ways of handling async (i.e. return a Promise or call next).
        return new Promise((resolve, reject) => {
          // Invoke the actual filter/action. Pass in a faked out "next" function
          // which will either (a) simply reject the outer promise if called with
          // an error, or (b) cancel the root promise chain if called without an
          // error (which is a signal to skip the rest of the controller and pass
          // control back to express).
          let result = this[handler].call(req.context, req, res, (err) => {
            handlerCalledNext = true;
            if (handlerReturnedPromise) {
              throw new Error(`Your ${ actionName} action returned a Promise *and* called continue - you cannot do both.`);
            }
            if (err) {
              reject(err);
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
            result.then(resolve).catch(reject);
          // Allow for synchronous action handlers (i.e. didn't return a
          // promise, and didn't accept a next callback)
          } else if (this[handler].length < 3) {
            resolve();
          }
        });
      }).then(() => {
        if (!res.headersSent) {
          throw new Error(`Incomplete action! It looks like your ${ actionName } action didn't respond or throw an error.`);
        }
      }).catch((err) => {
        if (err instanceof Promise.CancellationError) {
          next();
        } else {
          next(err);
        }
        throw err;
      });
    }
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
