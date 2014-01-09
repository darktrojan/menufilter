const EXPORTED_SYMBOLS = ["MenuFilter"];
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

const KEY_PROFILEDIR = "ProfD";
const FILE_DATABASE = "menufilter.json";

XPCOMUtils.defineLazyModuleGetter(this, "FileUtils", "resource://gre/modules/FileUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Promise", "resource://gre/modules/Promise.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "OS", "resource://gre/modules/osfile.jsm");
if (Services.vc.compare(Services.appinfo.platformVersion, "25.0") < 0) {
	XPCOMUtils.defineLazyModuleGetter(this, "DeferredSave", "chrome://menufilter/content/DeferredSave.jsm");
} else {
	XPCOMUtils.defineLazyModuleGetter(this, "DeferredSave", "resource://gre/modules/DeferredSave.jsm");
}

let jsonFile = FileUtils.getFile(KEY_PROFILEDIR, [FILE_DATABASE], true);
let _list = null;
let _saver = new DeferredSave(jsonFile.path, function() {
	return JSON.stringify(_list);
});
let listener = null;

function ensureList() {
	let deferred = Promise.defer();

	if (_list != null) {
		deferred.resolve(_list);
	} else {
		OS.File.exists(jsonFile.path).then(function(aExists) {
			if (aExists) {
				OS.File.read(jsonFile.path).then(function(aArray) {
					let decoder = new TextDecoder();
					let text = decoder.decode(aArray);
					_list = JSON.parse(text);
					deferred.resolve(_list);
				});
			} else {
				_list = {};
				deferred.resolve(_list);
			}
		});
	}

	return deferred.promise;
}

let _hiddenItems = {
	add: function(aWindowURL, aMenuID, aIDs) {
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
			if (menuitem.classList.contains("bookmark-item")) {
				break;
			}
			if (!menuitem.id) {
				if (menuitem.localName == "menuseparator") {
					let previous = menuitem.previousElementSibling;
					menuitem.id = "menufilter-after-" + previous.id;
				} else if (menuitem.label || menuitem.hasAttribute("label")) {
					let label = menuitem.label || menuitem.getAttribute("label");
					menuitem.id = "menufilter-" + label.replace(/\W/g, '-');
				} else {
					menuitem.id = "menufilter-item-" + i++;
				}
			}
		}
	},
	hiddenItems: _hiddenItems
};
