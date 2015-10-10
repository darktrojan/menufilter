/* globals Components, Services, XPCOMUtils */
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

function MenuFilterAboutHandler() {
}

MenuFilterAboutHandler.prototype = {
	newChannel: function(aURI) {
		if (aURI.spec != "about:menufilter")
			return;

		let channel = Services.io.newChannel("chrome://menufilter/content/menu.xul", null, null);
		channel.originalURI = aURI;
		return channel;
	},
	getURIFlags: function() {
		return Components.interfaces.nsIAboutModule.ALLOW_SCRIPT;
	},
	classDescription: "About MenuFilter Page",
	classID: Components.ID("4895bc0b-72f3-48a3-ab89-ff079f51b32d"),
	contractID: "@mozilla.org/network/protocol/about;1?what=menufilter",
	QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIAboutModule])
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([MenuFilterAboutHandler]);
