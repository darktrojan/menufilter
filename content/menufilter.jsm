this.EXPORTED_SYMBOLS = ['MenuFilter'];
/* globals Components, XPCOMUtils, TextDecoder */
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');

const KEY_PROFILEDIR = 'ProfD';
const FILE_DATABASE = 'menufilter.json';

/* globals FileUtils, OS */
XPCOMUtils.defineLazyModuleGetter(this, 'FileUtils', 'resource://gre/modules/FileUtils.jsm');
XPCOMUtils.defineLazyModuleGetter(this, 'OS', 'resource://gre/modules/osfile.jsm');

let jsonFile = FileUtils.getFile(KEY_PROFILEDIR, [FILE_DATABASE], true);
let _list = null;
function save() {
	for (let windowURL of Object.keys(_list)) {
		let menus = _list[windowURL];
		for (let menuID of Object.keys(menus)) {
			let items = menus[menuID];
			if (items.length === 0) {
				delete menus[menuID];
			}
		}
	}
	OS.File.writeAtomic(jsonFile.path, JSON.stringify(_list));
}
let _listener = null;

function ensureList() {
	return new Promise(function(resolve) {
		if (_list !== null) {
			resolve(_list);
		} else {
			OS.File.exists(jsonFile.path).then(function(exists) {
				if (exists) {
					OS.File.read(jsonFile.path).then(function(array) {
						let decoder = new TextDecoder();
						let text = decoder.decode(array);
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
	add: function(windowURL, menuID, ids) {
		if (!Array.isArray(ids)) {
			if (typeof ids == 'string') {
				ids = [ids];
			} else {
				Components.utils.reportError('Argument should be a string or an array.');
				return;
			}
		}
		this.getList(windowURL, menuID).then(function(list) {
			for (let id of ids) {
				if (!list.includes(id)) {
					list.push(id);
				}
			}
			if (!(windowURL in _list)) {
				_list[windowURL] = {};
			}
			if (!(menuID in _list[windowURL])) {
				_list[windowURL][menuID] = list;
			}
			_listener();
			save();
		}).then(null, Components.utils.reportError);
	},
	remove: function(windowURL, menuID, ids) {
		if (!Array.isArray(ids)) {
			if (typeof ids == 'string') {
				ids = [ids];
			} else {
				Components.utils.reportError('Argument should be a string or an array.');
				return;
			}
		}
		this.getList(windowURL, menuID).then(function(list) {
			for (let id of ids) {
				let index = list.indexOf(id);
				if (index >= 0) {
					list.splice(index, 1);
				}
			}
			_listener();
			save();
		}).then(null, Components.utils.reportError);
	},
	getList: function(windowURL, menuID) {
		return ensureList().then(function(list) {
			if (windowURL) {
				if (windowURL in list) {
					if (menuID) {
						if (menuID in list[windowURL]) {
							return list[windowURL][menuID];
						}
						return [];
					}
					return list[windowURL];
				}
				if (menuID) {
					return [];
				}
				return {};
			}
			return list;
		});
	},
	registerListener: function(listener) {
		_listener = listener;
	}
};

/* exported MenuFilter */
let MenuFilter = {
	ensureItemsHaveIDs: function(menu, prefix='menufilter-') {
		let i = 1;
		for (let menuitem of menu.children) {
			if (menuitem.getAttribute('type') == 'radio') {
				break;
			}
			if (!menuitem.id) {
				if (menuitem.localName == 'menuseparator' || menuitem.localName == 'toolbarseparator') {
					let previous = menuitem.previousElementSibling;
					if (previous) {
						menuitem.id = previous.id.startsWith(prefix) ?
							prefix + 'after-' + previous.id.substring(prefix.length) :
							prefix + 'after-' + previous.id;
					} else {
						menuitem.id = prefix + 'first';
					}
				} else if (menuitem.label || menuitem.hasAttribute('label')) {
					let label = menuitem.label || menuitem.getAttribute('label');
					menuitem.id = prefix + label.replace(/\W/g, '-');
				} else {
					menuitem.id = prefix + 'item-' + i++;
				}
			}
		}
	},
	hiddenItems: _hiddenItems,
	osXSpecialItems: [
		'menu_FileQuitSeparator', 'menu_FileQuitItem', 'menu_PrefsSeparator', 'menu_preferences',
		'aboutSeparator', 'aboutName', 'menu_mac_services', 'menu_mac_hide_app',
		'menu_mac_hide_others', 'menu_mac_show_all', 'checkForUpdates'
	]
};
