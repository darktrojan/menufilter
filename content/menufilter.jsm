/* exported EXPORTED_SYMBOLS, MenuFilter */
const EXPORTED_SYMBOLS = ["MenuFilter"];
/* globals Components, XPCOMUtils, TextDecoder */
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const KEY_PROFILEDIR = "ProfD";
const FILE_DATABASE = "menufilter.json";

/* globals FileUtils, OS, DeferredSave */
XPCOMUtils.defineLazyModuleGetter(this, "FileUtils", "resource://gre/modules/FileUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "OS", "resource://gre/modules/osfile.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "DeferredSave", "resource://gre/modules/DeferredSave.jsm");

let jsonFile = FileUtils.getFile(KEY_PROFILEDIR, [FILE_DATABASE], true);
let _list = null;
let _saver = new DeferredSave(jsonFile.path, function() {
	return JSON.stringify(_list);
});
let listener = null;

function ensureList() {
	return new Promise(function(resolve) {
		if (_list !== null) {
			resolve(_list);
		} else {
			OS.File.exists(jsonFile.path).then(function(aExists) {
				if (aExists) {
					OS.File.read(jsonFile.path).then(function(aArray) {
						let decoder = new TextDecoder();
						let text = decoder.decode(aArray);
						_list = JSON.parse(text);
						resolve(_list);
					});
				} else {
					_list = {};
					resolve(_list);
				}
			});
		}
	});
}

let _hiddenItems = {
	add: function(aWindowURL, aMenuID, aIDs) {
		if (!Array.isArray(aIDs)) {
			if (typeof aIDs == "string") {
				aIDs = [aIDs];
			} else {
				Components.utils.reportError("Argument should be a string or an array.");
				return;
			}
		}
		return this.getList(aWindowURL, aMenuID).then(function(aList) {
			for (let id of aIDs) {
				if (aList.indexOf(id) < 0) {
					aList.push(id);
				}
			}
			if (!(aWindowURL in _list)) {
				_list[aWindowURL] = {};
			}
			if (!(aMenuID in _list[aWindowURL])) {
				_list[aWindowURL][aMenuID] = aList;
			}
			listener();
			_saver.saveChanges();
		}).then(null, Components.utils.reportError);
	},
	remove: function(aWindowURL, aMenuID, aIDs) {
		if (!Array.isArray(aIDs)) {
			if (typeof aIDs == "string") {
				aIDs = [aIDs];
			} else {
				Components.utils.reportError("Argument should be a string or an array.");
				return;
			}
		}
		return this.getList(aWindowURL, aMenuID).then(function(aList) {
			for (let id of aIDs) {
				let index = aList.indexOf(id);
				if (index >= 0) {
					aList.splice(index, 1);
				}
			}
			listener();
			_saver.saveChanges();
		}).then(null, Components.utils.reportError);
	},
	getList: function(aWindowURL, aMenuID) {
		return ensureList().then(function(aList) {
			if (aWindowURL) {
				if (aWindowURL in aList) {
					if (aMenuID) {
						if (aMenuID in aList[aWindowURL]) {
							return aList[aWindowURL][aMenuID];
						}
						return [];
					}
					return aList[aWindowURL];
				} else {
					if (aMenuID) {
						return [];
					}
					return {};
				}
			}
			return aList;
		});
	},
	registerListener: function(aListener) {
		listener = aListener;
	}
};

let MenuFilter = {
	ensureItemsHaveIDs: function(aMenu) {
		let i = 1;
		for (let menuitem of aMenu.children) {
			if (menuitem.classList.contains("bookmark-item") &&
					!menuitem.id.startsWith("BMB_") && !menuitem.hasAttribute("query")) {
				break;
			}
			if (menuitem.getAttribute("type") == "radio") {
				break;
			}
			if (!menuitem.id) {
				if (menuitem.localName == "menuseparator") {
					let previous = menuitem.previousElementSibling;
					menuitem.id = "menufilter-after-" + previous.id;
				} else if (menuitem.label || menuitem.hasAttribute("label")) {
					let label = menuitem.label || menuitem.getAttribute("label");
					menuitem.id = "menufilter-" + label.replace(/\W/g, "-");
				} else {
					menuitem.id = "menufilter-item-" + i++;
				}
			}
		}
	},
	hiddenItems: _hiddenItems,
	osXSpecialItems: [
		"menu_FileQuitSeparator", "menu_FileQuitItem", "menu_PrefsSeparator", "menu_preferences",
		"aboutSeparator", "aboutName", "menu_mac_services", "menu_mac_hide_app",
		"menu_mac_hide_others", "menu_mac_show_all", "checkForUpdates"
	]
};
