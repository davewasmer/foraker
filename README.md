# foraker [![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url] [![Dependency Status][daviddm-image]][daviddm-url] [![Coverage percentage][coveralls-image]][coveralls-url]

Foraker provides a simple, drop-in controller that support filters, promises, subclassing, and more. It's easy to integrate into existing Express / middleware
based apps, follows the "do one thing well" principle, and is thoroughly tested.


## Install

```sh
$ npm install --save foraker
```


## Basic Usage

```js
// controllers/posts.js
import Controller from 'foraker';

export default Controller.extend({
  create(req, res) {
    // You can return promises from an action handler. Rejected promises will
    // call next(rejectionValue).
    return createNewPostRecord(req.body)
      .then((newPost) => {
        res.json(newPost);
      });
  }
});
```


## Express / Connect Integration

Controllers are stand alone code - you need to wire them up to your Express (or otherwise Connect-compatible) routing layer to let them actually handle requests:

```js
// app.js
import PostController from './controllers/posts';

// Controller singleton
let posts = new PostController();

app.post('/posts', posts.action('create'));
```


## Filters

Filters operate much like Rails filters: they allow you to run code before or after an action handler runs.

Filters can be applied to specific actions, are inherited from superclasses, and can be skipped. They receive the req and res just like a regular action handler, and if they throw an error or send a response, the request handling stops there (i.e. later filters or actions are not run).

Here's a basic example of a controller with a single action (`update`), and a single before filter that applies to all actions on the controller which will authenticate the user:

```js
// controllers/posts.js
import Controller from 'foraker';

export default Controller.create({

  filters() {
    // Run the authenticate function (that is defined on this controller) before
    // any action for this controller runs.
    this.before('authenticate');
  },

  update(req, res) {
    /* update the post record ... */
  },

  authenticate(req, res) {
    if (req.headers['Authorization'] !== 'Secret Password') {
      // Errors throw will be caught, and passed into next()
      throw new Error('Unauthorized!');
    }
  }

});
```

In this more complex example, the filters are applied selectively using the `only` and `except` options:

```js
  filters() {
    // The `only` option acts like a whitelist, so the notifyAuthor filter is
    // only run for the update action. `except` acts like a blacklist,
    // preventing the filter from running on specific actions.
    this.after('notifyAuthor', { only: 'update' });
  }
```

You can also pass the filter method directly in, rather than referencing it by name. This is useful if the filter method isn't a method defined on the controller class itself:

```js
import Controller from 'foraker';
import authenticate from '../filters/authenticate';

export default Controller.create({
  filters() {
    // If the filter is a string, it's assumed to be a method defined on the
    // controller itself. Alternatively, you can pass in a function directly:
    this.before(authenticate);
  }
```


## License

MIT © [Dave Wasmer](davewasmer.com)


[npm-image]: https://badge.fury.io/js/foraker.svg
[npm-url]: https://npmjs.org/package/foraker
[travis-image]: https://travis-ci.org/davewasmer/foraker.svg?branch=master
[travis-url]: https://travis-ci.org/davewasmer/foraker
[daviddm-image]: https://david-dm.org/davewasmer/foraker.svg?theme=shields.io
[daviddm-url]: https://david-dm.org/davewasmer/foraker
[coveralls-image]: https://coveralls.io/repos/davewasmer/foraker/badge.svg
[coveralls-url]: https://coveralls.io/r/davewasmer/foraker
