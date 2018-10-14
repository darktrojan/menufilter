/* jshint browser:true */
/* eslint-env browser */
/* globals Components, Services, XPCOMUtils, MenuFilter */
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');
Components.utils.import('chrome://menufilter/content/menufilter.jsm');

/* globals browserStrings, strings */
XPCOMUtils.defineLazyGetter(this, 'browserStrings', function() {
	return Services.strings.createBundle('chrome://browser/locale/browser.properties');
});
XPCOMUtils.defineLazyGetter(this, 'strings', function() {
	return Services.strings.createBundle('chrome://menufilter/locale/strings.properties');
});

var IS_OSX = Services.appinfo.OS == 'Darwin';

var windowURL, windowType, menuID;
var windowTypeList = document.getElementById('windowtype');
var menuIDList = document.getElementById('menuid');
var searchText = document.getElementById('search');
var menuItemList = document.getElementById('menu');
var showButton = document.getElementById('show');
var hideButton = document.getElementById('hide');
var itemsInCurrentList;

switch (Services.appinfo.name) {
case 'Firefox':
	windowURL = 'chrome://browser/content/browser.xul';
	windowType = 'navigator:browser';
	document.documentElement.classList.add('isfirefox');
	break;
case 'Thunderbird':
	windowURL = 'chrome://messenger/content/messenger.xul';
	windowType = 'mail:3pane';
	document.documentElement.classList.add('isthunderbird');
	break;
case 'SeaMonkey':
	windowURL = 'chrome://navigator/content/navigator.xul';
	windowType = 'navigator:browser';
	document.documentElement.classList.add('isseamonkey');
	windowTypeList.selectedItem = windowTypeList.getItemAtIndex(0);
	break;
}

var windowObserver = {
	observe: function(subject, topic) {
		if (topic == 'domwindowopened') {
			subject.addEventListener('load', function windowLoad() {
				subject.removeEventListener('load', windowLoad);
				windowObserver.iterate();
			});
		} else {
			this.iterate();
		}
	},
	iterate: function() {
		for (let i = 0; i < windowTypeList.itemCount; i++) {
			let item = windowTypeList.getItemAtIndex(i);
			item.disabled = !Services.wm.getMostRecentWindow(item.value);
		}
	}
};

onload = function() {
	showButton.disabled = hideButton.disabled = true;
	updateMenuIDList();
	menuChosen(menuIDList.value);

	windowObserver.iterate();
	Services.ww.registerNotification(windowObserver);
};

onresize = function() {
	let first = menuItemList.listBoxObject.getIndexOfFirstVisibleRow();
	menuItemList.scrollToIndex(first + 1);
	menuItemList.scrollToIndex(first);
};

onunload = function() {
	Services.ww.unregisterNotification(windowObserver);
};

/* exported windowTypeChosen */
function windowTypeChosen(item) {
	windowType = item.value;
	windowURL = item.getAttribute('url');
	updateMenuIDList();
	menuChosen(menuIDList.value);
}

function updateMenuIDList() {
	let domWindow = Services.wm.getMostRecentWindow(windowType);
	let domDocument = domWindow.document;
	for (let i = 0; i < menuIDList.itemCount; i++) {
		let item = menuIDList.getItemAtIndex(i);
		item.disabled = !domDocument.getElementById(item.value);
	}
	menuIDList.selectedItem = menuIDList.querySelector('.' + Services.appinfo.name.toLowerCase() + ':not([disabled])');
}

function menuChosen(id) {
	menuID = id;
	displayMenu();
}

function displayMenu() {
	while (menuItemList.lastElementChild) {
		menuItemList.removeChild(menuItemList.lastElementChild);
	}
	MenuFilter.hiddenItems.getList(windowURL, menuID).then(_displayMenu);
}

