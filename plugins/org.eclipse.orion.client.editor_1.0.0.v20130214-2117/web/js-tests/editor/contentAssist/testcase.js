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
/*global define setTimeout*/
define(['orion/Deferred', 'orion/assert', 'orion/editor/textModel', 'js-tests/editor/mockTextView', 'orion/editor/contentAssist'],
		function(Deferred, assert, mTextModel, mMockTextView, mContentAssist) {
	var ContentAssist = mContentAssist.ContentAssist,
	    TextModel = mTextModel.TextModel,
	    MockTextView = mMockTextView.MockTextView;

	function withData(func) {
		var view = new MockTextView({});
		var contentAssist = new ContentAssist(view);
		return func(view, contentAssist);
	}

	/**
	 * Sets the text in a TextView. An appearance of '@@@' in the text will be replaced by the editing caret.
	 * @returns {Number} The caret offset
	 */
	function setText(view, text) {
		var model = new TextModel();
		model.setText(text);
		view.setModel(model);
		if (text.indexOf('@@@') !== -1) {
			var offset = model.find({string: '@@@'}).next().start;
			model.setText(text.replace('@@@', ''));
			view.setCaretOffset(offset);
		}
		return view.getCaretOffset();
	}

	function getContentAssistPrefix(view, index) {
		var start = index;
		while (start > 0 && /[A-Za-z0-9_]/.test(view.getText(start - 1, start))) {
			start--;
		}
		return view.getText(start, index);
	}

	function createKeyPressEvent(chr) {
		return {
			charCode: chr.charCodeAt(0)
		};
	}
	
	/**
	 * Creates a provider using the given factory and tests that its method receives the expected params properly.
	 * @param {Function} contentAssistProviderFactory Takes a callback function to use as the method body, and returns
	 * {@link orion.editor.ContentAssistProvider}
	 * @returns {Deferred} A deferred that rejects on assertion failure or error.
	 */
	function assertProviderInvoked(text, contentAssistProviderFactory) {
		var deferred = new Deferred();
		withData(function(view, contentAssist) {
			var offset = setText(view, text);
			text = text.replace('@@@', '');
			var expectedLine = view.getModel().getLine(view.getModel().getLineAtOffset(offset));
			var expectedPrefix = getContentAssistPrefix(view, offset);
			var checkParams = function(buffer, actualOffset, context) {
				try {
					assert.strictEqual(buffer, text);
					assert.strictEqual(actualOffset, offset);
					assert.strictEqual(context.line, expectedLine);
					assert.strictEqual(context.prefix, expectedPrefix);
					assert.strictEqual(context.selection.start, offset);
					assert.strictEqual(context.selection.end, offset);
					deferred.resolve();
				} catch (e) {
					deferred.reject(e);
				}
			};
			var provider = contentAssistProviderFactory(checkParams);
			contentAssist.setProviders([ provider ]);
			contentAssist.activate();
		});
		return deferred;
	}

	var tests = {};
	// Tests that ContentAssist calls a provider's computeProposals() method with the expected parameters.
	tests.testComputeProposals = function() {
		var text = 'this is the first line\nthis is the second line@@@';
		return assertProviderInvoked(text, function(getProposalsFunction) {
			return {
				computeProposals: getProposalsFunction
			};
		});
	};

	// Tests that 'getProposals' works as an alias of 'computeProposals' (backwards compatibility)
	tests.testGetProposals = function() {
		var text = 'this is the first line\nthis is the second line@@@';
		return assertProviderInvoked(text, function(getProposalsFunction) {
			return {
				getProposals: getProposalsFunction
			};
		});
	};
	
	// Tests that active ContentAssist will call providers as we type.
	tests.testFiltering = function() {
		var first = new Deferred(),
		    second = new Deferred(),
		    deferred = Deferred.all([first, second]);
		withData(function(view, contentAssist) {
			var offset = setText(view, 'foo @@@');
			var provider = {
				computeProposals: function() {
					return [];
				}
			};
			contentAssist.setProviders([ provider ]);
			contentAssist.activate();

			// Start filtering
			// 'foo b'
			offset++;
			provider.computeProposals = function(buffer, actualOffset, context) {
				try {
					assert.strictEqual(buffer, view.getText());
					assert.strictEqual(actualOffset, view.getModel().getCharCount());
					assert.strictEqual(context.line, 'foo b');
					assert.strictEqual(context.prefix, getContentAssistPrefix(view, actualOffset));
					first.resolve();
				} catch (e) {
					first.reject(e);
				}
			};
			view._handleKeyPress(createKeyPressEvent('b'));

			first.then(function() {
				// 'foo ba'
				offset++;
				provider.computeProposals = function(buffer, actualOffset, context) {
					try {
						assert.strictEqual(buffer, view.getText());
						assert.strictEqual(actualOffset, view.getModel().getCharCount());
						assert.strictEqual(context.line, 'foo ba');
						assert.strictEqual(context.prefix, getContentAssistPrefix(view, actualOffset));
						second.resolve();
					} catch (e) {
						second.reject(e);
					}
				};
				view._handleKeyPress(createKeyPressEvent('a'));
			});
		});
		return deferred;
	};

	// Tests that Activating, Deactivating events are fired as expected.
	tests.testEvents1 = function() {
		var d1 = new Deferred(),
		    d2 = new Deferred(),
		    deferred = Deferred.all([d1, d2]);
		withData(function(view, contentAssist) {
			setText(view, 'fizz bu');
			contentAssist.addEventListener('Activating', function(event) {
				d1.resolve();
			});
			contentAssist.activate();
			d1.then(function() {
				contentAssist.addEventListener('Deactivating', function(event) {
					d2.resolve();
				});
				contentAssist.deactivate();
			});

		});
		return deferred;
	};

	// Tests that ProposalsComputed, ProposalsApplied events are fired as expected.
	tests.testEvents2 = function() {
		var d1 = new Deferred(),
		    d2 = new Deferred(),
		    deferred = Deferred.all([d1, d2]);
		withData(function(view, contentAssist) {
			setText(view, 'foo@@@baz');
			var proposal = {proposal: ' bar ', description: 'Metasyntactic variable completion'};
			contentAssist.setProviders([
				{	computeProposals: function() {
						return [proposal];
					}
				}
			]);
			contentAssist.addEventListener('ProposalsComputed', function(event) {
				try {
					assert.strictEqual(1, event.data.proposals.length, 'Got right # of proposals');
					assert.deepEqual(event.data.proposals[0], proposal);
					d1.resolve();
				} catch (e) { d1.reject(e); }
			});
			contentAssist.activate();
			d1.then(function() {
				contentAssist.addEventListener('ProposalApplied', function(event) {
					try {
						assert.deepEqual(event.data.proposal, proposal, 'Applied proposal matches what we provided');
						assert.strictEqual(view.getText(), 'foo bar baz', 'Proposal was applied to TextView');
						d2.resolve();
					} catch (e) { d2.reject(e); }
				});
				contentAssist.activate();
				contentAssist.apply(proposal);
			});
		});
		return deferred;
	};

	// Test that some provider throwing or rejecting does not prevent other providers from being invoked.
	tests.testErrorHandling = function() {
		var d1 = new Deferred(),
		    d2 = new Deferred(),
		    d3 = new Deferred();
		withData(function(view, contentAssist) {
			contentAssist.setProviders([
				{
					computeProposals: function() {
						d1.resolve();
						throw new Error('i threw');
					}
				},
				{
					computeProposals: function() {
						d2.resolve();
						return new Deferred().reject('i rejected');
					}
				},
				{
					computeProposals: function() {
						d3.resolve();
					}
				}
			]);
			contentAssist.activate();
		});
		return Deferred.all([d1, d2, d3]);
	};

	// TODO Test ContentAssistMode
//	tests.testContentAssistMode = function() {
//		// lineUp lineDown enter selection
//	};

	return tests;
});
