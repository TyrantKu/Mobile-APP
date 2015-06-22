/*******************************************************************************
 * @license
 * Copyright (c) 2012 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 * 
 * Contributors: Anton McConville - IBM Corporation - initial API and implementation
 ******************************************************************************/
/*global window console define localStorage*/
/*jslint browser:true sub:true*/

/* This SettingsContainer widget manages a left and right side. The left is for choosing a 
   category, the right shows the resulting HTML for that category. */

define(['i18n!orion/settings/nls/messages', 'require', 'orion/globalCommands',
		'orion/PageUtil', 'orion/webui/littlelib', 'orion/objects', 'orion/URITemplate', 
		'orion/widgets/themes/ThemeBuilder', 
		'orion/settings/ui/PluginSettings', 
		'orion/widgets/themes/editor/ThemeData', 
		'orion/widgets/themes/container/ThemeData', 
		'orion/widgets/settings/SplitSelectionLayout',
		'orion/widgets/plugin/PluginList',
		'orion/widgets/settings/UserSettings',
		'orion/widgets/settings/InputBuilder'
		], function(messages, require, mGlobalCommands, PageUtil, lib, objects, URITemplate, 
			ThemeBuilder, SettingsList, editorThemeData, containerThemeData, SplitSelectionLayout, PluginList, UserSettings, InputBuilder) {

	/**
	 * @param {Object} options
	 * @param {DomNode} node
	 */
	var superPrototype = SplitSelectionLayout.prototype;
	function SettingsContainer(options, node) {
		SplitSelectionLayout.apply(this, arguments);

		this.settingsCategories = [
			{
				id: "userSettings", //$NON-NLS-0$
				textContent: messages["User Profile"],
				show: this.showUserSettings
			},
			{
				id: "themeBuilder", //$NON-NLS-0$
				textContent: 'UI Theme', // messages["Themes"],
				show: this.showThemeBuilder
			},
			{
				id: "editorThemeBuilder", //$NON-NLS-0$
				textContent: 'Editor Theme', // messages["Themes"],
				show: this.showEditorThemeBuilder
			},
			{
				id: "plugins", //$NON-NLS-0$
				textContent: messages["Plugins"],
				show: this.showPlugins
			}];
		this.settingsCategories.forEach(function(item) {
			item.show = item.show.bind(this, item.id);
		}.bind(this));

		// Add extension categories
		this.settingsRegistry.getCategories().sort().forEach(function(category, i) {
			this.settingsCategories.push({
				id: category,
				textContent: messages[category] || category,
				show: this.showPluginSettings.bind(this, category)
			});
		}.bind(this));
	}
	SettingsContainer.prototype = Object.create(SplitSelectionLayout.prototype);
	objects.mixin(SettingsContainer.prototype, {
		show: function() {

			this.itemToIndexMap = {};
			this.toolbar = lib.node( this.pageActions );
			this.manageDefaultData();
			// TODO revisit
			// hack/workaround.  We may still be initializing the settings asynchronously in manageDefaultData, so we do not want
			// to build the UI until there are settings to be found there.
			window.setTimeout(function() {
				this.drawUserInterface();
				this.inputBuilder = new InputBuilder( this.preferences );
			}.bind(this), 100);
			window.addEventListener("hashchange", this.processHash.bind(this)); //$NON-NLS-0$
			
			mGlobalCommands.setPageTarget({task: 'Settings'});
		},
		
		processHash: function() {
			var pageParams = PageUtil.matchResourceParameters();
			
			var container = this;
			
			this.preferences.getPreferences('/settingsContainer', 2).then(function(prefs){

				var selection = prefs.get( 'selection' );

				var category = pageParams.category || selection; //$NON-NLS-0$

				if(container.selectedCategory){
					if( container.selectedCategory.id === category){
						//No need to reselect the category
						return;
					}
				}

				container.showByCategory(category);
				
			} );
			
			window.setTimeout(function() {this.commandService.processURL(window.location.href);}.bind(this), 0);
		},
		
		showThemeBuilder: function(id){
		
			this.selectCategory(id);
			
			this.updateToolbar(id);
		
			if(this.themeWidget) {
				this.themeWidget.destroy();
			}
			
			var containerTheme = new containerThemeData.ThemeData();
		
			this.themeWidget = new ThemeBuilder({ commandService: this.commandService, preferences: this.preferences, themeData: containerTheme });
			
			lib.empty(this.table);

			var themeNode = document.createElement('div'); //$NON-NLS-0$
			this.table.appendChild(themeNode);

			this.themeWidget.renderData( themeNode, 'INITIALIZE' );
		},
		
		showEditorThemeBuilder: function(id){
		
			this.selectCategory(id);
			
			this.updateToolbar(id);
		
			if(this.editorThemeWidget) {
				this.editorThemeWidget.destroy();
			}
			
			var editorTheme = new editorThemeData.ThemeData();
		
			this.editorThemeWidget = new ThemeBuilder({ commandService: this.commandService, preferences: this.preferences, themeData: editorTheme });
			
			var command = { name:'Import', tip:'Import a theme', id:0, callback: editorTheme.importTheme.bind(editorTheme) };
			
			this.editorThemeWidget.addAdditionalCommand( command );
			
			lib.empty(this.table);

			var themeNode = document.createElement('div'); //$NON-NLS-0$
			this.table.appendChild(themeNode);

			this.editorThemeWidget.renderData( themeNode, 'INITIALIZE' );
		},
		
		showUserSettings: function(id){
		
//			var td = this.preferences.getPreferences('/settings', 2).then( function(prefs){		 //$NON-NLS-0$
//				var navigate = prefs.get(messages["JavaScript Editor"]);
//			} );

			this.selectCategory(id);

			lib.empty(this.table);

			if (this.userWidget) {
				this.userWidget.destroy();
			}

			this.updateToolbar(id);
			
			var userNode = document.createElement('div'); //$NON-NLS-0$
			this.table.appendChild(userNode);

			this.userWidget = new UserSettings({
				registry: this.registry,
				settings: this.settingsCore,
				preferences: this.preferences,
				statusService: this.preferencesStatusService,
				dialogService: this.preferenceDialogService,
				commandService: this.commandService,
				userClient: this.userClient
			}, userNode);
			
			this.userWidget.show();
		},
		
		initPlugins: function(id){
			lib.empty(this.table);

			if (this.pluginWidget) {
				this.pluginWidget.destroy();
			}

			var pluginNode = document.createElement('div');
			this.table.appendChild(pluginNode);

			this.pluginWidget = new PluginList({
				settings: this.settingsCore,
				preferences: this.preferences,
				statusService: this.preferencesStatusService,
				dialogService: this.preferenceDialogService,
				commandService: this.commandService,
				registry: this.registry
//				toolbarID: "pageActions" //$NON-NLS-0$
			}, pluginNode);
			
			this.pluginWidget.show();
		},

		initPluginSettings: function(category) {
			function settingsCompare(a, b) {
				var nameA = a.getName(), nameB = b.getName();
				if (typeof nameA === 'string' && typeof nameB === 'string') {
					return nameA.localeCompare(nameB);
				}
				return a.getPid().localeCompare(b.getPid());
			}

			lib.empty(this.table);

			if (this.pluginSettingsWidget) {
				this.pluginSettingsWidget.destroy();
			}

			this.pluginSettingsWidget = new SettingsList({
				parent: this.table,
				serviceRegistry: this.registry,
				settings: this.settingsRegistry.getSettings(category).sort(settingsCompare),
				title: messages[category] || category
			});
		},

/*	showPlugins - iterates over the plugin array, reads
	meta-data and creates a dom entry for each plugin.
	
	This HTML structure is a special case - the other 
	settings cases should follow more of the JSEditor
	pattern. */

		showPlugins: function(id) {

			this.selectCategory(id);

			this.initPlugins(id);
		},

		showPluginSettings: function(category) {
			var id = category;
			this.selectCategory(id);

			this.initPluginSettings(category);
		},
		
		selectCategory: function(id) {
			this.preferences.getPreferences('/settingsContainer', 2).then(function(prefs){
				prefs.put( 'selection', id );
			} );

			superPrototype.selectCategory.apply(this, arguments);

			var params = PageUtil.matchResourceParameters();
			if (params.category !== id) {
				params.category = id;
				delete params.resource;
				window.location = new URITemplate("#,{params*}").expand({ //$NON-NLS-0$
					params: params
				});
			}
		},

		showByCategory: function(id) {
			
			this.updateToolbar(id);

			var isDefaultCategory = this.settingsCategories.some(function(category) {
				if (category.id === id) {
					category.show();
					return true;
				}
			});

			if (!isDefaultCategory) {
				this.selectCategory(id);
			}
		},

		addCategory: function(category) {
			category['class'] = (category['class'] || '') + ' navbar-item'; //$NON-NLS-1$ //$NON-NLS-0$
			category.role = "tab";
			category.tabindex = -1;
			category["aria-selected"] = "false"; //$NON-NLS-1$ //$NON-NLS-0$
			category.onclick = category.show;
			superPrototype.addCategory.apply(this, arguments);
		},

		addCategories: function() {
			var self = this;
			this.settingsCategories.forEach(function(category, i) {
				self.addCategory(category);
			});
		},

		drawUserInterface: function(settings) {

			superPrototype.drawUserInterface.apply(this, arguments);

			this.addCategories();

			this.processHash();

		},
		
		handleError: function( error ){
			console.log( error );
		},

		manageDefaultData: function() {
		
			this.preferences.getPreferences('/settingsContainer', 2).then(function(prefs){
				
				var selection = prefs.get( 'selection' );
				
				if (!selection) {
					prefs.put( 'selection', 'userSettings' );
				}
			} );
		}
	});
	return SettingsContainer;
});
