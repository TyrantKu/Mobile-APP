/*******************************************************************************
 * @license
 * Copyright (c) 2012 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 * 
 * Contributors: IBM Corporation - initial API and implementation
 ******************************************************************************/

/*global console define navigator setTimeout XMLHttpRequest*/
define(["orion/assert", "orion/test", "orion/Deferred", "orion/xhr", "orion/editor/eventTarget"],
		function(assert, mTest, Deferred, xhr, mEventTarget) {
	var EventTarget = mEventTarget.EventTarget;
	var isIE = navigator.appName.indexOf("Microsoft Internet Explorer") !== -1;
	var hasReadyStateOpenedBug = (function() {
		var x = new XMLHttpRequest();
		x.open('GET', '.', true);
		try {
			x.status;
		} catch (e) {
			return true;
		}
		return false;
	}());

	/**
	 * Fake version of XMLHttpRequest for testing without actual network accesses. Eemulates the
	 * supported XHR features of the browser running the test as closely as possible.
	 */
	function MockXMLHttpRequest() {
		// Does browser understand timeout?
		if (typeof new XMLHttpRequest().timeout === 'number') {
			Object.defineProperty(this, 'timeout', {
				get: function() {
					return this._timeout;
				},
				set: function(value) {
					if (isIE && (this.readyState !== this.OPENED || this._sendFlag)) {
						throw new Error('IE: timeout must be set after calling open() but before calling send()');
					}
				}
			});
		}
		Object.defineProperty(this, 'readyState', {
			get: function() {
				return this._readyState;
			},
			set: function(readyState) {
				this._readyState = readyState;
				if (typeof this.onreadystatechange === 'function') {
					this.onreadystatechange();
				}
			}
		});
		Object.defineProperty(this, 'response', {
			get: function() {
				return this._responseText;
			},
			set: function(response) {
				// Bug 381396: emulate browser's non-support for 'response' attribute (eg. IE 9)
				if (typeof new XMLHttpRequest().response !== "undefined") {
					this._response = response;
				}
				if (this.responseType === '' || this.responseType === 'text') {
					this._responseText = response;
				}
			}
		});
		Object.defineProperty(this, 'status', {
			get: function() {
				if (hasReadyStateOpenedBug && this.readyState === this.OPENED) {
					throw new Error('xhr in wrong readyState');
				} else if (this.readyState === this.UNSENT || this.readyState === this.OPENED || this._errorFlag) {
					return 0;
				}
				return this._status;
			},
			set: function(status) {
				this._status = status;
			}
		});
		Object.defineProperty(this, 'statusText', {
			get: function() {
				return this._statusText;
			},
			set: function(statusText) {
				this._statusText = statusText;
			}
		});
		this.readyState = this.UNSENT;
		this.headers = {};
		this.responseType = '';
		this._sendFlag = false;
		this._errorFlag = false;
		this._timeout = 0;
	}
	MockXMLHttpRequest.prototype = {
		UNSENT: 0,
		OPENED: 1,
		HEADERS_RECEIVED: 2,
		LOADING: 3,
		DONE: 4,
		open: function() {
			if (this.readyState !== this.UNSENT) {
				throw new Error('open called out of order');
			}
			this.readyState = this.OPENED;
		},
		send: function() {
			if (this.readyState !== this.OPENED) {
				throw new Error('send called out of order');
			}
			this._sendFlag = true;
		},
		setRequestHeader: function(name, value) {
			if (this.readyState !== this.OPENED) {
				throw new Error('setRequestHeader called out of order');
			}
			this.headers[name] = value;
		},
		_getRequestHeaders: function() {
			return this.headers;
		},
		_fakeComplete: function(status, response, statusText) {
			this.status = status;
			if (arguments.length === 3) {
				this.statusText = statusText;
			}
			this.response = response;
			this.readyState = this.DONE;
		},
		_fakeTimeout: function(err) {
			this._errorFlag = true;
			if (typeof new XMLHttpRequest().timeout !== "undefined") {
				this.dispatchEvent({type: 'timeout'});
			}
		},
		_fakeProgressEvent: function(event) {
			if (typeof this.onprogress === 'function') {
				this.onprogress(event);
			}
		}
	};
	EventTarget.addMixin(MockXMLHttpRequest.prototype);

	/** A mock XHR request that succeeds. */
	function OkXhr() {
		MockXMLHttpRequest.apply(this, Array.prototype.slice.call(arguments));
		this.send = function() {
			MockXMLHttpRequest.prototype.send.call(this);
			var self = this;
			setTimeout(function() {
				self._fakeComplete(200, 'success!');
			}, 75);
		};
	}
	OkXhr.prototype = new MockXMLHttpRequest();

	/** A mock XHR request that 404s. */
	function FailXhr() {
		MockXMLHttpRequest.apply(this, Array.prototype.slice.call(arguments));
		this.send = function() {
			MockXMLHttpRequest.prototype.send.call(this);
			var self = this;
			setTimeout(function() {
				self._fakeComplete(404, 'i failed', '404 Bogus Failure');
			}, 100);
		};
	}
	FailXhr.prototype = new MockXMLHttpRequest();

	function succeed(result) {
		var d = new Deferred();
		d.resolve.apply(d, Array.prototype.slice.call(arguments));
		return d;
	}

	function fail(err) {
		var d = new Deferred();
		d.reject.apply(d, Array.prototype.slice.call(arguments));
		return d;
	}

	var tests = {};
	tests['test GET resolve'] = function() {
		return xhr('GET', '/', null, new OkXhr()).then(succeed, fail);
	};

	tests['test GET reject'] = function() {
		return xhr('GET', '/bogus/url/that/doesnt/exist', null, new FailXhr()).then(fail, succeed);
	};

	tests['test timeout causes reject'] = function() {
		var timeoutingXhr = new OkXhr();
		timeoutingXhr.send = function() {
			MockXMLHttpRequest.prototype.send.call(this);
			var self = this;
			setTimeout(function() {
				self._fakeTimeout();
			}, 50);
		};
		return xhr('GET', '/', {
				timeout: 25
			}, timeoutingXhr).then(fail, succeed);
	};

	tests['test resolve value has expected shape'] = function() {
		return xhr('GET', '/foo', {
				data: 'my request body',
				headers: {'X-Foo': 'bar'},
				log: true,
				responseType: 'text',
				timeout: 1500
			}, new OkXhr())
			.then(function(result) {
				assert.ok(!!result.args);
				assert.equal(result.args.data, 'my request body');
				assert.equal(result.args.headers['X-Foo'], 'bar');
				assert.equal(result.args.log, true);
				assert.ok(result.url);
				assert.equal(result.args.responseType, 'text');
				assert.equal(result.args.timeout, 1500);
				assert.equal(result.status, 200);
				assert.equal(result.responseText, 'success!');
				assert.equal(result.response, 'success!');
				assert.ok(result.xhr instanceof MockXMLHttpRequest);
			}, fail);
	};

	tests['test reject value has expected shape'] = function() {
		return xhr('GET', '/bar', {
				data: 'my request body',
				headers: {'X-Foo': 'bar'},
				log: false,
				responseType: 'text',
				timeout: 1500
			}, new FailXhr())
			.then(fail, function(result) {
				assert.ok(!!result.args);
				assert.equal(result.args.data, 'my request body');
				assert.equal(result.args.headers['X-Foo'], 'bar');
				assert.equal(result.args.log, false);
				assert.equal(result.args.responseType, 'text');
				assert.equal(result.args.timeout, 1500);
				assert.ok(result.xhr instanceof MockXMLHttpRequest);
			});
	};

	tests['test timeout value has expected shape'] = function() {
		var timeoutingXhr = new OkXhr();
		timeoutingXhr.send = function() {
			MockXMLHttpRequest.prototype.send.call(this);
			var self = this;
			setTimeout(function() {
				self._fakeTimeout();
			}, 50);
		};
		return xhr('GET', '/', {
				timeout: 25
		}, timeoutingXhr).then(fail, function(result) {
			assert.ok(!!result.args);
			assert.ok(!result.response);
			assert.ok(!result.responseText);
			assert.equal(result.status, 0);
			assert.equal(result.url, '/');
			assert.ok(result.xhr instanceof MockXMLHttpRequest);
			assert.ok(!!result.error);
		});
	};

	tests['test \'X-Requested-With\' is set'] = function() {
		var d = new Deferred();
		var headerCheckerXhr = new MockXMLHttpRequest();
		headerCheckerXhr.send = function() {
			MockXMLHttpRequest.prototype.send.call(this);
			var headers = this._getRequestHeaders();
			if (headers['X-Requested-With'] === 'XMLHttpRequest') {
				d.resolve();
			} else {
				d.reject();
			}
			this._fakeComplete(200, 'OK');
		};
		xhr('GET', '/', null, headerCheckerXhr);
		return d;
	};

	tests['test GET with headers'] = function() {
		return xhr('GET', '/', {
			headers: {
				'X-Foo-Bar': 'baz'
			}
		}, new OkXhr())
		.then(succeed, fail);
	};

	tests['test open() exception causes reject'] = function() {
		var alreadyOpenXhr = new OkXhr();
		alreadyOpenXhr.open('GET', '/foo');
		// Since request is already OPEN the next call to open() will throw, and xhr should catch & reject
		return xhr('GET', '/bar', null, alreadyOpenXhr).then(fail, succeed);
	};

	tests['test progress event'] = function() {
		//assert the Deferred's progress notification is invoked.
		var progressXhr = new OkXhr();
		var deferred = new Deferred();
		xhr('GET', '/foobar', {}, progressXhr).then(null, null, function(progressEvent) {
			try {
				assert.ok(progressEvent);
				assert.equal(progressEvent.loaded, 31337);
				deferred.resolve();
			} catch (e) {
				deferred.reject(e);
			}
		});
		progressXhr._fakeProgressEvent({loaded: 31337});
		return deferred;
	};

return tests;
});