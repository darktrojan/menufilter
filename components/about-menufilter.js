/* globals Components, Services, XPCOMUtils */
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');
const generateQI = 'generateQI' in XPCOMUtils ? XPCOMUtils.generateQI : ChromeUtils.generateQI;

function MenuFilterAboutHandler() {
}

MenuFilterAboutHandler.prototype = {
	newChannel: function(uri, loadInfo) {
		if (uri.spec != 'about:menufilter') {
			return null;
		}

		let newURI = Services.io.newURI('chrome://menufilter/content/menu.xul', null, null);
		let channel = Services.io.newChannelFromURIWithLoadInfo(newURI, loadInfo);
		channel.originalURI = uri;
		return channel;
	},
	getURIFlags: function() {
		return Components.interfaces.nsIAboutModule.ALLOW_SCRIPT;
	},
	classDescription: 'About MenuFilter Page',
	classID: Components.ID('4895bc0b-72f3-48a3-ab89-ff079f51b32d'),
	contractID: '@mozilla.org/network/protocol/about;1?what=menufilter',
	QueryInterface: generateQI([Components.interfaces.nsIAboutModule])
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([MenuFilterAboutHandler]);
