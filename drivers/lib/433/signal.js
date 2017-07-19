'use strict';

const BaseSignal = require('../BaseSignal');
const SignalManager = Homey.wireless('433').Signal;

module.exports = class Signal extends BaseSignal {
	constructor(signalKey, parser, debounceTime, logger) {
		super(SignalManager, signalKey, parser, debounceTime, logger);
	}
};
