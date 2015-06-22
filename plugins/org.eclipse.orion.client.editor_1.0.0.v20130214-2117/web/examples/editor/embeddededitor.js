/*******************************************************************************
 * @license
 * Copyright (c) 2010, 2012 IBM Corporation and others.
 * Copyright (c) 2012 VMware, Inc.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 *
 * Contributors: 
 *     IBM Corporation - initial API and implementation
 *     Andrew Eisenberg - rename jsContentAssist to jsTemplateContentAssist
 *******************************************************************************/
/*global window define*/
/*jslint browser:true devel:true*/

define([
	"require", 
	"orion/editor/textView",
	"orion/editor/keyBinding",
	"examples/editor/textStyler",
	"orion/editor/textMateStyler",
	"orion/editor/htmlGrammar",
	"orion/editor/editor",
	"orion/editor/editorFeatures",
	"orion/editor/contentAssist",
	"orion/editor/jsTemplateContentAssist",
	"orion/editor/cssContentAssist"],

function(require, mTextView, mKeyBinding, mTextStyler, mTextMateStyler, mHtmlGrammar, mEditor, mEditorFeatures, mContentAssist, mJSTemplateContentAssist, mCSSContentAssist){
	
	var editorDomNode = document.getElementById("editor");
	
	var textViewFactory = function() {
		return new mTextView.TextView({
			parent: editorDomNode,
			tabSize: 4
		});
	};

	var contentAssist;
	var contentAssistFactory = {
		createContentAssistMode: function(editor) {
			contentAssist = new mContentAssist.ContentAssist(editor.getTextView());
			var contentAssistWidget = new mContentAssist.ContentAssistWidget(contentAssist);
			return new mContentAssist.ContentAssistMode(contentAssist, contentAssistWidget);
		}
	};
	var cssContentAssistProvider = new mCSSContentAssist.CssContentAssistProvider();
	var jsTemplateContentAssistProvider = new mJSTemplateContentAssist.JSTemplateContentAssistProvider();
	
	// Canned highlighters for js, java, and css. Grammar-based highlighter for html
	var syntaxHighlighter = {
		styler: null, 
		
		highlight: function(fileName, editor) {
			if (this.styler) {
				this.styler.destroy();
				this.styler = null;
			}
			if (fileName) {
				var splits = fileName.split(".");
				var extension = splits.pop().toLowerCase();
				var textView = editor.getTextView();
				var annotationModel = editor.getAnnotationModel();
				if (splits.length > 0) {
					switch(extension) {
						case "js":
						case "java":
						case "css":
							this.styler = new mTextStyler.TextStyler(textView, extension, annotationModel);
							break;
						case "html":
							this.styler = new mTextMateStyler.TextMateStyler(textView, new mHtmlGrammar.HtmlGrammar());
							break;
					}
				}
			}
		}
	};
	
	var annotationFactory = new mEditorFeatures.AnnotationFactory();

	function save(editor) {
		editor.setInput(null, null, null, true);
		setTimeout(function() {
			window.alert("Save hook.");
		}, 0);
	}
	
	var keyBindingFactory = function(editor, keyModeStack, undoStack, contentAssist) {
		
		// Create keybindings for generic editing
		var genericBindings = new mEditorFeatures.TextActions(editor, undoStack);
		keyModeStack.push(genericBindings);
		
		// create keybindings for source editing
		var codeBindings = new mEditorFeatures.SourceCodeActions(editor, undoStack, contentAssist);
		keyModeStack.push(codeBindings);
		
		// save binding
		editor.getTextView().setKeyBinding(new mKeyBinding.KeyBinding("s", true), "save");
		editor.getTextView().setAction("save", function(){
				save(editor);
				return true;
		});
		
		// speaking of save...
		document.getElementById("save").onclick = function() {save(editor);};

	};
		
	var dirtyIndicator = "";
	var status = "";
	
	var statusReporter = function(message, isError) {
		if (isError) {
			status =  "ERROR: " + message;
		} else {
			status = message;
		}
		document.getElementById("status").textContent = dirtyIndicator + status;
	};
	
	var editor = new mEditor.Editor({
		textViewFactory: textViewFactory,
		undoStackFactory: new mEditorFeatures.UndoFactory(),
		annotationFactory: annotationFactory,
		lineNumberRulerFactory: new mEditorFeatures.LineNumberRulerFactory(),
		contentAssistFactory: contentAssistFactory,
		keyBindingFactory: keyBindingFactory, 
		statusReporter: statusReporter,
		domNode: editorDomNode
	});
		
	editor.addEventListener("DirtyChanged", function(evt) {
		if (editor.isDirty()) {
			dirtyIndicator = "*";
		} else {
			dirtyIndicator = "";
		}
		document.getElementById("status").textContent = dirtyIndicator + status;
	});
	
	editor.installTextView();
	// if there is a mechanism to change which file is being viewed, this code would be run each time it changed.
	var contentName = "sample.js";  // for example, a file name, something the user recognizes as the content.
	var initialContent = "window.alert('this is some javascript code');  // try pasting in some real code";
	editor.setInput(contentName, null, initialContent);
	syntaxHighlighter.highlight(contentName, editor);
	contentAssist.addEventListener("Activating", function() {
		if (/\.css$/.test(contentName)) {
			contentAssist.setProviders([cssContentAssistProvider]);
		} else if (/\.js$/.test(contentName)) {
			contentAssist.setProviders([jsTemplateContentAssistProvider]);
		}
	});
	// end of code to run when content changes.
	
	window.onbeforeunload = function() {
		if (editor.isDirty()) {
			 return "There are unsaved changes.";
		}
	};
});
