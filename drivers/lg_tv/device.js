'use strict';

const Homey = require('homey');
const util = require('homey-rfdriver').util;

module.exports = RFDevice => class MyDevice extends RFDevice {

	onInit() {
		super.onInit();

		if (this.isPairInstance) {
			this.setDeviceState({ data: { id: this.getDriver().id } });
		}
	}

	getSendOptionsForCmdObject(cmdObj, options) {
		if (cmdObj.cmd.startsWith('VOLUME_')) {
			return Object.assign(options, { repetitions: 2 });
		}
		return options;
	}

	onFlowActionSendCmdNumber(...args){
		return super.onFlowActionSendCmdNumber(...args)
			.then(() =>
				this.sendCmd('ENTER')
			);
	}

};
