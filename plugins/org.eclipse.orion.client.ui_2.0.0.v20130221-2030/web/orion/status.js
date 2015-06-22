/*******************************************************************************
 * @license
 * Copyright (c) 2009, 2012 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 *
 * Contributors: IBM Corporation - _initial API and implementation
 *******************************************************************************/
/*global define window document Image */
 
define(['require', 'orion/webui/littlelib', 'orion/globalCommands'], function(require, lib, mGlobalCommands) {
	
	/**
	 * Service for reporting status
	 * @class Service for reporting status
	 * @name orion.status.StatusReportingService
	 * @param {orion.serviceregistry.ServiceRegistry} serviceRegistry
	 * @param {orion.operationclient.OperationsClient} operationsClient
	 * @param {String} domId ID of the DOM node under which status will be displayed.
	 * @param {String} progressDomId ID of the DOM node used to display progress messages.
	 */
	function StatusReportingService(serviceRegistry, operationsClient, domId, progressDomId, notificationContainerDomId) {
		this._serviceRegistry = serviceRegistry;
		this._serviceRegistration = serviceRegistry.registerService("orion.page.message", this); //$NON-NLS-0$
		this._operationsClient = operationsClient;
		this.notificationContainerDomId = notificationContainerDomId;
		this.domId = domId;
		this.progressDomId = progressDomId || domId;
		this._hookedClose = false;
	}
 
	StatusReportingService.prototype = /** @lends orion.status.StatusReportingService.prototype */ {
	
		_init: function() {
			// this is a cheat, all dom ids should be passed in
			var closeButton = lib.node("closeNotifications"); //$NON-NLS-0$
			var self = this;
			if (closeButton && !this._hookedClose) {
				closeButton.addEventListener("click", function() { //$NON-NLS-0$
					self.setProgressMessage("");
				}, false);	
				// onClick events do not register for spans when using the keyboard
				closeButton.addEventListener("keydown", function(e) { //$NON-NLS-0$
					if (e.keyCode === lib.KEY.ENTER || e.keyCode === lib.KEY.SPACE) {						
						self.setProgressMessage("");
					}				
				}, false);
			}
		},
		
		_getNotifierElements: function() {
			if (!this._notifierElements) {
				this._notifierElements = mGlobalCommands.getToolbarElements(this.notificationContainerDomId);
			}
			return this._notifierElements;
		},
		/**
		 * Displays a status message to the user.
		 * @param {String} msg Message to display.
		 * @param {Number} [timeout] Time to display the message before hiding it.
		 * @param {Boolean} [isAccessible] If <code>true</code>, a screen reader will read this message.
		 * Otherwise defaults to the domNode default.
		 */
		setMessage : function(msg, timeout, isAccessible) {
			this._init();
			this.currentMessage = msg;
			var node = lib.node(this.domId);
			if(typeof(isAccessible) === "boolean") { //$NON-NLS-0$
				var that = this;
				// this is kind of a hack; when there is good screen reader support for aria-busy,
				// this should be done by toggling that instead
				var readSetting = node.getAttribute("aria-live"); //$NON-NLS-0$
				node.setAttribute("aria-live", isAccessible ? "polite" : "off"); //$NON-NLS-2$ //$NON-NLS-1$ //$NON-NLS-0$
				window.setTimeout(function() {
					if (msg === that.currentMessage) {
						lib.empty(node);
						node.appendChild(document.createTextNode(msg));
						window.setTimeout(function() { node.setAttribute("aria-live", readSetting); }, 100); //$NON-NLS-0$
					}
				}, 100);
			}
			else { 
				lib.empty(node);
				node.appendChild(document.createTextNode(msg));
			}
			if (typeof(timeout) === "number") { //$NON-NLS-0$
				var that = this;
				window.setTimeout(function() {
					if (msg === that.currentMessage) {
						lib.empty(node);
						node.appendChild(document.createTextNode("")); //$NON-NLS-0$
					}
				}, timeout);
			}
		},
	
		/**
		 * Displays an error message to the user.
		 *
		 * @param {String|orionError} st The error to display. Can be a simple String,
		 * or an error object from a  XHR error callback, or the body of an error response 
		 * from the Orion server.
		 */
		setErrorMessage : function(st) {
			this.currentMessage = st;
			this._init();
			//could be: responseText from xhrGet, deferred error object, or plain string
			var status = st.responseText || st.message || st;
			//accept either a string or a JSON representation of an IStatus
			try {
				status = JSON.parse(status);
			} catch(error) {
				//it is not JSON, just continue;
			}
			var message = status.Message || status;
			var color = "red"; //$NON-NLS-0$
			if (status.Severity) {
				switch (status.Severity) {
				case "Warning": //$NON-NLS-0$
					color = "#FFCC00"; //$NON-NLS-0$
					break;
				case "Error": //$NON-NLS-0$
					color = "red"; //$NON-NLS-0$
					break;
				case "Info": //$NON-NLS-0$
				case "Ok": //$NON-NLS-0$
					color = "green"; //$NON-NLS-0$
					break;
				}
			}
			var span = document.createElement("span");  //$NON-NLS-0$
			span.style.color = color;
			span.appendChild(document.createTextNode(message));
			var node = lib.node(this.domId);
			lib.empty(node);
			node.appendChild(span);
		},
		
		/**
		 * Set a message that will be shown in the progress reporting area on the page.
		 * @param {String} message The progress message to display. 
		 */
		setProgressMessage : function(message) {
			this._init();
			this.currentMessage = message;
			var image = document.createElement("span"); //$NON-NLS-0$
			image.classList.add("imageSprite"); //$NON-NLS-0$
			image.classList.add("core-sprite-progress");  //$NON-NLS-0$
			var node = lib.node(this.progressDomId);
			lib.empty(node);
			node.appendChild(image);
			node.appendChild(document.createTextNode(message));
			var container = lib.node(this.notificationContainerDomId);
			container.classList.add("progressNormal"); //$NON-NLS-0$
			if (message && message.length > 0) {
				container.classList.add("slideContainerActive"); //$NON-NLS-0$
			} else if(this._progressMonitors && this._progressMonitors.length > 0){
				return this._renderOngoingMonitors();
			}else{
				container.classList.remove("slideContainerActive"); //$NON-NLS-0$
			}
			mGlobalCommands.layoutToolbarElements(this._getNotifierElements());
		},
		
		/**
		 * Set a message that indicates that a long-running (progress) operation is complete.
		 * @param {String|orionError} message The error to display. Can be a simple String,
		 * or an error object from a XHR error callback, or the body of an error response 
		 * from the Orion server.
		 */
		setProgressResult : function(message) {
			this.currentMessage = message;
			//could either be responseText from xhrGet or just a string
			var status = message.responseText || message;
			//accept either a string or a JSON representation of an IStatus
			try {
				status = JSON.parse(status);
			} catch(error) {
				//it is not JSON, just continue;
			}
			this._init();
			var msg = status.Message || status;
			var imageClass = "core-sprite-info"; //$NON-NLS-0$
			var extraClass = "progressInfo"; //$NON-NLS-0$
			var image = document.createElement("span"); //$NON-NLS-0$
			image.classList.add("imageSprite"); //$NON-NLS-0$
			var removedClasses = [];
			var alt = "info"; //$NON-NLS-0$
			if (status.Severity) {
				switch (status.Severity) {
				case "Warning": //$NON-NLS-0$
					imageClass = "core-sprite-warning"; //$NON-NLS-0$
					alt = "warning"; //$NON-NLS-0$
					extraClass="progressWarning"; //$NON-NLS-0$
					removedClasses.push("progressInfo");
					removedClasses.push("progressError");
					removedClasses.push("progressNormal"); //$NON-NLS-0$
					break;
				case "Error": //$NON-NLS-0$
					imageClass = "core-sprite-error"; //$NON-NLS-0$
					alt = "error"; //$NON-NLS-0$
					extraClass="progressError"; //$NON-NLS-0$
					removedClasses.push("progressWarning");
					removedClasses.push("progressInfo");
					removedClasses.push("progressNormal"); //$NON-NLS-0$
					break;
				default:
					removedClasses.push("progressWarning");
					removedClasses.push("progressError");
					removedClasses.push("progressNormal");
				}
			}
			image.classList.add(imageClass); //$NON-NLS-0$
			var node = lib.node(this.progressDomId);
			var container = lib.node(this.notificationContainerDomId);
			lib.empty(node);
			node.appendChild(image);
			if (status.HTML) { // msg is HTML to be inserted directly
				var span = document.createElement("span"); //$NON-NLS-0$
				span.innerHTML = msg;
				node.appendChild(span);
			} else {  // msg is plain text
				node.appendChild(document.createTextNode("   " + msg)); //$NON-NLS-0$
			}
			if (extraClass && this.progressDomId !== this.domId) {
				container.classList.add(extraClass);
				for (var i=0; i<removedClasses.length; i++) {
					container.classList.remove(removedClasses[i]);
				}
			}
			container.classList.add("slideContainerActive"); //$NON-NLS-0$
			mGlobalCommands.layoutToolbarElements(this._getNotifierElements());
		},
		
		/**
		 * Shows a progress message until the given deferred is resolved.
		 */
		showWhile: function(deferred, message) {
			var that = this;
			if(message){
				that.setProgressMessage(message);
				var finish = function(){
					if(message === that.currentMessage){
						that.setProgressMessage("");		
					}
				};
				deferred.then(finish, finish);
			}
			return deferred;
		},
		
		_lastProgressId: 0,
		_progressMonitors: {length: 0},
		
		/**
		 * Creates a ProgressMonitor that will be displayed on the status area.
		 * @param {Deferred} deferred [optional] that updates this monitor
		 * @param {String} message [optional] messaged to be shown until deferred is not resolved
		 * @returns {ProgressMonitor}
		 */
		createProgressMonitor: function(deferred, message){
			return new ProgressMonitor(this, ++this._lastProgressId, deferred, message);
		},
		
		_renderOngoingMonitors: function(){
			if(this._progressMonitors.length > 0){
				var msg = "";
				var isFirst = true;
				for(var progressMonitorId in this._progressMonitors){
					if(this._progressMonitors[progressMonitorId].status){
						if(!isFirst)
							msg+=", "; //$NON-NLS-0$
						msg+=this._progressMonitors[progressMonitorId].status;
						isFirst = false;
					}
				}
				this.setProgressMessage(msg);
			} else {
				this.setProgressMessage("");
			}
		},
		
		_beginProgressMonitor: function(monitor){
			this._progressMonitors[monitor.progressId] = monitor;
			this._progressMonitors.length++;
			this._renderOngoingMonitors();
		},
		
		_workedProgressMonitor: function(monitor){
			this._progressMonitors[monitor.progressId] = monitor;
			this._renderOngoingMonitors();
		},
		
		_doneProgressMonitor: function(monitor){
			delete this._progressMonitors[monitor.progressId];
			this._progressMonitors.length--;
			if(monitor.status){
				this.setProgressResult(monitor.status);
			}else{				
				this._renderOngoingMonitors();
			}
		}
		
	};
	StatusReportingService.prototype.constructor = StatusReportingService;
	
	function ProgressMonitor(statusService, progressId, deferred, message){
		this.statusService = statusService;
		this.progressId = progressId;
		if(deferred){
			this.deferred = deferred;
			this.begin(message);
			var that = this;
			deferred.then(
					function(response, secondArg){
						that.done.bind(that)();
					},
					function(error, secondArg){
						that.done.bind(that)();
					});
		}
	}
	
	/**
	 * Starts the progress monitor. Message will be shown in the status area.
	 * @param {String} message
	 */
	ProgressMonitor.prototype.begin = function(message){
				this.status = message;
				this.statusService._beginProgressMonitor(this);
			};
	/**
	 * Sets the progress monitor as done. If no status is provided the message will be
	 * removed from the status.
	 * @param {String|orionError} status [optional] The error to display. Can be a simple String,
	 * or an error object from a XHR error callback, or the body of an error response 
	 * from the Orion server.
	 */
	ProgressMonitor.prototype.done = function(status){
				this.status = status;
				this.statusService._doneProgressMonitor(this);
			};
	/**
	 * Changes the message in the monitor.
	 * @param {String} message
	 */
	ProgressMonitor.prototype.worked = function(message){
				this.status = message;
				this.statusService._workedProgressMonitor(this);
			};
	
	ProgressMonitor.prototype.constructor = ProgressMonitor;

	//return module exports
	return {StatusReportingService: StatusReportingService,
			ProgressMonitor: ProgressMonitor};
});
