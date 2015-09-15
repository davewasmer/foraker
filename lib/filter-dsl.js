import CoreObject from 'core-object';
import ensureArray from 'ensure-array';
import findWhere from 'lodash-node/modern/collection/findWhere';


/**
 * The filter DSL allows you to add filters to a controller. Filters can be run
 * before or after specific actions, can be skipped, are promise-aware, and
 * more.
 *
 * @title Filter DSL
 */
export default CoreObject.extend({

  init() {
    this._super.apply(this, arguments);
    this.filters = [];
  },

  /**
   * Add a before filter. The filter will execute before any matching actions,
   * and will wait for any returned promises to be resolved.
   *
   * @method before
   *
   * @param  {String|Function} name    Either a string name of the filter
   * method defined on the controller, or the filter function itself.
   * @param  {Object} options
   * @param  {String|Array} options.only  A action name or array of action
   * names that are the only actions that this filter should be run for.
   * @param  {String|Array} options.except  A action name or array of action
   * names that are the only actions that this filter should not be run for.
   */
  before(name, options) {
    this._filter(name, 'before', options);
  },

  /**
   * Add an after filter. The filter will execute after any matching actions,
   * and will wait for any returned promises to be resolved.
   *
   * @method after
   *
   * @param  {String|Function} name    Either a string name of the filter
   * method defined on the controller, or the filter function itself.
   * @param  {Object} options
   * @param  {String|Array} options.only  A action name or array of action
   * names that are the only actions that this filter should be run for.
   * @param  {String|Array} options.except  A action name or array of action
   * names that are the only actions that this filter should not be run for.
   */
  after(name, options) {
    this._filter(name, 'after', options);
  },

  /**
   * Add a filter to the list of all filters. Store the whitelist and the
   * blacklist options as well.
   *
   * @method _filter
   * @private
   *
   * @param  {String|Function} name    Either a string name of the filter
   * method defined on the controller, or the filter function itself.
   * @param  {String} stage   When to run the filter, either "before" the
   * action or "after" it.
   * @param  {Object} options
   * @param  {String|Array} options.only  A action name or array of action
   * names that are the only actions that this filter should be run for.
   * @param  {String|Array} options.except  A action name or array of action
   * names that are the only actions that this filter should not be run for.
   */
  _filter(name, stage, options = {}) {
    if (typeof name !== 'string') {
      throw new Error(`Filter names must be strings, saw ${ name } instead.`);
    }
    if (options.only && options.except) {
      throw new Error(`You cannot supply both 'only' and 'except' options to a filter`);
    }
    options.only = ensureArray(options.only);
    options.except = ensureArray(options.except);
    this.filters.push({ name, stage, options });
  },

  /**
   * Skip a previously added before filter.
   *
   * @method skipBefore
   *
   * @param  {String|Function} name    Either a string name of the filter
   * method defined on the controller, or the filter function itself. _Note:
   * if it is a function, it must be the same function (i.e. by reference)
   * as was originally passed in when adding the filter.
   * @param  {Object} options
   * @param  {String|Array} options.only  A action name or array of action
   * names that are the only actions that this filter should be skipped for.
   * @param  {String|Array} options.except  A action name or array of action
   * names that are the only actions that this filter should not be skipped
   * for.
   */
  skipBefore(name, options) {
    this._skip(name, 'before', options);
  },

  /**
   * Skip a previously added after filter.
   *
   * @method skipAfter
   *
   * @param  {String|Function} name    Either a string name of the filter
   * method defined on the controller, or the filter function itself. _Note:
   * if it is a function, it must be the same function (i.e. by reference)._
   * as was originally passed in when adding the filter.
   * @param  {Object} options
   * @param  {String|Array} options.only  A action name or array of action
   * names that are the only actions that this filter should be skipped for.
   * @param  {String|Array} options.except  A action name or array of action
   * names that are the only actions that this filter should not be skipped
   * for.
   */
  skipAfter(name, options) {
    this._skip(name, 'after', options);
  },

  /**
   * Mark a previously added filter as skipped.
   *
   * @method _skip
   * @private
   *
   * @param  {String|Function} name    Either a string name of the filter
   * method defined on the controller, or the filter function itself. _Note:
   * if it is a function, it must be the same function (i.e. by reference)
   * as was originally passed in when adding the filter._
   * @param  {String} stage   What stage to skip for thi filter, either
   * "before" or "after".
   * @param  {Object} options
   * @param  {String|Array} options.only  A action name or array of action
   * names that are the only actions that this filter should be skipped for.
   * @param  {String|Array} options.except  A action name or array of action
   * names that are the only actions that this filter should not be skipped
   * for.
   */
  _skip(name, stage, options = {}) {
    let filter = findWhere(this.filters, { name, stage });
    if (!filter) {
      throw new Error(`You are trying to skip the ${ name } ${ stage } filter, but it is not present!`);
    }
    options.only = ensureArray(options.only);
    options.except = ensureArray(options.except);
    if (options.only.length > 0) {
      filter.options.except = filter.options.except.concat(options.only);
    } else if (options.except.length > 0) {
      filter.options.only = filter.options.only.concat(options.except);
    } else {
      filter.options.skip = true;
    }
  }

});
