---
title: Subclassing
url: subclassing
---

## Subclassing

Foraker Controllers use [core-object](https://github.com/ember-cli/core-object) to provide inheritance functionality. You can extend the base Controller class via `Controller.extend`, which will then be available on your subclass as well:

```js
import Controller from 'foraker';

let BaseController = Controller.extend({ /* ... */ });
let SubclassedController = BaseController.extend({ /* ... */ });
```

core-object also provides convenient super functionality:

```js
import Controller from 'foraker';

let NameController = Controller.extend({
  getName() {
    return 'Dave';
  }
});

let PoliteNameController = NameController.extend({
  getName() {
    return 'Mr. ' + this._super();
  }
});
```

Controllers with filters are intelligent about how they handle subclasses. Child classes will run the parent class filters as well:

```js
import Controller from 'foraker';

let ApplicationController = Controller.extend({
  filters() {
    this.before('authenticate');
  },
  authenticate(req, res) {
    if (!req.user) {
      throw new Error('Unauthorized!');
    }
  }
});

let BooksController = ApplicationController.extend({
  create() {
    // ApplicationController.authenticate will run before this action does
  }
});
```

Parent class before filters will run prior to the child class before filters, and parent class after filters will run following the child class after filters.
