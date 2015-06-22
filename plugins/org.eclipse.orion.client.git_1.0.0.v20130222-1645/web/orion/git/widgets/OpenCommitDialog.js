/*******************************************************************************
 * @license Copyright (c) 2012, 2013 IBM Corporation and others. All rights reserved.
 *          This program and the accompanying materials are made available under
 *          the terms of the Eclipse Public License v1.0
 *          (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse
 *          Distribution License v1.0
 *          (http://www.eclipse.org/org/documents/edl-v10.html).
 * 
 * Contributors: IBM Corporation - initial API and implementation
 ******************************************************************************/
/*globals define document clearTimeout setTimeout window*/

define(['i18n!git/nls/gitmessages', 'orion/i18nUtil', 'orion/Deferred', 'orion/webui/dialog', 'orion/webui/littlelib'], function(
messages, i18nUtil, Deferred, dialog, lib) {

	/**
	 * Usage:
	 * <code>new orion.git.widgets.OpenCommitDialog(options).show();</code>
	 * 
	 * @name orion.git.widgets.OpenCommitDialog
	 * @class A dialog that searches for commits by name.
	 */
	function OpenCommitDialog(options) {
		this._init(options);
	}

	OpenCommitDialog.prototype = new dialog.Dialog();

	OpenCommitDialog.prototype.TEMPLATE = '<div><label for="resourceName">${Type the commit name (sha1):}</label></div><div><input type="text" id="resourceName"></div><div id="results" style="max-height:400px; height:auto; overflow-y:auto;"></div>';

	OpenCommitDialog.prototype._init = function(options) {
		var that = this;

		this.title = options.title || messages["Find Commit"];
		this.modal = true;
		this.messages = messages;

		this.SEARCH_DELAY = 500;
		this.timeoutId = null;
		this.time = 0;

		this.serviceRegistry = options.serviceRegistry;
		if (!this.serviceRegistry) {
			throw new Error("Missing required argument: serviceRegistry"); //$NON-NLS-0$
		}

		this.repositories = options.repositories;
		if (!this.repositories) {
			throw new Error("Missing required argument: repositories"); //$NON-NLS-0$
		}

		this.commitName = options.commitName;

		this.buttons = [];

		this.buttons.push({
			callback: function() {
				that.destroy();
				that._execute();
			},
			text: 'OK'
		});

		// Start the dialog initialization.
		this._initialize();
	};

	OpenCommitDialog.prototype._bindToDom = function(parent) {
		var that = this;

		this.$resourceName.addEventListener("input", function(evt) { //$NON-NLS-0$
			that.time = +new Date();
			if (that.timeoutId) {
				clearTimeout(that.timeoutId);
			}
			that.timeoutId = setTimeout(that._checkSearch.bind(that), 0);
		}, false);

		this.$resourceName.addEventListener("keydown", function(evt) { //$NON-NLS-0$
			if (evt.keyCode === lib.KEY.ENTER) {
				var link = lib.$("a", that.$results); //$NON-NLS-0$
				if (link) {
					lib.stop(evt);
					window.open(link.href);
					that.hide();
				}
			}
		}, false);

		this.$resourceName.value = this.commitName;
	};

	OpenCommitDialog.prototype._checkSearch = function() {
		var that = this;

		clearTimeout(this.timeoutId);
		var now = new Date().getTime();
		if ((now - this.time) > this.SEARCH_DELAY) {
			this.time = now;
			this._doSearch();
		} else {
			this.timeoutId = setTimeout(that._checkSearch.bind(that), 50);
		}
	};

	OpenCommitDialog.prototype._findCommitLocation = function(repositories, commitName, deferred) {
		var that = this;
		if (!deferred) {
			deferred = new Deferred();
		}

		if (repositories.length > 0) {
			this.serviceRegistry.getService("orion.page.progress").progress(
				that.serviceRegistry.getService("orion.git.provider").doGitLog(
					"/gitapi/commit/" + commitName + repositories[0].ContentLocation + "?page=1&pageSize=1"), "Getting commit details " + commitName).then(
				function(resp) {
					deferred.resolve(resp.Children[0]);
				}, function(error) {
					that._findCommitLocation(repositories.slice(1), commitName, deferred);
				}
			);
		} else {
			deferred.reject();
		}

		return deferred;
	};

	/** @private */
	OpenCommitDialog.prototype._doSearch = function() {
		var that = this;
		var text = this.$resourceName && this.$resourceName.value;

		// don't do a server-side query for an empty text box
		if (text) {
			var div = document.createElement("div");
			div.appendChild(document.createTextNode(messages['Searching...']));
			lib.empty(this.$results);
			this.$results.appendChild(div);

			this.serviceRegistry.getService("orion.page.message").setProgressMessage(messages["Looking for the commit"]); //$NON-NLS-0$
			this._findCommitLocation(this.repositories, text).then(
				function(resp) {
					var commit = resp;
					lib.empty(that.$results);
					that._displayCommit(commit, that.$results);
					that.serviceRegistry.getService("orion.page.message").setProgressMessage(""); //$NON-NLS-0$
				}, function(error) {
					var div = document.createElement("div");
					div.appendChild(document.createTextNode("No commits found"));
					lib.empty(that.$results);
					that.$results.appendChild(div);
					that.serviceRegistry.getService("orion.page.message").setProgressMessage(""); //$NON-NLS-0$
				}
			);
		}
	};

	OpenCommitDialog.prototype._displayCommit = function(commit, parentNode) {
		var that = this;
		
		var tableNode = document.createElement("div"); //$NON-NLS-0$
		tableNode.style.padding = "10px";
		tableNode.style.maxWidth = "480px";
		lib.empty(parentNode);
		parentNode.appendChild(tableNode);

		var commitMessage0 = commit.Message.split(/(\r?\n|$)/)[0];
		var link = document.createElement("a");
		link.className = "navlinkonpage";
		link.href = "/git/git-commit.html#" + commit.Location + "?page=1&pageSize=1";
		link.textContent = commitMessage0;
		tableNode.appendChild(link);
		
		link.addEventListener("mouseup", function(evt) { //$NON-NLS-0$
			if (evt.button === 0 && !evt.ctrlKey && !evt.metaKey) {
				that.hide();
			}
		}, false);

		link.addEventListener("keyup", function(evt) { //$NON-NLS-0$
			if (evt.keyCode === lib.KEY.ENTER) {
				that.hide();
			}
		}, false);
		
		var div = document.createElement("div");
		div.style.paddingTop = "15px";
		tableNode.appendChild(div);
		
		var imageDiv = document.createElement("div");
		tableNode.appendChild(imageDiv);
		
		var textDiv = document.createElement("div");
		tableNode.appendChild(textDiv);

		if (commit.AuthorImage) {
			var authorImage = document.createElement("div");
			authorImage.style['float'] = "left";
			var image = new Image();
			image.src = commit.AuthorImage;
			image.name = commit.AuthorName;
			image.className = "git-author-icon";
			authorImage.appendChild(image);
			imageDiv.appendChild(authorImage);
		}

		var authoredBySpan = document.createElement("span");
		authoredBySpan.textContent = i18nUtil.formatMessage(messages[" authored by ${0} {${1}) on ${2}"], //$NON-NLS-0$
			commit.AuthorName, commit.AuthorEmail, new Date(commit.Time).toLocaleString()); 
		textDiv.appendChild(authoredBySpan);
		
		var div = document.createElement("div");
		textDiv.appendChild(div);
		
		var committedBySpan = document.createElement("span");
		committedBySpan.textContent = i18nUtil.formatMessage(messages['committed by 0 (1)'], commit.CommitterName, commit.CommitterEmail);
		textDiv.appendChild(committedBySpan);

		var div = document.createElement("div");
		div.style.paddingTop = "15px";
		textDiv.appendChild(div);
		
		var commitNameSpan = document.createElement("span");
		commitNameSpan.textContent = messages["commit:"] + commit.Name;
		textDiv.appendChild(commitNameSpan);


		if (commit.Parents && commit.Parents.length > 0) {
			var div = document.createElement("div");
			textDiv.appendChild(div);

			var parentNode = document.createElement("span");
			parentNode.textContent = messages["parent:"];
			
			var parentLink = document.createElement("a");
			parentLink.className = "navlinkonpage";
			parentLink.href = "/git/git-commit.html#" + commit.Parents[0].Location + "?page=1&pageSize=1";
			parentLink.textContent = commit.Parents[0].Name;
			parentNode.appendChild(parentLink);
			
			parentLink.addEventListener("mouseup", function(evt) { //$NON-NLS-0$
				if (evt.button === 0 && !evt.ctrlKey && !evt.metaKey) {
					that.hide();
				}
			}, false);

			parentLink.addEventListener("keyup", function(evt) { //$NON-NLS-0$
				if (evt.keyCode === lib.KEY.ENTER) {
					that.hide();
				}
			}, false);
			
			textDiv.appendChild(parentNode);
		}
	};

	OpenCommitDialog.prototype._beforeHiding = function() {
		clearTimeout(this._timeoutId);
	};

	OpenCommitDialog.prototype.constructor = OpenCommitDialog;

	// return the module exports
	return {
		OpenCommitDialog: OpenCommitDialog
	};

});