---
layout: homepage
---

Foraker provides a simple, drop-in controller that support filters, promises, subclassing, and more. It's easy to integrate into existing Express / middleware
based apps, follows the "do one thing well" principle, and is thoroughly tested.

> **Note:** this is alpha software, and still undergoing changes. Contributions welcome, consumers beware!

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
