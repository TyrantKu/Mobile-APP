/*
    Copyright (c) 2004-2010, The Dojo Foundation All Rights Reserved.
    Available via Academic Free License >= 2.1 OR the modified BSD license.
    see: http://dojotoolkit.org/license for details
*/
var dojo = dojo || {}
dojo.optimizer = dojo.optimizer || {}
    
dojo.optimizer.Analyzer = function() {}

dojo.optimizer.Analyzer.prototype = {
	_getDependencies: function(moduleContents) {
		var dependencyRegex = /dojo\.(require|provide)\s*\([\w\W]*?\)/mg;
		var result;
		var dependencies = [];
		
		while ((result = dependencyRegex.exec(moduleContents)) != null) {
			dependencies.push(result[0]);
		}
		
		return dependencies;
	},
	
	_getLocalizationDependencies: function(moduleContents) {
		var localizationRegex = /dojo\.(requireLocalization)\([\w\W]*?\)/mg;
		var result;
		var localizations = [];
		
		while ((result = localizationRegex.exec(moduleContents)) != null) {
			localizations.push(result[0]);
		}
		
		return localizations;
	},
	
	_moduleStarted: function(id) {
		var module = this.moduleMap.get(id);
		if (module !== undefined) {
			this.dependencyStack.push(id);
		} else {
			print("Unable to locate dependant for ["+id+"");
		}
	},
	
	_moduleLoading: function(id) {
		var module = this.moduleMap.get(id);
		if (module === undefined) {
			var uri = dojo._getModuleSymbols(id).join("/") + '.js';
			var module = new dojo.optimizer.Module(id, uri);
			this.moduleMap.add(id, module);
		}
		if (this.dependencyStack.length > 0) {
			var parentId = this.dependencyStack[this.dependencyStack.length - 1];
			var parent = this.moduleMap.get(parentId);
			parent.addDependency(id);
			module.addDependent(parent.id);
		}
	},
	
	_moduleEnded: function(id) {
		var module = this.moduleMap.get(id);
		if (module !== undefined) {
			this.dependencyStack.pop();
		} else {
			print("Unable to locate dependant for ["+id+"");
		}
	},
	
	_buildDependencyList: function(module, dependencyList, exclude, seen) {
		var addToList = false;
		if (seen[module.id] === undefined) {
			seen[module.id] = module.id;
			addToList = true;
		}
		for (var i = 0; i < module.dependencies.length; i++) {
			var excludeModule = false;
			var moduleDependency = this.moduleMap.get(module.dependencies[i]);
			for (var j = 0; j < exclude.length; j++) {
				if (moduleDependency.id === exclude[j]) {
					excludeModule = true;
					break;
				}
			}
			if (!excludeModule && seen[moduleDependency.id] === undefined) {
				this._buildDependencyList(moduleDependency, dependencyList, exclude, seen);
			}
		}
		if (addToList) {
			dependencyList.push(dojo.baseUrl+module.uri);
		}
	},
	
	_analyze: function(modules) {
		this.dependencyStack = [];
		this.localizationList = [];
		this.moduleMap = new dojo.optimizer.Map();
		var scope = this;
		var require = dojo.require;
		
		dojo.require = function(moduleName, omitModuleCheck) {
			scope._moduleLoading(moduleName);
			require.apply(dojo, arguments);
		};
		
		dojo.requireLocalization = function(modulename, bundlename, locale, availableFlatLocales) {
			var syms = dojo._getModuleSymbols(modulename);
			var modpath = syms.concat("nls").join("/");
			var bundlepackage = [modulename, "nls", bundlename].join(".");
			var add = true;
			for (var i = 0; i < scope.localizationList.length; i++) {
				if (scope.localizationList[i].bundlepackage === bundlepackage) {
					add = false;
					break;
				}
			}
			if (add === true) {
				scope.localizationList.push({bundlepackage: bundlepackage, modpath: dojo.baseUrl+modpath, bundlename: bundlename});
			}
		};
		
		var oldLoadJS = loadJS;
		
		loadJS = function(module) {
			var provideRegex = /dojo\.provide\s*\(\s*(("|')([\w\W]*?)("|'))\s*\)/;
			var moduleContents = readText(module).replace( /(\/\*([\s\S]*?)\*\/|\/\/(.*)$)/mg , "");
			var id = null;
			
	 		var provide = provideRegex.exec(moduleContents);
	 		
	 		if (provide !== null) {
	 			id = provide[3];
	 		}
	 		else {
				throw new Error("Failed to locate provide statement for module ["+module+"]");
			}
			var dependencies = scope._getDependencies(moduleContents);
			scope._moduleStarted(id);
			eval(dependencies.join(";"));
			scope._moduleEnded(id);
			var localizations = scope._getLocalizationDependencies(moduleContents);
			eval(localizations.join(";"));
		};
		
		for (var i = 0; i < modules.length; i++) {
			dojo.require(modules[i], null, true);
		}

		loadJS = oldLoadJS;
	},
	
	_scanForCircularDependencies: function(module, check) {
        check.push(module.id);
		for (var i = 0; i < module.dependencies.length; i++) {
			var moduleDependency = this.moduleMap.get(module.dependencies[i]);
            if (moduleDependency.scanned !== undefined) {
                continue;
            }
            var found = false;
            var dup;
            for (var j = 0; j < check.length; j++) {
                if (check[j] === moduleDependency.id) {
                    found = true;
                    dup = moduleDependency.id;
                    break;
                }
            }
            if (found) {
                var msg = "Circular dependency found : ";
                for (j = 0; j < check.length; j++) {
                    msg += check[j];
                    msg += "->";
                }
                print(msg+dup);
            } else {
                this._scanForCircularDependencies(moduleDependency, check);
            }
		}
        module.scanned = true;
        check.pop();
	},
	
	getDependencyList: function(modules, exclude, bypassAnalysis) {
		if (bypassAnalysis === undefined || bypassAnalysis === false) {
			this._analyze(modules);
		}
		var seen = {};
		var dependencyList = [];
		for (var i = 0; i < modules.length; i++) {
			var module = this.moduleMap.get(modules[i]);
			this._buildDependencyList(module, dependencyList, exclude, seen);
			this._scanForCircularDependencies(module, []);
		}
		return dependencyList;
	},
	
	calculateChecksum: function(modules, exclude, bypassAnalysis) {
		var dependencyList = this.getDependencyList(modules, exclude, bypassAnalysis);
		dojo.require("dojox.encoding.digests.MD5");
		
		var js = "";
		
		for (var i = 0; i < dependencyList.length; i++) {
			js += readText(dependencyList[i]);
			
		}
		var ded = dojox.encoding.digests;
		return ded.MD5(js, ded.outputTypes.Hex);
	},
	
	getLocalizations: function(modules, bypassAnalysis) {
		if (bypassAnalysis === undefined || bypassAnalysis === false) {
			this._analyze(modules);
		}
		return this.localizationList;
	},
	
	getAnalysisData: function(modules, exclude, skipCheckSum) {
		var dependencyList = this.getDependencyList(modules, exclude);
		var checksum = null;
		if (skipCheckSum === undefined || skipCheckSum === false) {
			checksum = this.calculateChecksum(modules, exclude, true);
		}
		var localizations = this.getLocalizations(modules, true);
		return ({dependencyList: dependencyList, checksum: checksum, localizations: localizations});
	}
}

