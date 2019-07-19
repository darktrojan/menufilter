/* jshint browser:true */
/* eslint-env browser */
/* globals Components, Services, XPCOMUtils, MenuFilter */
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');
Components.utils.import('chrome://menufilter/content/menufilter.jsm');

/* globals strings */
XPCOMUtils.defineLazyGetter(this, 'strings', function() {
	return Services.strings.createBundle('chrome://menufilter/locale/strings.properties');
});

var IS_OSX = Services.appinfo.OS == 'Darwin';

var menuID;
var windowURL = 'chrome://messenger/content/messenger.xul';
var windowType = 'mail:3pane';
var menuIDList = document.getElementById('menuid');
var searchText = document.getElementById('search');
var menuItemList = document.getElementById('menu');
var showButton = document.getElementById('show');
var hideButton = document.getElementById('hide');
var itemsInCurrentList;

onload = function() {
	showButton.disabled = hideButton.disabled = true;
	updateMenuIDList();
	menuChosen(menuIDList.value);
};

function updateMenuIDList() {
	let domWindow = Services.wm.getMostRecentWindow(windowType);
	let domDocument = domWindow.document;
	for (let i = 0; i < menuIDList.itemCount; i++) {
		let item = menuIDList.getItemAtIndex(i);
		item.disabled = !domDocument.getElementById(item.value);
	}
	menuIDList.selectedItem = menuIDList.querySelector(':not([disabled])');
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

	MenuFilter.ensureItemsHaveIDs(menu);
	for (let menuitem of menu.children) {
		if ((menuID == 'goPopup' || menuID == 'windowPopup') && menuitem.getAttribute('type') == 'radio') {
			break;
		}
		if (IS_OSX && MenuFilter.osXSpecialItems.includes(menuitem.id)) {
			continue;
		}

		let item = document.createXULElement('richlistitem');
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

	let mailWindow = Services.wm.getMostRecentWindow('mail:3pane');
	if (mailWindow) {
		mailWindow.openLinkExternally(uri);
	}
}
