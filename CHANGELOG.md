# 0.0.4

* Internal refactor of controller implementation
* Added `strictAsyncMode` option. This option requires that all filters and action handlers return a Promise or accept a `next()` callback. This is helpful in preventing difficult to detect bugs around async handlers. The option is enabled by default, can be disabled by setting `strictAsyncMode: false` on your controller.


# 0.0.3

* Documentation ftw!


# 0.0.2

* Fix typo when checking for res.headersSent


# 0.0.1

* Initial public release
