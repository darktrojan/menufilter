/* jshint browser:true */
/* globals Components, Services, XPCOMUtils, MenuFilter */
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("chrome://menufilter/content/menufilter.jsm");

/* globals strings */
XPCOMUtils.defineLazyGetter(this, "strings", function() {
	return Services.strings.createBundle("chrome://menufilter/locale/strings.properties");
});

let windowURL, windowType, menuID;
let windowTypeList = document.getElementById("windowtype");
let menuIDList = document.getElementById("menuid");
let menuItemList = document.getElementById("menu");
let showButton = document.getElementById("show");
let hideButton = document.getElementById("hide");

switch (Services.appinfo.name) {
case "Firefox":
	windowURL = "chrome://browser/content/browser.xul";
	windowType = "navigator:browser";
	document.documentElement.classList.add("isfirefox");
	break;
case "Thunderbird":
	windowURL = "chrome://messenger/content/messenger.xul";
	windowType = "mail:3pane";
	document.documentElement.classList.add("isthunderbird");
	break;
case "SeaMonkey":
	windowURL = "chrome://navigator/content/navigator.xul";
	windowType = "navigator:browser";
	document.documentElement.classList.add("isseamonkey");
	windowTypeList.selectedItem = windowTypeList.getItemAtIndex(0);
	break;
}

let windowObserver = {
	observe: function(aSubject, aTopic) {
		if (aTopic == "domwindowopened") {
			aSubject.addEventListener("load", function windowLoad() {
				aSubject.removeEventListener("load", windowLoad);
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
function windowTypeChosen(aItem) {
	windowType = aItem.value;
	windowURL = aItem.getAttribute("url");
	updateMenuIDList();
	menuChosen(menuIDList.value);
}

function updateMenuIDList() {
	let domWindow = Services.wm.getMostRecentWindow(windowType);
	let domDocument = domWindow.document;
	for (let i = 0; i < menuIDList.itemCount; i++) {
		let item = menuIDList.getItemAtIndex(i);
		let menuID = item.value;
		item.disabled = !domDocument.getElementById(menuID);
	}
	menuIDList.selectedItem = menuIDList.querySelector("." + Services.appinfo.name.toLowerCase() + ":not([disabled])");
}

function menuChosen(aID) {
	menuID = aID;
	displayMenu();
}

function displayMenu() {
	while (menuItemList.lastElementChild) {
		menuItemList.removeChild(menuItemList.lastElementChild);
	}
	MenuFilter.hiddenItems.getList(windowURL, menuID).then(_displayMenu);
}

function _displayMenu(aList) {
	let domWindow = Services.wm.getMostRecentWindow(windowType);
	let domDocument = domWindow.document;
	let menu = domDocument.getElementById(menuID);

	if (menu.id == "PanelUI-bookmarks" || menu.id == "PanelUI-history") {
		menu = menu.querySelector(".panel-subview-body");
	}

	MenuFilter.ensureItemsHaveIDs(menu);
	for (let menuitem of menu.children) {
		if (menuitem.classList.contains("bookmark-item") &&
				!menuitem.id.startsWith("BMB_") && !menuitem.hasAttribute("query")) {
			break;
		}
		if ((menuID == "goPopup" || menuID == "windowPopup") && menuitem.getAttribute("type") == "radio") {
			break;
		}
		if (MenuFilter.osXSpecialItems.indexOf(menuitem.id) >= 0) {
			continue;
		}

		let item = document.createElement("listitem");
		switch (menuitem.localName) {
		case "menu":
			item.classList.add("menu");
			/* falls through */
		case "menuitem":
		case "toolbarbutton":
			item.setAttribute("label", menuitem.label || menuitem.getAttribute("label") || menuitem.id);
			break;
		case "menuseparator":
			item.classList.add("separator");
			break;
		case "menugroup":
			if (menuitem.id == "context-navigation") {
				item.setAttribute("label", strings.GetStringFromName("context-navigation.label"));
			}
			break;
		case "vbox":
			if (
				(menuitem.id == "PanelUI-recentlyClosedTabs" || menuitem.id == "PanelUI-recentlyClosedWindows") &&
				!!menuitem.firstElementChild
			) {
				item.setAttribute("label", menuitem.firstElementChild.getAttribute("label"));
				break;
			}
			/* falls through */
		default:
			continue;
		}
		if (menuitem.id) {
			item.setAttribute("value", menuitem.id);
			if (aList.indexOf(menuitem.id) >= 0) {
				item.classList.add("hidden");
			}
		} else {
			item.setAttribute("disabled", "true");
		}
		menuItemList.appendChild(item);
	}

	menuItemList.scrollToIndex(1);
	menuItemList.scrollToIndex(0);
}

function selectionChanged() {
	let hideEnabled, showEnabled;
	for (let option of menuItemList.selectedItems) {
		if (!option.disabled) {
			if (option.classList.contains("hidden")) {
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
			option.classList.remove("hidden");
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
			option.classList.add("hidden");
		}
	}
	MenuFilter.hiddenItems.add(windowURL, menuID, toHide);
	selectionChanged();
	menuItemList.focus();
}

function toggleItem(aTarget) {
	if (aTarget.localName != "listitem") {
		return;
	}
	if (aTarget.classList.contains("hidden")) {
		MenuFilter.hiddenItems.remove(windowURL, menuID, [aTarget.value]);
		aTarget.classList.remove("hidden");
	} else {
		MenuFilter.hiddenItems.add(windowURL, menuID, [aTarget.value]);
		aTarget.classList.add("hidden");
	}
	selectionChanged();
}

function doDonate() {
	let uri = "https://addons.mozilla.org/addon/menu-filter/contribute/installed/";

	let browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
	if (browserWindow) {
		browserWindow.switchToTabHavingURI(uri, true);
		return;
	}

	let mailWindow = Services.wm.getMostRecentWindow("mail:3pane");
	if (mailWindow) {
		mailWindow.openLinkExternally(uri);
	}
}