function _displayMenu(list) {
	let domWindow = Services.wm.getMostRecentWindow(windowType);
	let domDocument = domWindow.document;
	let menu = domDocument.getElementById(menuID);

	if (menu.id == 'PanelUI-bookmarks' || menu.id == 'PanelUI-history') {
		menu = menu.querySelector('.panel-subview-body');
	}

	MenuFilter.ensureItemsHaveIDs(menu);
	for (let menuitem of menu.children) {
		if (menuitem.classList.contains('bookmark-item') && !menuitem.id) {
			continue;
		}
		if ((menuID == 'goPopup' || menuID == 'windowPopup') && menuitem.getAttribute('type') == 'radio') {
			break;
		}
		if (IS_OSX && MenuFilter.osXSpecialItems.includes(menuitem.id)) {
			continue;
		}

		let item = document.createElement('richlistitem');
		switch (menuitem.localName) {
		case 'menu':
			item.classList.add('menu');
			/* falls through */
		case 'menuitem':
		case 'toolbarbutton':
			item.setAttribute('label', menuitem.label || menuitem.getAttribute('label') || menuitem.id);
			break;
		case 'menuseparator':
		case 'toolbarseparator':
			item.classList.add('separator');
			break;
		case 'menugroup':
			if (menuitem.id == 'context-navigation') {
				item.setAttribute('label', strings.GetStringFromName('context-navigation.label'));
				break;
			}
			continue;
		case 'toolbaritem':
			if (menuitem.id == 'panelMenu_bookmarksMenu') {
				for (let bookmarkitem of menuitem.children) {
					if (bookmarkitem.hasAttribute('query')) {
						item = document.createElement('richlistitem');
						item.setAttribute('label', bookmarkitem.label);
						item.setAttribute('value', bookmarkitem.id);
						menuItemList.appendChild(item);
					}
				}
			}
			continue;
		case 'vbox':
			if (menuitem.id == 'PanelUI-recentlyClosedTabs') {
				item.setAttribute('label', browserStrings.GetStringFromName('menuRestoreAllTabsSubview.label'));
				break;
			} else if (menuitem.id == 'PanelUI-recentlyClosedWindows') {
				item.setAttribute('label', browserStrings.GetStringFromName('menuRestoreAllWindowsSubview.label'));
				break;
			}
			continue;
		default:
			continue;
		}
		if (menuitem.id) {
			item.setAttribute('value', menuitem.id);
			if (list.includes(menuitem.id)) {
				item.classList.add('hidden');
			}
		} else {
			item.setAttribute('disabled', 'true');
		}
		menuItemList.appendChild(item);
	}

	if (Services.appinfo.name == 'Firefox') {
		let item;
		switch (menuID) {
		case 'bookmarksMenuPopup':
		case 'BMB_bookmarksPopup':
			item = document.createElement('richlistitem');
			item.setAttribute('label', browserStrings.GetStringFromName('menuOpenAllInTabs.label'));
			item.setAttribute('value', 'openintabs-menuitem');
			break;
		case 'PanelUI-bookmarks':
			item = document.createElement('richlistitem');
			item.setAttribute('label', domDocument.getElementById('panelMenu_showAllBookmarks').getAttribute('label'));
			item.setAttribute('value', 'panelMenu_showAllBookmarks');
			break;
		case 'PanelUI-history':
			item = document.createElement('richlistitem');
			item.setAttribute('label', domDocument.getElementById('PanelUI-historyMore').getAttribute('label'));
			item.setAttribute('value', 'PanelUI-historyMore');
			break;
		case 'menuWebDeveloperPopup':
			item = document.createElement('richlistitem');
			item.setAttribute('label', domDocument.getElementById('goOfflineMenuitem').getAttribute('label'));
			item.setAttribute('value', 'workoffline-menuitem');
			break;
		}
		if (item) {
			if (list.includes(item.getAttribute('value'))) {
				item.classList.add('hidden');
			}
			menuItemList.appendChild(item);
		}
	}

	menuItemList.scrollToIndex(1);
	menuItemList.scrollToIndex(0);
	itemsInCurrentList = [...menuItemList.children];

	if (searchText.value) {
		search(searchText.value);
	}
}

function search(filter) {
	while (menuItemList.lastElementChild) {
		menuItemList.removeChild(menuItemList.lastElementChild);
	}
	filter = filter.toLowerCase();
	for (let i of itemsInCurrentList) {
		if (i.getAttribute('label').toLowerCase().includes(filter)) {
			menuItemList.appendChild(i);
			i.removeAttribute('current');
		}
	}
	menuItemList.scrollToIndex(1);
	menuItemList.scrollToIndex(0);
}

function selectionChanged() {
	let hideEnabled, showEnabled;
	for (let option of menuItemList.selectedItems) {
		if (!option.disabled) {
			if (option.classList.contains('hidden')) {
				showEnabled = true;
			} else {
				hideEnabled = true;
			}
		}
	}
	showButton.disabled = !showEnabled;
	hideButton.disabled = !hideEnabled;
}

/* exported showSelection, hideSelection, toggleItem, doDonate */
function showSelection() {
	let toShow = [];
	for (let option of menuItemList.selectedItems) {
		if (!option.disabled) {
			toShow.push(option.value);
			option.classList.remove('hidden');
		}
	}
	MenuFilter.hiddenItems.remove(windowURL, menuID, toShow);
	selectionChanged();
	menuItemList.focus();
}

function hideSelection() {
	let toHide = [];
	for (let option of menuItemList.selectedItems) {
		if (!option.disabled) {
			toHide.push(option.value);
			option.classList.add('hidden');
		}
	}
	MenuFilter.hiddenItems.add(windowURL, menuID, toHide);
	selectionChanged();
	menuItemList.focus();
}

function toggleItem(target) {
	if (target.localName != 'richlistitem') {
		return;
	}
	if (target.classList.contains('hidden')) {
		MenuFilter.hiddenItems.remove(windowURL, menuID, [target.value]);
		target.classList.remove('hidden');
	} else {
		MenuFilter.hiddenItems.add(windowURL, menuID, [target.value]);
		target.classList.add('hidden');
	}
	selectionChanged();
}

function doDonate() {
	let uri = 'https://darktrojan.github.io/donate.html?menufilter';

	let browserWindow = Services.wm.getMostRecentWindow('navigator:browser');
	if (browserWindow) {
		browserWindow.switchToTabHavingURI(uri, true);
		return;
	}

	let mailWindow = Services.wm.getMostRecentWindow('mail:3pane');
	if (mailWindow) {
		mailWindow.openLinkExternally(uri);
	}
}
