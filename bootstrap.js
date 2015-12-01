/* globals Components, Services, XPCOMUtils, Iterator */
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');
/* globals idleService */
XPCOMUtils.defineLazyServiceGetter(this, 'idleService', '@mozilla.org/widget/idleservice;1', 'nsIIdleService');

const cssData =
	'href="data:text/css,' + encodeURIComponent(
		'.menufilter-hidden, ' +
		'menupopup[menufilter-openintabs-hidden] .bookmarks-actions-menuseparator, ' +
		'menupopup[menufilter-openintabs-hidden] .openintabs-menuitem {' +
		' display: none; ' +
		'}'
	) + '" type="text/css"';

let aboutPage = {};
let strings = Services.strings.createBundle('chrome://menufilter/locale/strings.properties');

let ABOUT_PAGE_URL = 'about:menufilter';
let BROWSER_URL = 'chrome://browser/content/browser.xul';
let DONATE_URL = 'https://addons.mozilla.org/addon/menu-filter/contribute/installed/';
let IDLE_TIMEOUT = 9;
let LIBRARY_URL = 'chrome://browser/content/places/places.xul';
let MESSAGE_WINDOW_URL = 'chrome://messenger/content/messageWindow.xul';
let MESSENGER_URL = 'chrome://messenger/content/messenger.xul';
let NAVIGATOR_URL = 'chrome://navigator/content/navigator.xul';
let PREF_REMINDER = 'extensions.menufilter.donationreminder';
let PREF_VERSION = 'extensions.menufilter.version';
let WINDOW_URLS = [BROWSER_URL, LIBRARY_URL, MESSAGE_WINDOW_URL, MESSENGER_URL, NAVIGATOR_URL];

let IS_OSX = Services.appinfo.OS == 'Darwin';

let donationReminder, windowObserver;

/* exported install, uninstall, startup, shutdown */
/* globals APP_STARTUP, APP_SHUTDOWN, ADDON_INSTALL, ADDON_UPGRADE */
function install(aParams, aReason) {
	if (aReason == ADDON_UPGRADE && !Services.prefs.prefHasUserValue(PREF_VERSION)) {
		Services.prefs.setCharPref(PREF_VERSION, aParams.oldVersion);
	}
}
function uninstall() {
}
function startup(aParams, aReason) {
	if (aReason == APP_STARTUP && Services.appinfo.name == 'Firefox') {
		Services.obs.addObserver({
			observe: function() {
				Services.obs.removeObserver(this, 'browser-delayed-startup-finished');
				realStartup(aParams, aReason);
			}
		}, 'browser-delayed-startup-finished', false);
	} else {
		realStartup(aParams, aReason);
	}
}
function realStartup(aParams, aReason) {
	/* globals MenuFilter */
	Components.utils.import('chrome://menufilter/content/menufilter.jsm');
	MenuFilter.hiddenItems.registerListener(refreshItems);

	enumerateWindows(paint);
	Services.ww.registerNotification(windowObserver);

	Services.scriptloader.loadSubScript(aParams.resourceURI.spec + 'components/about-menufilter.js', aboutPage);
	let registrar = Components.manager.QueryInterface(Components.interfaces.nsIComponentRegistrar);
	registrar.registerFactory(
		aboutPage.MenuFilterAboutHandler.prototype.classID,
		'',
		aboutPage.MenuFilterAboutHandler.prototype.contractID,
		aboutPage.NSGetFactory(aboutPage.MenuFilterAboutHandler.prototype.classID)
	);

	Services.prefs.getDefaultBranch('').setCharPref(PREF_VERSION, '0');
	if (aReason != ADDON_INSTALL) {
		donationReminder.run(aParams.version);
	}
	Services.prefs.setCharPref(PREF_VERSION, aParams.version);
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

	Components.utils.unload('chrome://menufilter/content/menufilter.jsm');
}

