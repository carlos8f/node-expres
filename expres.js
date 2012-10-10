var expres = module.exports = {};

expres.middleware = function (req, res, next) {
  var ctx = res;

  if (!ctx.req) ctx.req = req;
  if (!ctx.next) ctx.next = next;

  Object.keys(expres.methods).forEach( function (method) {
    // We don't override existing methods.
    if (typeof res[method] === 'undefined') {
      res[method] = expres.methods[method].bind(ctx);
    }
  });

  if (next) next();
};

expres.methods = {

  /**
   * Set status `code`.
   *
   * @param {Number} code
   * @return {ServerResponse}
   */
  status: function(code){
    this.statusCode = code;
    return this;
  },

  /**
   * Set Link header field with the given `links`.
   *
   * Examples:
   *
   *    res.links({
   *      next: 'http://api.example.com/users?page=2',
   *      last: 'http://api.example.com/users?page=5'
   *    });
   *
   * @param {Object} links
   * @return {ServerResponse}
   */
  links: function(links){
    return this.set('Link', Object.keys(links).map(function(rel){
      return '<' + links[rel] + '>; rel="' + rel + '"';
    }).join(', '));
  },

  /**
   * Set the Content-Type to `type`.
   *
   * Example:
   *
   *     res.type('application/json');
   *
   * @param {String} type
   * @return {ServerResponse} for chaining
   */
  type: function(type){
    return this.set('Content-Type', type);
  },

  /**
   * Send a response.
   *
   * Examples:
   *
   *     res.send(new Buffer('wahoo'));
   *     res.send({ some: 'json' });
   *     res.send('<p>some html</p>');
   *     res.send(404, 'Sorry, cant find that');
   *     res.send(404);
   *
   * @param {Mixed} body or status
   * @param {Mixed} body
   * @return {ServerResponse}
   */
  send: function(body){
    var req = this.req
      , head = 'HEAD' == req.method
      , len;

    // allow status / body
    if (2 == arguments.length) {
      // res.send(body, status) backwards compat
      if ('number' != typeof body && 'number' == typeof arguments[1]) {
        this.statusCode = arguments[1];
      } else {
        this.statusCode = body;
        body = arguments[1];
      }
    }

    switch (typeof body) {
      // response status
      case 'number':
        this.get('Content-Type') || this.type('text/plain');
        this.statusCode = body;
        body = http.STATUS_CODES[body];
        break;
      // string defaulting to html
      case 'string':
        if (!this.get('Content-Type')) {
          this.type('text/html; charset=utf-8');
        }
        break;
      case 'boolean':
      case 'object':
        if (null === body) {
          body = '';
        } else if (Buffer.isBuffer(body)) {
          this.get('Content-Type') || this.type('application/octet-stream');
        } else {
          return this.json(body);
        }
        break;
    }

    // populate Content-Length
    if (undefined !== body && !this.get('Content-Length')) {
      this.set('Content-Length', len = Buffer.isBuffer(body)
        ? body.length
        : Buffer.byteLength(body));
    }

    // ETag support
    // TODO: W/ support
    // if (len > 1024) {
    //   if (!this.get('ETag')) {
    //     this.set('ETag', etag(body));
    //   }
    // }

    // freshness
    // if (req.fresh) this.statusCode = 304;

    // strip irrelevant headers
    if (204 == this.statusCode || 304 == this.statusCode) {
      this.removeHeader('Content-Type');
      this.removeHeader('Content-Length');
      body = '';
    }

    // respond
    this.end(head ? null : body);
    return this;
  },

  /**
   * Send JSON response.
   *
   * Examples:
   *
   *     res.json(null);
   *     res.json({ user: 'tj' });
   *     res.json(500, 'oh noes!');
   *     res.json(404, 'I dont have that');
   *
   * @param {Mixed} obj or status
   * @param {Mixed} obj
   * @return {ServerResponse}
   */
  json: function(obj){
    // allow status / body
    if (2 == arguments.length) {
      // res.json(body, status) backwards compat
      if ('number' == typeof arguments[1]) {
        this.statusCode = arguments[1];
      } else {
        this.statusCode = obj;
        obj = arguments[1];
      }
    }

    var body = JSON.stringify(obj, null, 2);

    // content-type
    this.get('Content-Type') || this.set('Content-Type', 'application/json; charset=utf-8');

    return this.send(body);
  },

  /**
   * Send JSON response with JSONP callback support.
   *
   * Examples:
   *
   *     res.jsonp(null);
   *     res.jsonp({ user: 'tj' });
   *     res.jsonp(500, 'oh noes!');
   *     res.jsonp(404, 'I dont have that');
   *
   * @param {Mixed} obj or status
   * @param {Mixed} obj
   * @return {ServerResponse}
   */
  jsonp: function(obj){
    // allow status / body
    if (2 == arguments.length) {
      // res.json(body, status) backwards compat
      if ('number' == typeof arguments[1]) {
        this.statusCode = arguments[1];
      } else {
        this.statusCode = obj;
        obj = arguments[1];
      }
    }

    var body = JSON.stringify(obj, null, 2);
    var callback = this.req.query['callback'];

    // content-type
    this.set('Content-Type', 'application/json; charset=utf-8');

    // jsonp
    if (callback) {
      this.set('Content-Type', 'text/javascript');
      body = callback.replace(/[^\[\]\w$.]/g, '') + '(' + body + ');';
    }

    return this.send(body);
  },

  /**
   * Respond to the Acceptable formats using an `obj`
   * of mime-type callbacks.
   *
   * This method uses `req.accepted`, an array of
   * acceptable types ordered by their quality values.
   * When "Accept" is not present the _first_ callback
   * is invoked, otherwise the first match is used. When
   * no match is performed the server responds with
   * 406 "Not Acceptable".
   *
   * Content-Type is set for you, however if you choose
   * you may alter this within the callback using `res.type()`
   * or `res.set('Content-Type', ...)`.
   *
   *    res.format({
   *      'text/plain': function(){
   *        res.send('hey');
   *      },
   *
   *      'text/html': function(){
   *        res.send('<p>hey</p>');
   *      },
   *
   *      'appliation/json': function(){
   *        res.send({ message: 'hey' });
   *      }
   *    });
   *
   * By default expres passes an `Error`
   * with a `.status` of 406 to `next(err)`
   * if a match is not made. If you provide
   * a `.default` callback it will be invoked
   * instead.
   *
   * @param {Object} obj
   * @return {ServerResponse} for chaining
   */
  format: function(obj){
    var req = this.req
      , next = req.next;

    var fn = obj.default;
    if (fn) delete obj.default;
    var keys = Object.keys(obj);

    var key = req.accepts(keys);

    this.set('Vary', 'Accept');

    if (key) {
      this.set('Content-Type', normalizeType(key));
      obj[key](req, this, next);
    } else if (fn) {
      fn();
    } else {
      var err = new Error('Not Acceptable');
      err.status = 406;
      err.types = normalizeTypes(keys);
      next(err);
    }

    return this;
  },

  /**
   * Set header `field` to `val`, or pass
   * an object of header fields.
   *
   * Examples:
   *
   *    res.set('Accept', 'application/json');
   *    res.set({ Accept: 'text/plain', 'X-API-Key': 'tobi' });
   *
   * Aliased as `res.header()`.
   *
   * @param {String|Object} field
   * @param {String} val
   * @return {ServerResponse} for chaining
   */
  set: function(field, val){
    if (2 == arguments.length) {
      this.setHeader(field, '' + val);
    } else {
      for (var key in field) {
        this.setHeader(key, '' + field[key]);
      }
    }
    return this;
  },

  /**
   * Get value for header `field`.
   *
   * @param {String} field
   * @return {String}
   */
  get: function(field){
    return this.getHeader(field);
  },

  /**
   * Redirect to the given `url` with optional response `status`
   * defaulting to 302.
   *
   * The given `url` can also be the name of a mapped url, for
   * example by default express supports "back" which redirects
   * to the _Referrer_ or _Referer_ headers or "/".
   *
   * Examples:
   *
   *    res.redirect('/foo/bar');
   *    res.redirect('http://example.com');
   *    res.redirect(301, 'http://example.com');
   *    res.redirect('http://example.com', 301);
   *    res.redirect('../login'); // /blog/post/1 -> /blog/login
   *
   * Mounting:
   *
   *   When an application is mounted, and `res.redirect()`
   *   is given a path that does _not_ lead with "/". For
   *   example suppose a "blog" app is mounted at "/blog",
   *   the following redirect would result in "/blog/login":
   *
   *      res.redirect('login');
   *
   *   While the leading slash would result in a redirect to "/login":
   *
   *      res.redirect('/login');
   *
   * @param {String} url
   * @param {Number} code
   */
  redirect: function(url){
    var req = this.req
      , head = 'HEAD' == req.method
      , status = 302
      , body;

    // allow status / url
    if (2 == arguments.length) {
      if ('number' == typeof url) {
        status = url;
        url = arguments[1];
      } else {
        status = arguments[1];
      }
    }

    // setup redirect map
    var map = { back: req.get('Referrer') || '/' };

    // perform redirect
    url = map[url] || url;

    // relative
    if (!~url.indexOf('://') && 0 != url.indexOf('//')) {
      var path = '';

      // relative to path
      if ('.' == url[0]) {
        url = req.path + '/' + url;
      // relative to mount-point
      } else if ('/' != url[0]) {
        url = path + '/' + url;
      }

      // Absolute
      var host = req.get('Host');
      url = '//' + host + url;
    }

    // Support text/{plain,html} by default
    this.format({
      text: function(){
        body = statusCodes[status] + '. Redirecting to ' + url;
      },

      html: function(){
        var u = utils.escape(url);
        body = '<p>' + statusCodes[status] + '. Redirecting to <a href="' + u + '">' + u + '</a></p>';
      },

      default: function(){
        body = '';
      }
    });

    // Respond
    this.statusCode = status;
    this.set('Location', url);
    this.set('Content-Length', Buffer.byteLength(body));
    this.end(head ? null : body);
  }
};

// Alias for 'type'.
expres.methods.contentType = expres.methods.type;

// Alias for 'set'.
expres.methods.header = expres.methods.set;


