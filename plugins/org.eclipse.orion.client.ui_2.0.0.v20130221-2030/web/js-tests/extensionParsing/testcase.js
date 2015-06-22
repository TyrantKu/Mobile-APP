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
/*global define orion window document */

define(['require', 'orion/assert', 'orion/serviceregistry', 'orion/commands', 'orion/extensionCommands'], 
			function(require, assert, mServiceregistry, mCommands, mExtensionCommands) {
			
	/**
	 * mock services
	 */
	var serviceRegistry = new mServiceregistry.ServiceRegistry();
	new mCommands.CommandService({serviceRegistry: serviceRegistry});
	
	/**
	 * mock content types cache
	 */
	var contentTypesCache = [];
	
	/**
	 * mock items
	 */
	var item1 = {
		Name: "Foo",
		User: "John",
		Location: "/file/foo/bar/Foo",
		AlternateLocation: "/fileSystem1/foo/bar/Foo.alt"
	};
	item1.SubObject = {SecondaryLocation: "/secondary/foo/bar/Foo"};
	
	var item2 = {
		Name: "Bar",
		User: "John",
		AlternateLocation: "/fileSystem2/foo/bar/Bar.alt"
	};
	item2.SubObject = {SecondaryAlternateLocation: "http://example.com/secondary/foo/bar/Foo.Secondary"};
	
	/**
	 * helpers
	 */
	function makeInfo(validationProperty, uriTemplate) {
		var info = {};
		if (Array.isArray(validationProperty)) {
			info.validationProperties = validationProperty;
		} else {
			info.validationProperties = [validationProperty];
		}
		info.id = "orion.testData";
		info.name = "TestExtension";
		info.uriTemplate = uriTemplate;
		return info;
	}
	
	var tests = {};


	/**
	 * Test validation property, presence only.
	 */
	tests.testSimpleValidationProperty = function() {
		var validationProperty = {
			source: "Location"
		};
		var validator = mExtensionCommands._makeValidator(makeInfo(validationProperty), serviceRegistry, contentTypesCache);
		assert.equal(validator.validationFunction(item1), true);
		assert.equal(validator.validationFunction(item2), false);
	};
	
	/**
	 * Test OR in validation property.
	 */
	tests.testSimpleORValidationProperty = function() {
		var validationProperty = {
			source: "Location|AlternateLocation"
		};
		var validator = mExtensionCommands._makeValidator(makeInfo(validationProperty), serviceRegistry, contentTypesCache);
		assert.equal(validator.validationFunction(item1), true);
		assert.equal(validator.validationFunction(item2), true);
	};	
	
	/**
	 * Test nested validation property.
	 */
	tests.testNestedValidationProperty = function() {
		var validationProperty = {
			source: "SubObject:SecondaryLocation"
		};
		var validator = mExtensionCommands._makeValidator(makeInfo(validationProperty), serviceRegistry, contentTypesCache);
		assert.equal(validator.validationFunction(item1), true);
		assert.equal(validator.validationFunction(item2), false);
	};	
	
	/**
	 * Test combinations of nested properties and OR properties
	 */
	tests.testNestedORValidationProperty = function() {
		var validationProperty = {
			source: "SubObject:SecondaryLocation|AlternateLocation"
		};
		var validator = mExtensionCommands._makeValidator(makeInfo(validationProperty), serviceRegistry, contentTypesCache);
		assert.equal(validator.validationFunction(item1), true);
		assert.equal(validator.validationFunction(item2), true);
		validationProperty = {
			source: "AlternateLocation|SubObject:SecondaryLocation"
		};
		validator = mExtensionCommands._makeValidator(makeInfo(validationProperty), serviceRegistry, contentTypesCache);
		assert.equal(validator.validationFunction(item1), true);
		assert.equal(validator.validationFunction(item2), true);
		validationProperty = {
			source: "SubObject:SecondaryAlternateLocation|SubObject:SecondaryLocation"
		};
		validator = mExtensionCommands._makeValidator(makeInfo(validationProperty), serviceRegistry, contentTypesCache);
		assert.equal(validator.validationFunction(item1), true);
		assert.equal(validator.validationFunction(item2), true);
	};	
	
	/**
	 * Test properties against regular expression patterns.
	 */
	tests.testPatternMatchValidationProperty = function() {
		var validationProperty = {
			source: "SubObject:SecondaryLocation|AlternateLocation",
			match: "fileSystem1"
		};
		var validator = mExtensionCommands._makeValidator(makeInfo(validationProperty), serviceRegistry, contentTypesCache);
		assert.equal(validator.validationFunction(item1), true);
		assert.equal(validator.validationFunction(item2), false);
		validationProperty = {
			source: "Location|AlternateLocation",
			match: "/file/"
		};
		validator = mExtensionCommands._makeValidator(makeInfo(validationProperty), serviceRegistry, contentTypesCache);
		assert.equal(validator.validationFunction(item1), true);
		assert.equal(validator.validationFunction(item2), false);
		
		validationProperty.match = ".alt$";
		validator = mExtensionCommands._makeValidator(makeInfo(validationProperty), serviceRegistry, contentTypesCache);
		assert.equal(validator.validationFunction(item1), true);
		assert.equal(validator.validationFunction(item2), true);
	};
	
	tests.testVariableSubstitutions = function() {
		var validationProperty = {
			source: "SubObject:SecondaryLocation|AlternateLocation",
			match: "fileSystem1",
			variableName: "MyLocation"
		};
		var validator = mExtensionCommands._makeValidator(makeInfo(validationProperty, "{MyLocation}"), serviceRegistry, contentTypesCache);
		assert.equal(validator.getURI(item1), item1.AlternateLocation, "variableMatchPosition all");
		
		validationProperty.variableMatchPosition = "only";
		validator.itemCached = null;  // reachy.  Need to force recomputation
		assert.equal(validator.getURI(item1), "fileSystem1", "variableMatchPosition only");
		
		validationProperty.variableMatchPosition = "before";
		validator.itemCached = null;  // reachy.  Need to force recomputation
		assert.equal(validator.getURI(item1), "/", "variableMatchPosition before");
		
		validationProperty.variableMatchPosition = "after";
		validator.itemCached = null;  // reachy.  Need to force recomputation
		assert.equal(validator.getURI(item1), "/foo/bar/Foo.alt", "variableMatchPosition after");
	};
	
	tests.testVariableCaching = function() {
		var validationProperty = {
			source: "SubObject:SecondaryLocation|AlternateLocation",
			match: "fileSystem\\d*",
			variableName: "MyLocation",
			variableMatchPosition: "only"
		};
		var validator = mExtensionCommands._makeValidator(makeInfo(validationProperty, "{MyLocation}"), serviceRegistry, contentTypesCache);
		assert.equal(validator.getURI(item1), "fileSystem1", "variableMatchPosition only");
		validationProperty.variableMatchPosition = "all";
		assert.equal(validator.getURI(item1), "fileSystem1", "variableMatchPosition uses cached value for same item");
		assert.equal(validator.getURI(item2), item2.AlternateLocation, "variableMatchPosition recomputed for different item");
		assert.equal(validator.getURI(item1), item1.AlternateLocation, "variableMatchPosition is recomputed");
		
		validationProperty.variableMatchPosition = "only";  // will recompute since item is different
		assert.equal(validator.getURI(item2), "fileSystem2", "variableMatchPosition only");
	};
	
	tests.testVariableReplacements = function() {
		var validationProperty = {
			source: "AlternateLocation",
			match: ".alt$",
			variableMatchPosition: "before",
			variableName: "MyLocation",
			replacements: [{pattern: "fileSystem\\d*", replacement: "fs"}]
		};
		var validator = mExtensionCommands._makeValidator(makeInfo(validationProperty, "{MyLocation}?user={User}"), serviceRegistry, contentTypesCache);
		assert.equal(validator.getURI(item1), "/fs/foo/bar/Foo?user=John");	
		
		validationProperty.replacements = [{pattern: "fileSystem\\d*", replacement: "fs"},{pattern: "/foo"}, {pattern: "/bar", replacement: "*"}];
		validator.itemCached = null;
		assert.equal(validator.getURI(item1), "/fs*/Foo?user=John");	
		
	};
	
	tests.testVariableOverwrite = function() {
		var validationProperty = {
			source: "AlternateLocation",
			variableName: "Location"
		};
		var validator = mExtensionCommands._makeValidator(makeInfo(validationProperty, "{Location}"), serviceRegistry, contentTypesCache);
		assert.equal(validator.getURI(item1), item1.Location);		
	};
	
	return tests;
});
