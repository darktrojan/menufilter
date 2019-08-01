/* globals Components, Services, XPCOMUtils */
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');
/* globals idleService */
XPCOMUtils.defineLazyServiceGetter(this, 'idleService', '@mozilla.org/widget/idleservice;1', 'nsIIdleService');

Components.utils.importGlobalProperties(["btoa"]);

const cssData =
	'href="data:text/css;base64,' + btoa(
		".menufilter-hidden, .menufilter-separator-hidden { display: none; }"
	) + '" type="text/css"';

let aboutPage = {};
let strings = Services.strings.createBundle('chrome://menufilter/locale/strings.properties');

let ABOUT_PAGE_URL = 'about:menufilter';
let CHANGELOG_URL = 'https://addons.thunderbird.net/addon/menu-filter/versions/';
let DONATE_URL = 'https://darktrojan.github.io/donate.html?menufilter';
let IDLE_TIMEOUT = 9;
let MESSAGE_WINDOW_URL = 'chrome://messenger/content/messageWindow.xul';
let MESSENGER_URL = 'chrome://messenger/content/messenger.xul';
let PREF_REMINDER = 'extensions.menufilter.donationreminder';
let PREF_VERSION = 'extensions.menufilter.version';
let WINDOW_URLS = [MESSAGE_WINDOW_URL, MESSENGER_URL];

let IS_OSX = Services.appinfo.OS == 'Darwin';

/* exported install, uninstall, startup, shutdown */
/* globals APP_SHUTDOWN, ADDON_INSTALL, ADDON_UPGRADE */
function install(params, reason) {
	if (reason == ADDON_UPGRADE && !Services.prefs.prefHasUserValue(PREF_VERSION)) {
		Services.prefs.setCharPref(PREF_VERSION, params.oldVersion);
	}
}
function uninstall() {
}
function startup(params, reason) {
	/* globals MenuFilter */
	Components.utils.import('chrome://menufilter/content/menufilter.jsm');
	MenuFilter.hiddenItems.registerListener(refreshItems);

	enumerateWindows(function(window) {
		if (['interactive', 'complete'].includes(window.document.readyState)) {
			paint(window);
		} else {
			window.addEventListener('load', function() {
				paint(window);
			}, { once: true });
		}
	});
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
	if (location == MESSAGE_WINDOW_URL) {
		location = MESSENGER_URL;
	}
	if (WINDOW_URLS.includes(location)) {
		let document = window.document;
		let pi = document.createProcessingInstruction('xml-stylesheet', cssData);
		document.insertBefore(pi, document.documentElement);
		document.menuCSSNode = pi;

		hideItems(document);
	}
}
function unpaint(window) {
	let location = window.location.href;
	if (location == MESSAGE_WINDOW_URL) {
		location = MESSENGER_URL;
	}
	if (WINDOW_URLS.includes(location)) {
		let document = window.document;
		if (document.menuCSSNode) {
			document.removeChild(document.menuCSSNode);
		}

		unhideItems(document);
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
	if (location == MESSAGE_WINDOW_URL) {
		location = MESSENGER_URL;
	}
	MenuFilter.hiddenItems.getList(location).then(function(menus) {
		for (let id of Object.keys(menus)) {
			let list = menus[id];
			if (!list.length) {
				// This shouldn't happen, but it does because async. Just go with it.
				continue;
			}
			let menu = document.getElementById(id);
			if (!menu) {
				continue;
			}
			menu.addEventListener('popupshowing', popupShowingListener);
			menu.setAttribute('menufilter-listeneradded', 'true');

			MenuFilter.ensureItemsHaveIDs(menu);
			menu._menufilter_list = list;
			for (let item of list) {
				if (location == MESSENGER_URL && !['mailContext', 'folderPaneContext'].includes(id)) {
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
	for (let menupopup of document.querySelectorAll('[menufilter-listeneradded]')) {
		delete menupopup._menufilter_list;
		menupopup.removeEventListener('popupshowing', popupShowingListener);
		menupopup.removeAttribute('menufilter-listeneradded');
	}
}
function refreshItems() {
	enumerateWindows(function(window) {
		if (WINDOW_URLS.includes(window.location.href)) {
			let document = window.document;
			unhideItems(document);
			hideItems(document);
		}
	});
}
function popupShowingListener({originalTarget: menu}) {
	if (!menu._menufilter_list) {
		return;
	}

	MenuFilter.ensureItemsHaveIDs(menu);
	for (let id of menu._menufilter_list) {
		let menuitem = menu.querySelector('#' + id.replace(/:/g, '\\:'));
		if (menuitem) {
			menuitem.classList.add('menufilter-hidden');
			if (IS_OSX) {
				menuitem.collapsed = true;
			}
		}
	}

	let shownItems = [...menu.children].filter(function(i) {
		return !i.hidden && !i.classList.contains('menufilter-hidden');
	});

	let seen = false;
	for (let item of shownItems) {
		item.classList.remove('menufilter-separator-hidden');
		if (item.localName == 'menuseparator' || item.localName == 'toolbarseparator') {
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
	currentVersionFull: 0,
	run: function(version) {
		// Truncate version numbers to floats
		let oldVersion = parseFloat(Services.prefs.getCharPref(PREF_VERSION), 10);
		if (!oldVersion) {
			return;
		}

		this.currentVersion = parseFloat(version, 10);
		this.currentVersionFull = version;
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
		let changelogLabel = strings.GetStringFromName('changelog.button.label');
		let changelogAccessKey = strings.GetStringFromName('changelog.button.accesskey');
		let donateLabel = strings.GetStringFromName('donate.button.label');
		let donateAccessKey = strings.GetStringFromName('donate.button.accesskey');
		let notificationBox, callback;

		let recentWindow = Services.wm.getMostRecentWindow('mail:3pane');
		if (recentWindow) {
			notificationBox = recentWindow.specialTabs.msgNotificationBar;
			callback = function(url) {
				return function() {
					recentWindow.openLinkExternally(url);
				};
			};
		}

		if (notificationBox) {
			notificationBox.appendNotification(
				message, 'menufilter-donate', 'chrome://menufilter/content/icon16.png',
				notificationBox.PRIORITY_INFO_MEDIUM,
				[{
					label: changelogLabel,
					accessKey: changelogAccessKey,
					callback: callback(CHANGELOG_URL + this.currentVersionFull)
				}, {
					label: donateLabel,
					accessKey: donateAccessKey,
					callback: callback(DONATE_URL)
				}]
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