function paint(aWindow) {
	let location = aWindow.location.href;
	if (location == LIBRARY_URL) {
		location = BROWSER_URL;
	} else if (location == MESSAGE_WINDOW_URL) {
		location = MESSENGER_URL;
	}
	if (WINDOW_URLS.indexOf(location) >= 0) {
		let document = aWindow.document;
		let pi = document.createProcessingInstruction('xml-stylesheet', cssData);
		document.insertBefore(pi, document.documentElement);
		document.menuCSSNode = pi;

		if ('switchToTabHavingURI' in aWindow || 'contentTabBaseType' in aWindow) {
			let menuitem = document.createElement('menuitem');
			menuitem.id = 'tools-menufilter';
			menuitem.className = 'menuitem-iconic';
			menuitem.setAttribute('label', strings.GetStringFromName('toolsmenuitem.label'));
			menuitem.addEventListener('command', function() {
				if ('switchToTabHavingURI' in aWindow) {
					aWindow.switchToTabHavingURI(ABOUT_PAGE_URL, true);
				} else if ('contentTabBaseType' in aWindow) {
					let whitelist = aWindow.contentTabBaseType.inContentWhitelist;
					if (whitelist.indexOf(ABOUT_PAGE_URL) < 0) {
						whitelist.push(ABOUT_PAGE_URL);
					}
					aWindow.openContentTab(ABOUT_PAGE_URL);
				}
			});

			let toolsPopup = document.getElementById('menu_ToolsPopup') || document.getElementById('taskPopup');
			if (toolsPopup) {
				toolsPopup.appendChild(menuitem);
			}
		}

		hideItems(document);
	}
}
function unpaint(aWindow) {
	let location = aWindow.location.href;
	if (location == LIBRARY_URL) {
		location = BROWSER_URL;
	} else if (location == MESSAGE_WINDOW_URL) {
		location = MESSENGER_URL;
	}
	if (WINDOW_URLS.indexOf(location) >= 0) {
		let document = aWindow.document;
		if (!!document.menuCSSNode) {
			document.removeChild(document.menuCSSNode);
		}

		unhideItems(document);

		let menuitem = document.getElementById('tools-menufilter');
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
	let location = aDocument.location;
	if (location == LIBRARY_URL) {
		location = BROWSER_URL;
	} else if (location == MESSAGE_WINDOW_URL) {
		location = MESSENGER_URL;
	}
	MenuFilter.hiddenItems.getList(location).then(function(aList) {
		for (let [id, list] in Iterator(aList)) {
			let menu = aDocument.getElementById(id);
			if (!menu) {
				continue;
			}
			if (menu.id == 'PanelUI-bookmarks' || menu.id == 'PanelUI-history') {
				menu = menu.querySelector('.panel-subview-body');
			}
			MenuFilter.ensureItemsHaveIDs(menu);
			for (let item of list) {
				if (item == 'openintabs-menuitem') {
					// TODO:
					// #BMB_bookmarksPopup doesn't exist if Bookmarks is not on the toolbar
					// and this attribute won't get added if that changes.
					menu.setAttribute('menufilter-openintabs-hidden', 'true');
					continue;
				}
				let menuitem = aDocument.getElementById(item);
				if (menuitem) {
					menuitem.classList.add('menufilter-hidden');
					if (IS_OSX) {
						menuitem.collapsed = true;
					}
				}
			}
		}
	}).then(null, Components.utils.reportError);
}
function unhideItems(aDocument) {
	let items = [];
	for (let menuitem of aDocument.getElementsByClassName('menufilter-hidden')) {
		items.push(menuitem);
	}
	for (let menuitem of items) {
		menuitem.classList.remove('menufilter-hidden');
		if (IS_OSX) {
			menuitem.collapsed = false;
		}
	}
	for (let menupopup of aDocument.querySelectorAll('[menufilter-openintabs-hidden]')) {
		menupopup.removeAttribute('menufilter-openintabs-hidden');
	}
}
function refreshItems() {
	enumerateWindows(function(aWindow) {
		if (WINDOW_URLS.indexOf(aWindow.location.href) >= 0) {
			let document = aWindow.document;
			unhideItems(document);
			hideItems(document);
		}
	});
}

donationReminder = {
	currentVersion: 0,
	run: function(aVersion) {
		// Truncate version numbers to floats
		let oldVersion = parseFloat(Services.prefs.getCharPref(PREF_VERSION), 10);
		if (!oldVersion) {
			return;
		}

		this.currentVersion = parseFloat(aVersion, 10);
		let shouldRemind = true;

		if (Services.prefs.getPrefType(PREF_REMINDER) == Components.interfaces.nsIPrefBranch.PREF_INT) {
			let lastReminder = Services.prefs.getIntPref(PREF_REMINDER) * 1000;
			shouldRemind = Date.now() - lastReminder > 604800000;
		}

		if (shouldRemind && Services.vc.compare(oldVersion, this.currentVersion) == -1) {
			idleService.addIdleObserver(this, IDLE_TIMEOUT);
		}
	},
	observe: function(aSubject, aTopic) {
		if (aTopic != 'idle') {
			return;
		}

		idleService.removeIdleObserver(this, IDLE_TIMEOUT);

		let message = strings.formatStringFromName('donate.message1', [this.currentVersion], 1);
		let label = strings.GetStringFromName('donate.button.label');
		let accessKey = strings.GetStringFromName('donate.button.accesskey');
		let notificationBox, callback;

		let recentWindow = Services.wm.getMostRecentWindow('navigator:browser');
		if (recentWindow) {
			let browser = recentWindow.gBrowser;
			notificationBox = recentWindow.document.getElementById('global-notificationbox') ||
				browser.getNotificationBox();
			callback = function() {
				browser.selectedTab = browser.addTab(DONATE_URL);
			};
		} else {
			recentWindow = Services.wm.getMostRecentWindow('mail:3pane');
			if (recentWindow) {
				notificationBox = recentWindow.document.getElementById('mail-notification-box');
				callback = function() {
					recentWindow.openLinkExternally(DONATE_URL);
				};
			}
		}

		if (notificationBox) {
			notificationBox.appendNotification(
				message, 'menufilter-donate', 'chrome://menufilter/content/icon16.png',
				notificationBox.PRIORITY_INFO_MEDIUM,
				[{ label: label, accessKey: accessKey, callback: callback }]
			);
		}

		Services.prefs.setIntPref(PREF_REMINDER, Date.now() / 1000);
	}
};
windowObserver = {
	observe: function(aSubject, aTopic) {
		if (aTopic == 'domwindowopened') {
			aSubject.addEventListener('load', function windowLoad() {
				aSubject.removeEventListener('load', windowLoad, false);
				paint(aSubject);
			}, false);
		} else {
			unpaint(aSubject);
		}
	}
};
