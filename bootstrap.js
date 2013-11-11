Components.utils.import("resource://gre/modules/Services.jsm");

const cssData = 'href="data:text/css,' + encodeURIComponent(".menufilter-hidden { display: none; }") + '" type="text/css"';

let aboutPage = {};
let WINDOW_URLS = [
	"chrome://browser/content/browser.xul",
	"chrome://messenger/content/messenger.xul"
];

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

	enumerateWindows(unpaint);

	let registrar = Components.manager.QueryInterface(Components.interfaces.nsIComponentRegistrar);
	registrar.unregisterFactory(
		aboutPage.MenuFilterAboutHandler.prototype.classID,
		aboutPage.NSGetFactory(aboutPage.MenuFilterAboutHandler.prototype.classID)
	);
}

function paint(aWindow) {
	if (WINDOW_URLS.indexOf(aWindow.location.href) >= 0) {
		let document = aWindow.document;
		let pi = document.createProcessingInstruction("xml-stylesheet", cssData);
		document.insertBefore(pi, document.documentElement);
		document.menuCSSNode = pi;

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
