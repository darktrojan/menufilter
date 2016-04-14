/* globals Components, Services, XPCOMUtils */
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');
/* globals idleService */
XPCOMUtils.defineLazyServiceGetter(this, 'idleService', '@mozilla.org/widget/idleservice;1', 'nsIIdleService');

const cssData =
	'href="data:text/css,' + encodeURIComponent(
		'.menufilter-hidden, .menufilter-separator-hidden, ' +
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

/* exported install, uninstall, startup, shutdown */
/* globals APP_STARTUP, APP_SHUTDOWN, ADDON_INSTALL, ADDON_UPGRADE */
function install(params, reason) {
	if (reason == ADDON_UPGRADE && !Services.prefs.prefHasUserValue(PREF_VERSION)) {
		Services.prefs.setCharPref(PREF_VERSION, params.oldVersion);
	}
}
function uninstall() {
}
function startup(params, reason) {
	if (reason == APP_STARTUP && Services.appinfo.name == 'Firefox') {
		Services.obs.addObserver({
			observe: function() {
				Services.obs.removeObserver(this, 'browser-delayed-startup-finished');
				realStartup(params, reason);
			}
		}, 'browser-delayed-startup-finished', false);
	} else {
		realStartup(params, reason);
	}
}
function realStartup(params, reason) {
	/* globals MenuFilter */
	Components.utils.import('chrome://menufilter/content/menufilter.jsm');
	MenuFilter.hiddenItems.registerListener(refreshItems);

	enumerateWindows(paint);
	Services.ww.registerNotification(windowObserver);

	Services.scriptloader.loadSubScript(params.resourceURI.spec + 'components/about-menufilter.js', aboutPage);
	let registrar = Components.manager.QueryInterface(Components.interfaces.nsIComponentRegistrar);
	registrar.registerFactory(
		aboutPage.MenuFilterAboutHandler.prototype.classID,
		'',
		aboutPage.MenuFilterAboutHandler.prototype.contractID,
		aboutPage.NSGetFactory(aboutPage.MenuFilterAboutHandler.prototype.classID)
	);

	Services.prefs.getDefaultBranch('').setCharPref(PREF_VERSION, '0');
	if (reason != ADDON_INSTALL) {
		donationReminder.run(params.version);
	}
	Services.prefs.setCharPref(PREF_VERSION, params.version);
}
function shutdown(params, reason) {
	Services.ww.unregisterNotification(windowObserver);
	if (reason == APP_SHUTDOWN) {
		return;
	}

	enumerateWindows(function(window) {
		unpaint(window);
		switch (window.location.href) {
		case ABOUT_PAGE_URL:
			window.close();
			break;
		case BROWSER_URL:
			for (let tab of window.gBrowser.tabs) {
				if (tab.linkedBrowser.currentURI.spec == ABOUT_PAGE_URL) {
					window.gBrowser.removeTab(tab);
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

function paint(window) {
	let location = window.location.href;
	if (location == LIBRARY_URL) {
		location = BROWSER_URL;
	} else if (location == MESSAGE_WINDOW_URL) {
		location = MESSENGER_URL;
	}
	if (WINDOW_URLS.indexOf(location) >= 0) {
		let document = window.document;
		let pi = document.createProcessingInstruction('xml-stylesheet', cssData);
		document.insertBefore(pi, document.documentElement);
		document.menuCSSNode = pi;

		if ('switchToTabHavingURI' in window || 'contentTabBaseType' in window) {
			let menuitem = document.createElement('menuitem');
			menuitem.id = 'tools-menufilter';
			menuitem.className = 'menuitem-iconic';
			menuitem.setAttribute('label', strings.GetStringFromName('toolsmenuitem.label'));
			menuitem.addEventListener('command', function() {
				if ('switchToTabHavingURI' in window) {
					window.switchToTabHavingURI(ABOUT_PAGE_URL, true);
				} else if ('contentTabBaseType' in window) {
					let whitelist = window.contentTabBaseType.inContentWhitelist;
					if (whitelist.indexOf(ABOUT_PAGE_URL) < 0) {
						whitelist.push(ABOUT_PAGE_URL);
					}
					window.openContentTab(ABOUT_PAGE_URL);
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
function unpaint(window) {
	let location = window.location.href;
	if (location == LIBRARY_URL) {
		location = BROWSER_URL;
	} else if (location == MESSAGE_WINDOW_URL) {
		location = MESSENGER_URL;
	}
	if (WINDOW_URLS.indexOf(location) >= 0) {
		let document = window.document;
		if (document.menuCSSNode) {
			document.removeChild(document.menuCSSNode);
		}

		unhideItems(document);

		let menuitem = document.getElementById('tools-menufilter');
		if (menuitem) {
			menuitem.remove();
		}
	}
}
function enumerateWindows(callback) {
	let windowEnum = Services.ww.getWindowEnumerator();
	while (windowEnum.hasMoreElements()) {
		callback(windowEnum.getNext());
	}
}
function hideItems(document) {
	let location = document.location;
	if (location == LIBRARY_URL) {
		location = BROWSER_URL;
	} else if (location == MESSAGE_WINDOW_URL) {
		location = MESSENGER_URL;
	}
	MenuFilter.hiddenItems.getList(location).then(function(menus) {
		for (let id of Object.keys(menus)) {
			let list = menus[id];
			let menu = document.getElementById(id);
			if (!menu) {
				continue;
			}
			if (menu.id == 'PanelUI-bookmarks' || menu.id == 'PanelUI-history') {
				menu = menu.querySelector('.panel-subview-body');
			}
			MenuFilter.ensureItemsHaveIDs(menu);
			menu._menufilter_list = list;
			menu.addEventListener('popupshowing', popupShowingListener, true);
			menu.setAttribute('menufilter-listeneradded', true);
			for (let item of list) {
				if (item == 'openintabs-menuitem') {
					// TODO:
					// #BMB_bookmarksPopup doesn't exist if Bookmarks is not on the toolbar
					// and this attribute won't get added if that changes.
					menu.setAttribute('menufilter-openintabs-hidden', 'true');
					continue;
				}
				if (location == MESSENGER_URL && ['mailContext', 'folderPaneContext'].indexOf(id) < 0) {
					let idReplacements = new Map([
						['appmenu_getAllNewMsg', 'appmenu_getNewMsgFor'],
						['appmenu_getnextnmsg', 'appmenu_getNextNMsgs'],
						['appmenu_sendunsentmsgs', 'appmenu_sendUnsentMsgs'],
						['appmenu_trashMenuSeparator', 'appmenu_fileMenuAfterCompactSeparator'],
						['appmenu_offlineMenuItem', 'appmenu_offline'],
						['appmenu_viewheadersmenu', 'appmenu_viewHeadersMenu'],
						['appmenu_addonsManager', 'appmenu_addons']
					]);

					let newID = item.replace(/^(\w+_)?/, 'appmenu_');
					if (idReplacements.has(newID)) {
						newID = idReplacements.get(newID);
					}
					let appmenuitem = document.getElementById(newID);
					if (appmenuitem) {
						appmenuitem.classList.add('menufilter-hidden');
					}
				}
			}
		}
	}).then(null, Components.utils.reportError);
}
function unhideItems(document) {
	for (let menuitem of document.querySelectorAll('.menufilter-hidden')) {
		menuitem.classList.remove('menufilter-hidden');
		if (IS_OSX) {
			menuitem.collapsed = false;
		}
	}
	for (let menupopup of document.querySelectorAll('[menufilter-openintabs-hidden]')) {
		menupopup.removeAttribute('menufilter-openintabs-hidden');
	}
	for (let menupopup of document.querySelectorAll('[menufilter-listeneradded]')) {
		menupopup.removeEventListener('popupshowing', popupShowingListener, true);
		menupopup.removeAttribute('menufilter-listeneradded');
	}
}
function refreshItems() {
	enumerateWindows(function(window) {
		if (WINDOW_URLS.indexOf(window.location.href) >= 0) {
			let document = window.document;
			unhideItems(document);
			hideItems(document);
		}
	});
}
function popupShowingListener(event) {
	let menu = event.originalTarget;
	for (let id of menu._menufilter_list) {
		let menuitem = menu.querySelector('#' + id);
		if (menuitem) {
			menuitem.classList.add('menufilter-hidden');
			if (IS_OSX) {
				menuitem.collapsed = true;
			}
		}
	}

	let shownItems = Array.filter(menu.children, function(i) {
		return !i.hidden && !i.classList.contains('menufilter-hidden');
	});

	let seen = false;
	for (let item of shownItems) {
		item.classList.remove('menufilter-separator-hidden');
		if (item.localName == 'menuseparator') {
			if (!seen) {
				item.classList.add('menufilter-separator-hidden');
			} else {
				seen = false;
			}
		} else {
			seen = true;
		}
	}

	if (!seen) {
		// There's either nothing here or the last item is a visible separator. Hide it.
		for (let i = shownItems.length - 1; i >= 0; i--) {
			let item = shownItems[i];
			if (!item.classList.contains('menufilter-separator-hidden')) {
				item.classList.add('menufilter-separator-hidden');
				break;
			}
		}
	}
}

var donationReminder = {
	currentVersion: 0,
	run: function(version) {
		// Truncate version numbers to floats
		let oldVersion = parseFloat(Services.prefs.getCharPref(PREF_VERSION), 10);
		if (!oldVersion) {
			return;
		}

		this.currentVersion = parseFloat(version, 10);
		let shouldRemind = true;

		if (Services.prefs.getPrefType(PREF_REMINDER) == Components.interfaces.nsIPrefBranch.PREF_INT) {
			let lastReminder = Services.prefs.getIntPref(PREF_REMINDER) * 1000;
			shouldRemind = Date.now() - lastReminder > 604800000;
		}

		if (shouldRemind && Services.vc.compare(oldVersion, this.currentVersion) == -1) {
			idleService.addIdleObserver(this, IDLE_TIMEOUT);
		}
	},
	observe: function(subject, topic) {
		if (topic != 'idle') {
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
var windowObserver = {
	observe: function(subject, topic) {
		if (topic == 'domwindowopened') {
			subject.addEventListener('load', function windowLoad() {
				subject.removeEventListener('load', windowLoad);
				paint(subject);
			});
		} else {
			unpaint(subject);
		}
	}
};
