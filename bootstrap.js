Components.utils.import("resource://gre/modules/Services.jsm");

const cssData = 'href="data:text/css,' + encodeURIComponent(".menufilter-hidden { display: none; }") + '" type="text/css"';

let aboutPage = {};
let strings = Services.strings.createBundle("chrome://menufilter/locale/strings.properties");

let ABOUT_PAGE_URL = "about:menufilter";
let BROWSER_URL = "chrome://browser/content/browser.xul";
let MESSENGER_URL = "chrome://messenger/content/messenger.xul";
let NAVIGATOR_URL = "chrome://navigator/content/navigator.xul";
let WINDOW_URLS = [BROWSER_URL, MESSENGER_URL, NAVIGATOR_URL];

function install(aParams, aReason) {
}
function uninstall(aParams, aReason) {
}
function startup(aParams, aReason) {
	Components.utils.import("chrome://menufilter/content/menufilter.jsm");
	MenuFilter.hiddenItems.registerListener(refreshItems);

	enumerateWindows(paint);
	Services.ww.registerNotification(windowObserver);

	Services.scriptloader.loadSubScript(aParams.resourceURI.spec + "components/about-menufilter.js", aboutPage);
	let registrar = Components.manager.QueryInterface(Components.interfaces.nsIComponentRegistrar);
	registrar.registerFactory(
		aboutPage.MenuFilterAboutHandler.prototype.classID,
		"",
		aboutPage.MenuFilterAboutHandler.prototype.contractID,
		aboutPage.NSGetFactory(aboutPage.MenuFilterAboutHandler.prototype.classID)
	);
}
function shutdown(aParams, aReason) {
	Services.ww.unregisterNotification(windowObserver);
	if (aReason == APP_SHUTDOWN) {
		return;
	}

	enumerateWindows(function(aWindow) {
		unpaint(aWindow);
		switch (aWindow.location.href) {
		case ABOUT_PAGE_URL:
			aWindow.close();
			break;
		case BROWSER_URL:
			for (let tab of aWindow.gBrowser.tabs) {
				if (tab.linkedBrowser.currentURI.spec == ABOUT_PAGE_URL) {
					aWindow.gBrowser.removeTab(tab);
				}
			}
			break;
		}
	});

	let registrar = Components.manager.QueryInterface(Components.interfaces.nsIComponentRegistrar);
	registrar.unregisterFactory(
		aboutPage.MenuFilterAboutHandler.prototype.classID,
		aboutPage.NSGetFactory(aboutPage.MenuFilterAboutHandler.prototype.classID)
	);

	Components.utils.unload("chrome://menufilter/content/menufilter.jsm");
}

function paint(aWindow) {
	if (WINDOW_URLS.indexOf(aWindow.location.href) >= 0) {
		let document = aWindow.document;
		let pi = document.createProcessingInstruction("xml-stylesheet", cssData);
		document.insertBefore(pi, document.documentElement);
		document.menuCSSNode = pi;

		let menuitem = document.createElement("menuitem");
		menuitem.id = "tools-menufilter";
		menuitem.className = "menuitem-iconic";
		menuitem.setAttribute("label", strings.GetStringFromName("toolsmenuitem.label"));
		menuitem.addEventListener("command", function() {
			if ("switchToTabHavingURI" in aWindow) {
				aWindow.switchToTabHavingURI(ABOUT_PAGE_URL, true);
			} else if ("contentTabBaseType" in aWindow) {
				let whitelist = aWindow.contentTabBaseType.inContentWhitelist;
				if (whitelist.indexOf(ABOUT_PAGE_URL) < 0) {
					whitelist.push(ABOUT_PAGE_URL);
				}
				aWindow.openContentTab(ABOUT_PAGE_URL);
			}
		});

		let toolsPopup = document.getElementById("menu_ToolsPopup") || document.getElementById("taskPopup");
		if (toolsPopup) {
			toolsPopup.appendChild(menuitem);
		}

		hideItems(document);
	}
}
function unpaint(aWindow) {
	if (WINDOW_URLS.indexOf(aWindow.location.href) >= 0) {
		let document = aWindow.document;
		if (!!document.menuCSSNode) {
			document.removeChild(document.menuCSSNode);
		}

		unhideItems(document);

		let menuitem = document.getElementById("tools-menufilter");
		if (menuitem) {
			menuitem.remove();
		}
	}
}
function enumerateWindows(aCallback) {
	let windowEnum = Services.ww.getWindowEnumerator();
	while (windowEnum.hasMoreElements()) {
		aCallback(windowEnum.getNext());
	}
}
function hideItems(aDocument) {
	MenuFilter.hiddenItems.getList(aDocument.location).then(function(aList) {
		for (let [id, list] in Iterator(aList)) {
			let menu = aDocument.getElementById(id);
			if (!menu) {
				continue;
			}
			MenuFilter.ensureItemsHaveIDs(menu);
			for (let item of list) {
				let menuitem = aDocument.getElementById(item);
				if (menuitem) {
					menuitem.classList.add("menufilter-hidden");
				}
			}
		}
	}).then(null, Components.utils.reportError);
}
function unhideItems(aDocument) {
	let items = [];
	for (let menuitem of aDocument.getElementsByClassName("menufilter-hidden")) {
		items.push(menuitem);
	}
	for (let menuitem of items) {
		menuitem.classList.remove("menufilter-hidden");
	}
}
function refreshItems() {
	enumerateWindows(function(aWindow) {
		if (WINDOW_URLS.indexOf(aWindow.location.href) >= 0) {
			let document = aWindow.document;
			unhideItems(document);
			hideItems(document);
		}
	})
}

let windowObserver = {
	observe: function(aSubject, aTopic, aData) {
		if (aTopic == "domwindowopened") {
			aSubject.addEventListener("load", function() {
				paint(aSubject);
			}, false);
		} else {
			unpaint(aSubject);
		}
	}
};
