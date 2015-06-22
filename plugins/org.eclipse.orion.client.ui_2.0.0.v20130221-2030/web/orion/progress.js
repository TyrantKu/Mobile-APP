/*******************************************************************************
 * @license
 * Copyright (c) 2009, 2012 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 *
 * Contributors: IBM Corporation - initial API and implementation
 *******************************************************************************/


define(['i18n!orion/nls/messages', 'require', 'orion/Deferred', 'orion/webui/littlelib', 'orion/webui/dialogs/OperationsDialog'], 
function(messages, require, Deferred, lib, mOperationsDialog) {
	
	
	function ProgressMonitorTool(progressPane, serviceRegistry){
		if(this._progressPane){
			return;
		}
		this._progressPane = lib.node(progressPane);
		this._operationsDialog = new mOperationsDialog.OperationsDialog({triggerNode: this._progressPane, serviceRegistry: serviceRegistry});
		var that = this;
		this._progressPane.addEventListener("keydown", function(evt) {  //$NON-NLS-0$
			if(evt.charOrCode === ' ' || evt.keyCode === lib.KEY.ENTER) { //$NON-NLS-0$
				that._operationsDialog.show();
			}
		});
	}
	
	ProgressMonitorTool.prototype = {
			_switchIconTo: function(iconClass) {
				if (this._lastIconClass) {
					this._progressPane.classList.remove(this._lastIconClass);
				}
				this._lastIconClass = iconClass;
				this._progressPane.classList.add(this._lastIconClass);
			},
			generateOperationsInfo: function(operations, deferreds){
				
				var operationsToDisplay = {};
				for(var i in operations){
					if(!operations[i].progressMonitor){
						operationsToDisplay[i] = operations[i];
					}
				}
				
				if(this._isEmpty(operationsToDisplay)){
					this._switchIconTo("progressPane_empty"); //$NON-NLS-0$
					this._progressPane.title = messages["Operations"]; //$NON-NLS-0$
					this._progressPane.alt = messages["Operations"]; //$NON-NLS-0$
					if(this._progressPane.hasAttribute("aria-valuetext")) { //$NON-NLS-0$
						this._progressPane.removeAttribute("aria-valuetext"); //$NON-NLS-0$
					}
					this._operationsDialog.setOperations(operationsToDisplay, deferreds);
					return;
				}
				
				var status = "";
				for(var i in operationsToDisplay){
					var operation = operationsToDisplay[i];
					if(operation.type && (operation.type==="loadstart" || operation.type==="progress")){
						status = "running"; //$NON-NLS-0$
						break;
					}
				}
				
				if(status==="" && this._lastOperation!=null){
					if(this._lastOperation.type && this._lastOperation.type==="error"){
						status=="error";
					}
				}
				switch(status){
				case "running": //$NON-NLS-0$
					this._progressPane.title = messages["Operations running"];
					this._progressPane.alt = messages['Operations running'];
					this._progressPane.setAttribute("aria-valuetext", messages['Operations running']); //$NON-NLS-0$
					this._switchIconTo("progressPane_running"); //$NON-NLS-0$
					break;
				case "warning": //$NON-NLS-0$
					this._progressPane.title = messages["Some operations finished with warning"];
					this._progressPane.alt = messages['Some operations finished with warning'];
					this._progressPane.setAttribute("aria-valuetext", messages['Some operations finished with warning']); //$NON-NLS-0$
					this._switchIconTo("progressPane_warning"); //$NON-NLS-0$
					break;
				case "error": //$NON-NLS-0$
					this._progressPane.title = messages["Some operations finished with error"];
					this._progressPane.alt = messages['Some operations finished with error'];
					this._progressPane.setAttribute("aria-valuetext", messages['Some operations finished with error']); //$NON-NLS-0$
					this._switchIconTo("progressPane_error"); //$NON-NLS-0$
					break;
				default:
					this._progressPane.title = messages["Operations"];
					this._progressPane.alt = messages['Operations'];
					if(this._progressPane.hasAttribute("aria-valuetext")) { //$NON-NLS-0$
						this._progressPane.removeAttribute("aria-valuetext"); //$NON-NLS-0$
					}
					this._switchIconTo("progressPane_operations");					 //$NON-NLS-0$
				}
				this._operationsDialog.setOperations(operationsToDisplay, deferreds);
			},
			_isEmpty: function(object){
				for(var key in object){
					return false;
				}
				return true;
			}
	};
	
	ProgressMonitorTool.prototype.constructon = ProgressMonitorTool;
	
	/**
	 * Service for tracking operations changes
	 * @class Service for tracking operations changes
	 * @name orion.progress.ProgressService
	 * @param {orion.serviceregistry.ServiceRegistry} serviceRegistry
	 * @param {orion.operationsclient.OperationsClient} operationsClient
	 */
	function ProgressService(serviceRegistry, operationsClient, progressMonitorClass){
		this._serviceRegistry = serviceRegistry;
		this._serviceRegistration = serviceRegistry.registerService("orion.page.progress", this); //$NON-NLS-0$ 
		this._operationsClient = operationsClient;
		this._operations = {};
		this._operationDeferrds = {};
		this._operationsIndex = 0;
		this._lastOperation = null;
		this._lastIconClass = null;
		this._progressMonitorClass = progressMonitorClass;
	}
	
	ProgressService.prototype = /** @lends orion.progress.ProgressService.prototype */ {
			init: function(progressPane){
				if(this._progressMonitorClass){
					return; // we have an other progress monitor implementation, we don't need to initialize our UI
				}
				this._progressMonitorTool = new ProgressMonitorTool(progressPane, this._serviceRegistry);
			},
			progress: function(deferred, operationName, progressMonitor){
				var that = this;
				var operationsIndex = this._operationsIndex++;
				if(!progressMonitor && this._progressMonitorClass){
					progressMonitor = new this._progressMonitorClass();
					progressMonitor.begin(operationName);
				}
				deferred.then(function(result){
					if(that._operations[operationsIndex]){
						var operation = that._operations[operationsIndex];
						if(operationName)
							operation.Name = operationName;
						that._lastOperation = operation;
						operation.type = "loadend";
						if(progressMonitor){
							operation.progressMonitor = progressMonitor;
						}
						that.writeOperation.bind(that)(operationsIndex, operation, deferred);
						if(!operation.Location){
							that._removeOperationFromTheList.bind(that)(operationsIndex);
						}
					}
				}, function(error){
					if(that._operations[operationsIndex]){
						var operation = that._operations[operationsIndex];
						if(operationName)
							operation.Name = operationName;
						if(progressMonitor){
							operation.progressMonitor = progressMonitor;
						}
						that._lastOperation = operation;
						operation.type = error.canceled ? "abort" : "error";
						operation.error = error; 
						that.writeOperation.bind(that)(operationsIndex, operation, deferred);
						if(!operation.Location){
							that._removeOperationFromTheList.bind(that)(operationsIndex);
						}
					}
				}, function(operation){
					if(operationName)
						operation.Name = operationName;
					if(progressMonitor){
						operation.progressMonitor = progressMonitor;
					}
					that.writeOperation.bind(that)(operationsIndex, operation, deferred);
				});
				return deferred;
			},
			removeOperation: function(operationLocation){
				var that = this;
				for(var i in this._operations){
					if(this._operations[i].Location && this._operations[i].Location===operationLocation){
						this._removeOperationFromTheList(i);
						break;
					}
				}
				that._operationsClient.removeOperation.bind(that._operationsClient)(operationLocation);
			},
			_removeOperationFromTheList: function(operationId){
				var progressMonitor = this._operations[operationId].progressMonitor;
				delete this._operations[operationId];
				delete this._operationDeferrds[operationId];
				if(progressMonitor){
					progressMonitor.done();
				}else{
					this._progressMonitorTool.generateOperationsInfo(this._operations, this._operationDeferrds); 
				}
			},
			removeCompletedOperations: function(){
				for(var i in this._operations){
					var operation = this._operations[i];
					if(operation.type && operation.type!=="loadstart" && operation.type!=="progress"){
						var progressMonitor = this._operations[i].progressMonitor;
						if(progressMonitor)
							progressMonitor.done();
						delete this._operations[i];
						delete this._operationDeferrds[i];
					}
				}
				this._progressMonitorTool.generateOperationsInfo(operations, this._operationDeferrds);
			},
			setProgressResult: function(result){
				this._serviceRegistry.getService("orion.page.message").setProgressResult(result); //$NON-NLS-0$
			},
			/**
			 * Shows a progress message until the given deferred is resolved. Returns a deferred that resolves when
			 * the operation completes.
			 * @param deferred {orion.Deferred} Deferred to track
			 * @param message {String} Message to display
			 * @returns
			 */
			showWhile: function(deferred, message){
				if(message) {
					this._serviceRegistry.getService("orion.page.message").setProgressMessage(message); //$NON-NLS-0$
				}
				var that = this;
				
				deferred.then(function(jsonResult){
					that._serviceRegistry.getService("orion.page.message").setProgressMessage(""); //$NON-NLS-0$
				}, function(jsonError){
					that.setProgressResult.bind(that)(jsonError);
					return jsonError;
				});
				return this.progress(deferred, message);
			},
			writeOperation: function(operationIndex, operation, deferred){
				this._operations[operationIndex] = operation;
				this._operationDeferrds[operationIndex] = deferred;
				if(operation.Location){
					serviceRegistry.getService("orion.core.preference").getPreferences("/operations").then(function(globalOperations){
						globalOperations.put(operation.Location, {Name: operation.Name, expires: operation.expires});
					});
				}
				if(operation.progressMonitor){
					operation.progressMonitor.progress(operation.Name);
				}else{
					this._progressMonitorTool.generateOperationsInfo(this._operations, this._operationDeferrds);
				}
			}
	};
			
	ProgressService.prototype.constructor = ProgressService;
	//return module exports
	return {ProgressService: ProgressService};
	
});
