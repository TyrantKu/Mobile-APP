/*******************************************************************************
 * @license
 * Copyright (c) 2010, 2012 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 * 
 * Contributors: IBM Corporation - initial API and implementation
 ******************************************************************************/

/*jslint forin:true devel:true*/
/*global define document*/

define(['i18n!orion/nls/messages', 'orion/webui/littlelib'], function(messages, lib) {

	/**
	 * Constructs a new TableTree with the given options.
	 * 
	 * @param options 
	 * @name orion.treetable.TableTree 
	 * @class Generates an HTML table where one of the columns is indented according to depth of children.
	 * <p>Clients must supply a model that generates children items, and a renderer can be supplied which
	 * generates the HTML table row for each child. Custom rendering allows clients to use checkboxes,
	 * images, links, etc. to describe each  element in the tree.  Renderers handle all clicks and other
	 * behavior via their supplied row content.</p>
	 * 
	 * <p>The table tree parent can be specified by id or DOM node.</p>
	 * 
	 * <p>The tree provides API for the client to programmatically expand and collapse
	 * nodes, based on the client renderer's definition of how that is done (click on icon, etc.).
	 * The tree will manage the hiding and showing of child DOM elements and proper indent</p>
	 * 
	 * The model must implement:
	 * <ul>
	 *   <li>getRoot(onItem)</li>
	 *   <li>getChildren(parentItem, onComplete)</li>
	 *   <li>getId(item)  // must be a valid DOM id</li>
	 * </ul>
	 * 
	 * Renderers must implement:
	 * <ul>
	 *   <li>initTable(tableNode) // set up table attributes and a header if desired</li>
	 *   <li>render(item, tr) // generate tds for the row</li>
	 *   <li>labelColumnIndex() // 0 based index of which td contains the primary label which will be indented</li>
	 *   <li>rowsChanged // optional, perform any work (such as styling) that should happen after the row content changes</li>
	 *   <li>updateExpandVisuals(row, isExpanded) // update any expand/collapse visuals for the row based on the specified state</li>
	 * </ul>
	 */
	function TableTree (options) {
		this._init(options);
	}
	TableTree.prototype = /** @lends orion.treetable.TableTree.prototype */ {
		_init: function(options) {
			var parent = options.parent;
			var tree = this;
			parent = lib.node(parent);
			if (!parent) { throw messages["no parent"]; }
			if (!options.model) { throw messages["no tree model"]; }
			if (!options.renderer) { throw messages["no renderer"]; }
			this._parent = parent;
			this._treeModel = options.model;
			this._renderer = options.renderer;
			this._showRoot = options.showRoot === undefined ? false : options.showRoot;
			this._indent = options.indent === undefined ? 16 : options.indent;
			this._onCollapse = options.onCollapse;
			this._labelColumnIndex = options.labelColumnIndex === undefined ? 0 : options.labelColumnIndex;
			this._id = options.id === undefined ? "treetable" : options.id; //$NON-NLS-0$
			this._tableStyle = options.tableStyle;
			this._tableElement = options.tableElement || "table"; //$NON-NLS-0$
			this._tableBodyElement = options.tableBodyElement || "tbody"; //$NON-NLS-0$
			this._tableRowElement = options.tableRowElement || "tr"; //$NON-NLS-0$
			
			// Generate the table
			this._root = this._treeModel.getRoot(function (root) {
				if (tree._showRoot) {
					root._depth = 0;
					tree._generate([root], 0);
				}
				else {
					tree._treeModel.getChildren(root, function(children) {
						tree._generate(children, 0);
					});
				}
			});
		},
		
		_generate: function(children, indentLevel) {
			lib.empty(this._parent);
			var table = document.createElement(this._tableElement); //$NON-NLS-0$
			table.id = this._id;
			if (this._tableStyle) {
				table.classList.add(this._tableStyle);
			}
			this._renderer.initTable(table, this);
			this._bodyElement = document.createElement(this._tableBodyElement); //$NON-NLS-0$
			this._bodyElement.id = this._id+"tbody"; //$NON-NLS-0$
			this._generateChildren(children, indentLevel); //$NON-NLS-0$
			table.appendChild(this._bodyElement);
			this._parent.appendChild(table);
			this._rowsChanged();
		},
		
		_generateChildren: function(children, indentLevel, referenceNode) {
			for (var i=0; i<children.length; i++) {
				var row = document.createElement(this._tableRowElement); //$NON-NLS-0$
				row.id = this._treeModel.getId(children[i]);
				row._depth = indentLevel;
				// This is a perf problem and potential leak because we're bashing a dom node with
				// a javascript object.  (Whereas above we are using simple numbers/strings). 
				// We should consider an item map.
				row._item = children[i];
				this._renderer.render(children[i], row);
				// generate an indent
				var indent = this._indent * indentLevel;
				row.childNodes[this._labelColumnIndex].style.paddingLeft = indent +"px";  //$NON-NLS-0$
				if (referenceNode) {
					this._bodyElement.insertBefore(row, referenceNode.nextSibling);
					if (referenceNode) { //$NON-NLS-0$
						referenceNode = row;
					}
				} else {
					this._bodyElement.appendChild(row);
				}
			}
		},
		
		_rowsChanged: function() {
			// notify the renderer if it has implemented the function
			if (this._renderer.rowsChanged) {
				this._renderer.rowsChanged();
			}
		},
		
		getSelected: function() {
			return this._renderer.getSelected();
		},
		
		refresh: function(item, children, /* optional */ forceExpand) {
			var parentId = this._treeModel.getId(item);
			var tree;
			if (parentId === this._id) {  // root of tree
				this._removeChildRows(parentId);
				this._generateChildren(children, 0);
				this._rowsChanged();
			} else {  // node in the tree
				var row = lib.node(parentId);
				if (row) {
					// if it is showing children, refresh what is showing
					row._item = item;
					// If the row should be expanded
					if (row && (forceExpand || row._expanded)) {
						row._expanded = true;
						this._removeChildRows(parentId);
						this._renderer.updateExpandVisuals(row, true);
						if(children){
							this._generateChildren(children, row._depth+1, row); //$NON-NLS-0$
							this._rowsChanged();
						} else {
							tree = this;
							children = this._treeModel.getChildren(row._item, function(children) {
								tree._generateChildren(children, row._depth+1, row); //$NON-NLS-0$
								tree._rowsChanged();
							});
						}
					} else {
						this._renderer.updateExpandVisuals(row, false);
					}
				} else {
					// the item wasn't found.  We could refresh the root here, but for now
					// let's log it to figure out why.
					console.log(messages["could not find table row "] + parentId);
				}
			}
		},
		
		getItem: function(itemOrId) {  // a dom node, a dom id, or the item
			var node = lib.node(itemOrId);
			if (node && node._item) {
				return node._item;
			}
			return itemOrId;  // return what we were given
		},
		
		toggle: function(id) {
			var row = lib.node(id);
			if (row) {
				if (row._expanded) {
					this.collapse(id);
					this._renderer.updateExpandVisuals(row, false);
				}
				else {
					this.expand(id);
					this._renderer.updateExpandVisuals(row, true);
				}
			}
		},
		
		isExpanded: function(id) {
			var row =lib.node(id);
			if (row) {
				return row._expanded;
			}
			return false;
		},
		
		expand: function(itemOrId , postExpandFunc , args) {
			var id = typeof(itemOrId) === "string" ? itemOrId : this._treeModel.getId(itemOrId); //$NON-NLS-0$
			var row = lib.node(id);
			if (row) {
				if (row._expanded) {
					return;
				}
				row._expanded = true;
				var tree = this;
				this._renderer.updateExpandVisuals(row, true);
				this._treeModel.getChildren(row._item, function(children) {
					tree._generateChildren(children, row._depth+1, row); //$NON-NLS-0$
					tree._rowsChanged();
					if (postExpandFunc) {
						postExpandFunc.apply(tree, args);
					}
				});
			}
		}, 
		
		_removeChildRows: function(parentId) {
			// true if we are removing directly from table
			var foundParent = parentId === this._id;
			var stop = false;
			var parentDepth = -1;
			var toRemove = [];
			var rows = lib.$$array(".treeTableRow", this._parent); //$NON-NLS-0$
			for (var i=0; i < rows.length; i++) {
				var row = rows[i];
				if (stop) {
					break;
				}
				if (foundParent) {
					if (row._depth > parentDepth) {
						toRemove.push(row);
					}
					else {
						stop = true;  // we reached a sibling to our parent
					}
				} else {
					if (row.id === parentId) {
						foundParent = true;
						parentDepth = row._depth;
					}
				}
			}
			for (var j=0; j<toRemove.length; j++) {
				var child = toRemove[j];
				child.parentNode.removeChild(child);
			}
		},
		
		collapse: function(itemOrId) {
			var id = typeof(itemOrId) === "string" ? itemOrId : this._treeModel.getId(itemOrId); //$NON-NLS-0$
			var row = lib.node(id);
			if (row) {
				if (!row._expanded) {
					return;
				}
				row._expanded = false;
				this._renderer.updateExpandVisuals(row, false);
				this._removeChildRows(id);
				this._rowsChanged();
			}
			if(this._onCollapse){
				this._onCollapse(row._item);
			}
		}
	};  // end prototype
	TableTree.prototype.constructor = TableTree;
	//return module exports
	return {TableTree: TableTree};
});
