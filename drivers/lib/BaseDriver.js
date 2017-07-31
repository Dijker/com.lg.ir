'use strict';

const mixWith = require('./mixwith/mixwith');
global.mix = mixWith.mix;
global.Mixin = mixWith.Mixin;

const EventEmitter = require('events').EventEmitter;
const logLevelMap = new Map([['silly', 1], ['debug', 2], ['verbose', 3], ['info', 4], ['warn', 5], ['error', 6]]);
const sentryLevelMap = new Map([[1, 'debug'], [2, 'debug'], [3, 'debug'], [4, 'info'], [5, 'warning'], [6, 'error']]);
const logLevelNameMap = new Map(
	Array.from(logLevelMap.entries()).map(entry => [entry[1], entry[0][0].toUpperCase().concat(entry[0].slice(1))])
);

const splitCmdRegex = new RegExp(/^(?:(.*)\$~)?(.*?)(~\$(.*))?$/);
const pjson = require('./package.json');

if (process.env.DEBUG === '1') {
	const http = require('http'); // eslint-disable-line

	const options = {
		hostname: 'registry.npmjs.org',
		path: `/${pjson.name}/latest`,
		method: 'GET',
		headers: { 'Content-Type': 'application/json' },
	};

	const req = http.request(options, res => {
		res.setEncoding('utf8');
		res.on('data', dataString => {
			try {
				const data = JSON.parse(dataString);
				if (data.version !== pjson.version) {
					console.log(
						`\x1b[33mA newer version of the 433 generator is available (${pjson.version} -> ${data.version}).\n` +
						'Please run \'npm install -g homey-433\' and \'homey433 generate\' in your project folder to update!\x1b[0m'
					);
				}
			} catch (e) {
				return; // ignore
			}
		});
	});
	req.on('error', e => null);
	req.end();
}

module.exports = class BaseDriver extends EventEmitter {
	constructor(driverType, Signal, driverConfig) {
		super();
		if (!driverConfig) {
			throw new Error('No deviceconfig found in constructor. Make sure you pass config to super call!');
		}
		this.driverType = driverType;
		this.config = driverConfig;
		this.Signal = Signal;
		this.devices = new Map();
		this.state = new Map();
		this.lastFrame = new Map();
		this.settings = new Map();
		this.driverState = {};
		this.isPairing = false;
		this.cmdStructure = { types: {}, subTypes: {} };
		this.deviceCmdCache = new Map();

		this.logLevel = 4;
		this.captureLevel = 5;
		this.logger = {
			setTags: (() => null),
			setUser: (() => null),
			setExtra: (() => null),
			captureMessage: (() => null),
			captureException: (() => null),
			log: (function log(level) {
				const args = Array.prototype.slice.call(arguments, logLevelMap.has(level) ? 1 : 0);
				const logLevelId = logLevelMap.get(level) || 4;

				if (this.logLevel <= logLevelId) {
					if (logLevelId === 6) {
						if (args[0] instanceof Error) {
							Homey.error(`[${logLevelNameMap.get(logLevelId)}]`, args[0].message, args[0].stack);
						} else {
							Homey.error.apply(null, [`[${logLevelNameMap.get(logLevelId)}]`].concat(args));
						}
					} else {
						Homey.log.apply(null, [`[${logLevelNameMap.get(logLevelId)}]`].concat(args));
					}
				}
				if (this.captureLevel <= logLevelId) {
					if (logLevelId === 6 && args[0] instanceof Error) {
						this.logger.captureException(
							args[0],
							Object.assign({ level: sentryLevelMap.get(logLevelId) }, typeof args[1] === 'object' ? args[1] : null)
						);
					} else {
						this.logger.captureMessage(Array.prototype.join.call(args, ' '), { level: sentryLevelMap.get(logLevelId) });
					}
				}
			}).bind(this),
			silly: (function silly() {
				if (this.captureLevel <= 1 || this.logLevel <= 1) {
					this.logger.log.bind(null, 'silly').apply(null, arguments);
				}
			}).bind(this),
			debug: (function debug() {
				if (this.captureLevel <= 2 || this.logLevel <= 2) {
					this.logger.log.bind(null, 'debug').apply(null, arguments);
				}
			}).bind(this),
			verbose: (function verbose() {
				if (this.captureLevel <= 3 || this.logLevel <= 3) {
					this.logger.log.bind(null, 'verbose').apply(null, arguments);
				}
			}).bind(this),
			info: (function info() {
				if (this.captureLevel <= 4 || this.logLevel <= 4) {
					this.logger.log.bind(null, 'info').apply(null, arguments);
				}
			}).bind(this),
			warn: (function warn() {
				if (this.captureLevel <= 5 || this.logLevel <= 5) {
					this.logger.log.bind(null, 'warn').apply(null, arguments);
				}
			}).bind(this),
			error: (function error() {
				if (this.captureLevel <= 6 || this.logLevel <= 6) {
					this.logger.log.bind(null, 'error').apply(null, arguments);
				}
			}).bind(this),
		};

		if (typeof Homey.env.HOMEY_LOG_URL === 'string') {
			const logger = require('homey-log').Log; // eslint-disable-line
			this.logger.setTags = logger.setTags.bind(logger);
			this.logger.setUser = logger.setUser.bind(logger);
			this.logger.setExtra = logger.setExtra.bind(logger);
			this.logger.captureMessage = logger.captureMessage.bind(logger);
			this.logger.captureException = logger.captureException.bind(logger);
		}

		this.signalOptions = Object.assign(
			{
				cmdNumberPrefix: 'number_',
				minTxInterval: 100,
			},
			this.config.signalDefinition.options || {}
		);

		this.emulateToggleBits = this.config.signalDefinition.type === 'prontohex' && this.signalOptions.emulateToggleBits;
		this.cmds = (Array.isArray(this.config.signalDefinition.cmds) ? this.config.signalDefinition.cmds : []);

		if (this.emulateToggleBits) {
			this.cmds = this.cmds.filter(cmd => cmd.indexOf('_1_') === -1);
		}
		if (this.cmds && !this.config.signalDefinition.disableAutoSort && this.sortCmd) {
			this.cmds = this.cmds.sort(this.sortCmd.bind(this, this.cmds.slice()));
		}
		this.logger.info('Cmd List:', this.cmds);

		const nonTranslated = this.cmds
			.map(this.parseCmdId.bind(this))
			.map(cmd => {
				if (cmd) {
					if (cmd.type) {
						this.cmdStructure.types[cmd.type] = this.cmdStructure.types[cmd.type] || { subTypes: {} };
						if (cmd.subType) {
							this.cmdStructure.types[cmd.type].subTypes[cmd.subType] = this.cmdStructure.types[cmd.type].subTypes[cmd.subType] || {}; // eslint-disable-line
							return this.cmdStructure.types[cmd.type].subTypes[cmd.subType][cmd.cmd] = {
								id: cmd.id,
								label: this.getCmdLabel(cmd),
							};
						} else {
							return this.cmdStructure.types[cmd.type][cmd.cmd] = {
								id: cmd.id,
								label: this.getCmdLabel(cmd),
							};
						}
					} else if (cmd.subType) {
						this.cmdStructure.subTypes[cmd.subType] = this.cmdStructure.subTypes[cmd.subType] || {};
						return this.cmdStructure.subTypes[cmd.subType][cmd.cmd] = {
							id: cmd.id,
							label: this.getCmdLabel(cmd),
						};
					} else {
						return this.cmdStructure[cmd.cmd] = {
							id: cmd.id,
							label: this.getCmdLabel(cmd),
						};
					}
				}
			})
			.filter(cmd => cmd.label.indexOf('\u0000\u0000') !== -1);

		if (nonTranslated.length) {
			this.logger.info('Missing translations for:');
			nonTranslated.reduce((list, cmd) => list.add(cmd.label), new Set()).forEach(cmd => console.log(`${cmd}: '',`));
		}

		this.on('frame', (frame) => {
			this.setLastFrame(frame.id, frame);
		});

		if (!this.payloadToData) {
			if (this.cmds && this.cmds.length) {
				this.payloadToData = () => null;
			} else {
				this.payloadToData = this._payloadToData;
			}
		}
	}

	init(exports, connectedDevices, callback) {
		this.logger.silly('Driver:init(exports, connectedDevices, callback)', exports, connectedDevices, callback);
		if (this.config.logLevel) {
			if (!isNaN(this.config.logLevel)) {
				this.logLevel = Number(this.config.logLevel);
			} else if (logLevelMap.has(this.config.logLevel)) {
				this.logLevel = logLevelMap.get(this.config.logLevel);
			}
		}
		if (this.config.captureLevel) {
			if (!isNaN(this.config.captureLevel)) {
				this.captureLevel = Number(this.config.captureLevel);
			} else if (logLevelMap.has(this.config.captureLevel)) {
				this.captureLevel = logLevelMap.get(this.config.captureLevel);
			}
		}
		Homey.log(
			'Initializing driver for', (this.config.id + ' '.repeat(20)).slice(0, 20),
			'with log level', logLevelNameMap.get(this.logLevel),
			'and capture level', logLevelNameMap.get(this.captureLevel)
		);
		this.realtime = (device, cap, val) => this.getDevice(device) && exports.realtime(this.getDevice(device), cap, val);
		this.setAvailable = device => this.getDevice(device) && exports.setAvailable(this.getDevice(device));
		this.setUnavailable = (device, message) => this.getDevice(device) && exports.setUnavailable(this.getDevice(device), message);
		this.getName = (device, callback) => this.getDevice(device) && exports.getName(this.getDevice(device), callback);
		this.getSettingsExt = (device, callback) => (this.getDevice(device) &&
			exports.getSettings(this.getDevice(device), callback)
		) || (callback && callback(new Error('device id does not exist')));
		this.setSettingsExt = (device, settings, callback) => (this.getDevice(device) &&
			exports.setSettings(this.getDevice(device), settings, callback)
		) || (callback && callback(new Error('device id does not exist')));

		this.signal = new this.Signal(
			this.config.signal,
			this.payloadToData.bind(this),
			{
				debounceTime: this.config.debounceTimeout || 500,
				minTxInterval: this.signalOptions.minTxInterval || 0,
				signalDefinition: this.config.signalDefinition,
			},
			this.logger
		);

		connectedDevices.forEach(this.add.bind(this));

		this.signal.on('error', (err) => {
			this.logger.error(err);
			this.emit('signal_error');
		});
		this.signal.on('payload', payload => {
			this.logger.verbose('Driver->payload', payload);
			this.emit('payload', payload);
		});
		this.signal.on('data', frame => {
			this.logger.verbose('Driver->data', frame);
			this.received(frame);
			this.emit('frame', frame);
		});
		this.signal.on('cmd', cmd => {
			this.logger.verbose('Driver->cmd', cmd);
			const cmdObj = this.parseCmdId(cmd);
			this.receivedCmd(cmdObj);
			this.emit('cmd', cmd);
		});
		this.signal.on('payload_send', payload => {
			this.logger.verbose('Driver->payload_send', payload);
			const frame = this.payloadToData(payload);
			if (frame) {
				this.emit('frame', frame);
				this.emit('frame_send', frame);
			}
		});
		this.signal.on('cmd_send', cmd => {
			this.logger.verbose('Driver->cmd_send', cmd);
			const cmdObj = this.parseCmdId(cmd);
			this.onCmdSend(cmdObj);
		});

		if (this.config.triggers && this.config.triggers.find(trigger => trigger.id === `${this.config.id}:received`)) {
			this.on('device_frame_received', (device, data) => {
				this.logger.verbose('Driver->device_frame_received(device, data)', device, data);
				this.handleReceivedTrigger(device, data);
			});
			Homey.manager('flow').on(`trigger.${this.config.id}:received`, (callback, args, state) => {
				this.logger.verbose(
					`Driver->trigger.${this.config.id}:received(callback, args, state)`, callback, args, state
				);
				this.onTriggerReceived(callback, args, state);
			});
		}
		if (this.config.actions && this.config.actions.find(actions => actions.id === `${this.config.id}:send`)) {
			Homey.manager('flow').on(`action.${this.config.id}:send`, (callback, args) => {
				this.logger.verbose(`Driver->action.${this.config.id}:send(callback, args)`, callback, args);
				this.onActionSend(callback, args);
			});
		}
		if (this.config.triggers) {
			const cmdReceivedTrigger = this.config.triggers.find(trigger => trigger.id === `${this.config.id}:cmd_received`);
			if (cmdReceivedTrigger) {
				this.on('device_cmd_received', (device, cmd) => {
					this.logger.verbose('Driver->device_cmd_received(device, cmd)', device, cmd);
					this.handleCmdReceivedTrigger(device, cmd);
				});
				Homey.manager('flow').on(`trigger.${this.config.id}:cmd_received`, (callback, args, state) => {
					this.logger.verbose(
						`Driver->trigger.${this.config.id}:cmd_received(callback, args, state)`, callback, args, state
					);
					this.onTriggerCmdReceived(callback, args, state);
				});
				if ((cmdReceivedTrigger.args.find(arg => arg.name === 'cmd') || {}).type === 'autocomplete') {
					Homey.manager('flow').on(`trigger.${this.config.id}:cmd_received.cmd.autocomplete`, (callback, args) => {
						this.logger.verbose(
							`Driver->trigger.${this.config.id}:cmd_received.cmd.autocomplete(callback, args)`, callback, args
						);
						this.onTriggerCmdReceivedAutocomplete(callback, args);
					});
				}
			}
		}
		if (this.config.actions) {
			const sendCmdAction = this.config.actions.find(actions => actions.id === `${this.config.id}:send_cmd`);
			if (sendCmdAction) {
				Homey.manager('flow').on(`action.${this.config.id}:send_cmd`, (callback, args) => {
					this.logger.verbose(`Driver->action.${this.config.id}:send_cmd(callback, args)`, callback, args);
					this.onActionSendCmd(callback, args);
				});
				if ((sendCmdAction.args.find(arg => arg.name === 'cmd') || {}).type === 'autocomplete') {
					Homey.manager('flow').on(`action.${this.config.id}:send_cmd.cmd.autocomplete`, (callback, args) => {
						this.logger.verbose(
							`Driver->action.${this.config.id}:send_cmd.cmd.autocomplete(callback, args)`, callback, args
						);
						this.onActionSendCmdAutocomplete(callback, args);
					});
				}
			}
		}

		if (callback) {
			callback();
		}
	}

	add(device) {
		this.logger.silly('Driver:add(device)', device);
		this.logger.info('adding device', device);
		const id = this.getDeviceId(device);
		const lastFrame = this.getLastFrame(device);
		const state = this.getState(device);
		this.devices.set(id, device.data || device);
		this.setState(id, state || {});
		this.setLastFrame(id, lastFrame || Object.assign({}, device.data));
		this.getSettingsExt(id, (err, settings) => this.updateSettings(id, settings));
		this.registerSignal();
		this.emit('added', Object.assign({ id }, this.getDevice(id)));
		this.logger.setExtra(
			{ [this.config.id]: Object.assign(this.driverState, { devices: Array.from(this.devices.entries()) }) }
		);
	}

	get(device) {
		this.logger.silly('Driver:get(device)', device);
		const id = this.getDeviceId(device);
		if (this.devices.has(id)) {
			return Object.assign({}, this.getDevice(id), { state: this.getState(id), lastFrame: this.getLastFrame(id) });
		}
		return null;
	}

	getDevice(device, includePairing) {
		this.logger.silly('Driver:getDevice(device, includePairing)', device, includePairing);
		const id = this.getDeviceId(device);
		if (this.devices.has(id)) {
			return this.devices.get(id);
		} else if (includePairing && this.pairingDevice && this.pairingDevice.data && this.pairingDevice.data.id === id) {
			return this.pairingDevice.data;
		}
		return null;
	}

	getDeviceId(device) {
		this.logger.silly('Driver:getDeviceId(device)', device);
		if (device && device.constructor) {
			if (device.constructor.name === 'Object') {
				if (device.id) {
					return device.id;
				} else if (device.data && device.data.id) {
					return device.data.id;
				}
			} else if (device.constructor.name === 'String') {
				return device;
			}
		}
		return null;
	}

	getState(device) {
		this.logger.silly('Driver:getState(device)', device);
		const id = this.getDeviceId(device);
		device = this.getDevice(id);
		if (device && this.state.has(id)) {
			return this.state.get(id) || {};
		} else if (this.pairingDevice && this.pairingDevice.data.id === id) {
			return this.state.get('_pairingDevice') || {};
		}
		return Homey.manager('settings').get(`${this.config.name}:${id}:state`) || {};
	}

	setState(device, state) {
		this.logger.silly('Driver:setState(device, state)', device, state);
		const id = this.getDeviceId(device);
		device = this.getDevice(id);
		if (device) {
			if (this.state.has(id)) {
				this.emit('new_state', device, state, this.state.get(id) || {});
			}
			this.state.set(id, state);
			Homey.manager('settings').set(`${this.config.name}:${id}:state`, state);
		}
		if (this.pairingDevice && this.pairingDevice.data.id === id) {
			if (this.state.has('_pairingDevice')) {
				this.emit('new_state', this.pairingDevice.data, state, this.state.get('_pairingDevice') || {});
			}
			this.state.set('_pairingDevice', state);
		}
		this.logger.setExtra(
			{ [this.config.id]: Object.assign(this.driverState, { state: Array.from(this.state.entries()) }) }
		);
	}

	getLastFrame(device) {
		this.logger.silly('Driver:getLastFrame(device)', device);
		const id = this.getDeviceId(device);
		device = this.getDevice(id);
		if (device && this.lastFrame.has(id)) {
			return this.lastFrame.get(id);
		} else if (this.pairingDevice && this.pairingDevice.data.id === id) {
			return this.lastFrame.get('_pairingDevice');
		}
		return Homey.manager('settings').get(`${this.config.name}:${id}:lastFrame`) || {};
	}

	setLastFrame(device, frame) {
		this.logger.silly('Driver:setLastFrame(device, frame)', device, frame);
		const id = this.getDeviceId(device);
		device = this.getDevice(id);
		if (device) {
			if (this.lastFrame.has(id)) {
				this.emit('new_frame', device, frame, this.lastFrame.get(id));
			}
			this.lastFrame.set(id, frame);
			Homey.manager('settings').set(`${this.config.name}:${id}:lastFrame`, frame);
		}
		if (this.pairingDevice && this.pairingDevice.data.id === id) {
			if (this.lastFrame.has('_pairingDevice')) {
				this.emit('new_frame', this.pairingDevice.data, frame, this.lastFrame.get('_pairingDevice'));
			}
			this.lastFrame.set('_pairingDevice', frame);
		}
		this.logger.setExtra(
			{ [this.config.id]: Object.assign(this.driverState, { lastFrame: Array.from(this.lastFrame.entries()) }) }
		);
	}

	deleted(device) {
		this.logger.silly('Driver:deleted(device)', device);
		this.logger.info('deleting device', device);
		const id = this.getDeviceId(device);
		const target = Object.assign({ id }, this.getDevice(id));
		this.devices.delete(id);
		this.state.delete(id);
		this.lastFrame.delete(id);
		this.settings.delete(id);
		this.unregisterSignal();
		this.emit('deleted', target);
		this.logger.setExtra(
			{ [this.config.id]: Object.assign(this.driverState, { devices: Array.from(this.devices.entries()) }) }
		);
	}

	received(data) {
		this.logger.silly('Driver:received(data)', data);
		this.emit('frame_received', data);
		const device = this.getDevice(data.id);
		if (device) {
			this.emit('device_frame_received', device, data);
		}
	}

	receivedCmd(cmdObj) {
		this.logger.silly('Driver:receivedCmd(cmdObj)', cmdObj);
		this.emit('cmd_received', cmdObj);
		this.getDevicesByCmd(cmdObj).forEach((device) => {
			this.emit('device_cmd_received', device, cmdObj.cmd);
		});
	}

	onCmdSend(cmdObj) {
		this.logger.silly('Driver:onCmdSend(cmdObj)', cmdObj);
		this.emit('cmd_send', cmdObj);
		this.getDevicesByCmd(cmdObj).forEach((device) => {
			this.emit('device_cmd_send', device, cmdObj.cmd);
		});
	}

	send(device, data, callback, options) {
		this.logger.silly('Driver:send(device, data, callback, options)', device, data, callback, options);
		return new Promise((resolve, reject) => {
			callback = typeof callback === 'function' ? callback : () => null;
			options = options || {};
			data = Object.assign({}, this.getDevice(device, true) || device.data || device, data);
			this.emit('before_send', data);

			const payload = this.dataToPayload(data);
			if (!payload) {
				const err = new Error(`DataToPayload(${JSON.stringify(data)}) gave empty response: ${payload}`);
				this.logger.error(err);
				reject(err);
				this.setUnavailable(device, __('433_generator.error.invalid_device'));
				return callback(err);
			}
			const frame = payload.map(Number);
			const dataCheck = this.payloadToData(frame);
			if (
				frame.find(isNaN) || !dataCheck ||
				dataCheck.constructor !== Object || !dataCheck.id ||
				dataCheck.id !== this.getDeviceId(device)
			) {
				const err = new Error(`Incorrect frame from dataToPayload(${JSON.stringify(data)}) => ${frame} => ${
					JSON.stringify(dataCheck)}`);
				this.logger.error(err);
				reject(err);
				this.setUnavailable(device, __('433_generator.error.invalid_device'));
				return callback(true);
			}
			if (typeof options.beforeSendData === 'function') {
				options.beforeSendData(data, frame);
			}
			this.emit('send', data);
			resolve((options.signal || this.signal).send(frame).then(result => {
				if (callback) callback(null, result);
				if (typeof options.afterSendData === 'function') {
					options.afterSendData(data);
				}
				this.emit('after_send', data);
			}).catch(err => {
				this.logger.error(err);
				if (callback) callback(err);
				this.emit('error', err);
				throw err;
			}));
		}).catch((e) => {
			setTimeout(() => {
				throw e;
			});
		});
	}

	sendCmd(device, cmd, callback, options) {
		this.logger.silly('Driver:sendCmd(device, cmd, callback, options)', device, cmd, callback, options);
		return new Promise((resolve, reject) => {
			callback = typeof callback === 'function' ? callback : () => null;
			options = options || {};
			const cmdObj = this.parseCmdId(cmd);
			if (!cmdObj) {
				const err = new Error(`${cmd} is not a valid command string`);
				this.logger.error(err);
				reject(err);
				return callback(err);
			}
			cmd = cmdObj.cmd;
			this.emit('before_send_cmd', cmd);

			const cmdKey = this.getCmdsForDevice(device).get(cmd);
			if (!cmdKey) {
				const err = new Error(`Device of type ${device.cmdType} and subtype ${device.cmdSubType
					} does not have cmd ${cmd}`);
				this.logger.error(err);
				reject(err);
				return callback(err);
			}
			if (typeof options.beforeSendCmd === 'function') {
				options.beforeSendCmd(cmd, cmdKey);
			}
			this.emit('send_cmd', cmd);
			let sendCmd = cmdKey.id;
			if (this.emulateToggleBits) {
				const cmdKeyObj = this.parseCmdId(cmdKey.id);
				sendCmd = `${cmdKeyObj.type ? `${cmdKeyObj.type}$~` : ''
					}${cmdKeyObj.cmd}${(options.signal || this.signal).shouldToggle() ? '_1_' : ''
					}${cmdKeyObj.subType ? `~$${cmdKeyObj.subType}` : ''}`;
			}
			resolve((options.signal || this.signal).sendCmd(sendCmd).then(result => {
				if (callback) callback(null, result);
				if (typeof options.afterSendCmd === 'function') {
					options.afterSendCmd(cmd, cmdKey);
				}
				this.emit('after_send_cmd', cmd);
			}).catch(err => {
				this.logger.error(err);
				if (callback) callback(err);
				this.emit('error', err);
				throw err;
			}));
		}).catch((e) => {
			setTimeout(() => {
				throw e;
			});
		});
	}

	generateDevice(data) {
		this.logger.silly('Driver:generateDevice(data)', data);
		data = data || {};
		const typeObj = {};
		if (this.config.cmdType) {
			typeObj.cmdType = this.config.cmdType;
		}
		if (this.config.cmdSubType) {
			typeObj.cmdSubType = this.config.cmdSubType;
		}
		return {
			name: __(this.config.name),
			data: Object.assign(
				{
					overridden: false,
					id: this.config.id,
				},
				data,
				{ driver_id: this.config.id },
				typeObj
			),
		};
	}

	assertDevice(device, callback) {
		this.logger.silly('Driver:assertDevice(device, callback)', device, callback);
		if (!device || !this.getDeviceId(device)) {
			callback(new Error('433_generator.error.no_device'));
		} else if (this.getDevice(device)) {
			callback(new Error('433_generator.error.device_exists'));
		} else if (!this.dataToPayload(device.data || device)) {
			callback(new Error('433_generator.error.invalid_data'));
		} else {
			callback(null, device);
		}
	}

	// TODO document that this function should be overwritten
	_payloadToData(payload) { // Convert received data to usable variables
		throw new Error(`payloadToData(payload) should be overwritten by own driver for device ${this.config.id}`);
	}

	// TODO document that this function should be overwritten
	dataToPayload(data) { // Convert received data to usable variables
		throw new Error(`dataToPayload(data) should be overwritten by own driver for device ${this.config.id}`);
	}

	registerSignal(callback) {
		this.logger.verbose('Driver:registerSignal(callback)', callback);
		return this.signal.register(callback).catch(err => {
			this.devices.forEach(device =>
				this.setUnavailable(device, __('433_generator.error.cannot_register_signal'))
			);
			return Promise.reject(err);
		});
	}

	unregisterSignal() {
		this.logger.verbose('Driver:unregisterSignal()+shouldUnregister', !this.isPairing && this.devices.size === 0);
		if (!this.isPairing && this.devices.size === 0) {
			this.signal.unregister();
			return true;
		}
		return false;
	}

	parseCmdId(cmd) {
		const cmdParts = splitCmdRegex.exec(cmd);
		if (cmdParts.length === 2) {
			return {
				id: cmd,
				cmd: cmdParts[1],
			};
		} else if (cmdParts.length === 3) {
			return {
				id: cmd,
				type: cmdParts[1],
				cmd: cmdParts[2],
			};
		} else if (cmdParts.length === 5) {
			return {
				id: cmd,
				type: cmdParts[1],
				cmd: cmdParts[2],
				subType: cmdParts[4],
			};
		} else if (cmdParts.length === 4) {
			return {
				id: cmd,
				cmd: cmdParts[1],
				subType: cmdParts[3],
			};
		}
		return null;
	}

	getCmd(cmdObj) {
		cmdObj = typeof cmdObj === 'string' ? this.parseCmdId(cmdObj) : cmdObj;
		if (this.cmdStructure.types[cmdObj.type]) {
			if (this.cmdStructure.types[cmdObj.type].subTypes[cmdObj.subType]
				&& this.cmdStructure.types[cmdObj.type].subTypes[cmdObj.subType][cmdObj.cmd]
			) {
				return this.cmdStructure.types[cmdObj.type].subTypes[cmdObj.subType][cmdObj.cmd];
			} else if (this.cmdStructure.types[cmdObj.type][cmdObj.cmd]) {
				return this.cmdStructure.types[cmdObj.type][cmdObj.cmd];
			}
		}
		if (this.cmdStructure.subTypes[cmdObj.subType] && this.cmdStructure.subTypes[cmdObj.subType][cmdObj.cmd]) {
			return this.cmdStructure.subTypes[cmdObj.subType][cmdObj.cmd];
		}
		if (this.cmdStructure[cmdObj.cmd]) {
			return this.cmdStructure[cmdObj.cmd];
		}
		return null;
	}

	getCmdLabel(cmdObj) {
		cmdObj = typeof cmdObj === 'string' ? this.parseCmdId(cmdObj) : cmdObj;
		let result = (this.getCmd(cmdObj) || {}).label;
		if (result) {
			return result;
		}
		if (!result && cmdObj.type && cmdObj.subType) {
			const key = `cmds.${cmdObj.type}.${cmdObj.cmd}.${cmdObj.subType}`;
			result = __(key);
			result = result === key ? null : result;
		}
		if (!result && cmdObj.type) {
			const defaultKey = `cmds.${cmdObj.type}.${cmdObj.cmd}.default`;
			result = __(defaultKey);
			result = result === defaultKey ? null : result;
			if (!result) {
				const key = `cmds.${cmdObj.type}.${cmdObj.cmd}`;
				result = __(key);
				result = result === key ? null : result;
			}
		}
		if (!result && cmdObj.subType) {
			const key = `cmds.${cmdObj.cmd}.${cmdObj.subType}`;
			result = __(key);
			result = result === key ? null : result;
		}
		if (!result) {
			const defaultKey = `cmds.${cmdObj.cmd}.default`;
			result = __(defaultKey);
			result = result === defaultKey ? null : result;
		}
		if (!result) {
			const key = `cmds.${cmdObj.cmd}`;
			result = __(key);
			result = result === key ? null : result;
		}
		if (!result) {
			const key = `${this.driverType}_generator.button_labels.${cmdObj.cmd}`;
			result = __(key);
			result = result === key ? null : result;
		}
		if (!result) {
			return `${cmdObj.cmd}\u0000\u0000`;
		}
		return result;
	}

	getCmdsForDevice(device) {
		device = this.getDevice(device);
		const typeDef = Object.assign({}, device, device.metadata);
		const cmdType = typeDef.hasOwnProperty('cmdType') ? typeDef.cmdType : this.config.cmdType;
		const cmdSubType = typeDef.hasOwnProperty('cmdSubType') ? typeDef.cmdSubType : this.config.cmdSubType;
		const cacheKey = `${cmdType && cmdType !== 'default' ? cmdType : ''
			}$~$${cmdSubType && cmdSubType !== 'default' ? cmdSubType : ''}`;
		if (!this.deviceCmdCache.has(cacheKey)) {
			const resultMap = new Map();
			const addCmds = (obj) => {
				if (!obj || typeof obj !== 'object') return;
				Object.keys(obj).forEach((cmd) => {
					if (typeof obj[cmd].id !== 'string') return;
					resultMap.set(cmd, obj[cmd]);
				});
			};

			addCmds(this.cmdStructure);
			if (cmdSubType && cmdSubType !== 'default') {
				addCmds(this.cmdStructure.subTypes[cmdSubType]);
			}
			if (cmdType && cmdType !== 'default') {
				addCmds(this.cmdStructure.types[cmdType]);
				if (cmdSubType && cmdSubType !== 'default') {
					addCmds(this.cmdStructure.types[cmdType].subTypes[cmdSubType]);
				}
			}
			this.deviceCmdCache.set(cacheKey, resultMap);
			return resultMap;
		}
		return this.deviceCmdCache.get(cacheKey);
	}

	getDevicesByCmd(cmdObj) {
		cmdObj = typeof cmdObj === 'string' ? this.parseCmdId(cmdObj) : cmdObj;
		const result = [];
		for (const entry of this.devices) {
			if (cmdObj.type) {
				if (entry[1].cmdType !== cmdObj.type) continue;
			} else {
				if (entry[1].cmdType && entry[1].cmdType !== 'default' &&
					this.cmds.indexOf(`${entry[1].cmdType}$~${cmdObj.id}`) !== -1) continue;
			}
			if (cmdObj.subType) {
				if (entry[1].cmdSubType !== cmdObj.subType) continue;
			} else {
				if (entry[1].cmdSubType && entry[1].cmdSubType !== 'default' &&
					this.cmds.indexOf(`${cmdObj.id}~$${entry[1].cmdSubType}`) !== -1) continue;
			}
			result.push(entry[1]);
		}
		return result;
	}

	handleReceivedTrigger(device, data) {
		this.logger.silly('Driver:handleReceivedTrigger(device, data)', device, data);
		if (data.id === device.id) {
			Homey.manager('flow').triggerDevice(
				`${this.config.id}:received`,
				null,
				Object.assign({}, { device: device }, data),
				this.getDevice(device), err => {
					if (err) Homey.error('Trigger error', err);
				}
			);
		}
	}

	handleCmdReceivedTrigger(device, cmd) {
		this.logger.silly('Driver:handleCmdReceivedTrigger(device, data)', device, cmd);
		Homey.manager('flow').triggerDevice(
			`${this.config.id}:cmd_received`,
			null,
			{ cmd },
			this.getDevice(device), err => {
				if (err) Homey.error('Trigger error', err);
			}
		);
	}

	onTriggerReceived(callback, args, state) {
		this.logger.silly('Driver:onTriggerReceived(callback, args, state)', callback, args, state);
		callback(null, Object.keys(args).reduce(
			(result, curr) => result && String(args[curr]) === String(state[curr]),
			true
		));
	}

	onTriggerCmdReceived(callback, args, state) {
		this.logger.silly('Driver:onTriggerCmdReceived(callback, args, state)', callback, args, state);
		callback(null, args.cmd.cmd === state.cmd);
	}

	onTriggerCmdReceivedAutocomplete(callback, args) {
		this.logger.silly('Driver:onTriggerCmdReceivedAutocomplete(callback, args, state)', callback, args);
		const device = this.getDevice(args.args.device);
		if (device) {
			const cmdMap = this.getCmdsForDevice(device);
			const resultList = [];
			const query = args.query.toLowerCase();
			for (const entry of cmdMap) {
				if (entry[1].label.toLowerCase().indexOf(query) !== -1 || entry[0].toLowerCase().indexOf(query) !== -1) {
					resultList.push({
						name: entry[1].label,
						cmd: entry[0],
					});
				}
			}
			callback(null, resultList.sort((a, b) => this.cmds.indexOf(a.cmd) - this.cmds.indexOf(b.cmd)));
		} else {
			callback('Could not find device');
		}
	}

	onActionSendCmdAutocomplete(callback, args) {
		this.logger.silly('Driver:onTriggerSendCmdAutocomplete(callback, args, state)', callback, args);
		this.onTriggerCmdReceivedAutocomplete(callback, args);
	}

	onActionSend(callback, args) {
		this.logger.silly('Driver:onActionSend(callback, args)', callback, args);
		const device = this.getDevice(args.device);
		if (device) {
			this.send(device, args).then(() => callback(null, true)).catch(callback);
		} else {
			callback('Could not find device');
		}
	}

	onActionSendCmd(callback, args) {
		this.logger.silly('Driver:onActionSendCmd(callback, args)', callback, args);
		const device = this.getDevice(args.device);
		if (device) {
			this.sendCmd(device, args.cmd.cmd).then(() => callback(null, true)).catch(callback);
		} else {
			callback('Could not find device');
		}
	}

	bitStringToBitArray(bitString) {
		this.logger.silly('Driver:bitStringToBitArray(bitString)', bitString);
		const bitArray = bitString.split('').map(Number);
		if (bitArray.find(isNaN)) {
			const err = new Error(`[Error] Bitstring (${bitString}) contains non-integer values`);
			this.logger.error(err);
			this.emit('error', err);
		}
		return bitArray;
	}

	bitArrayToString(inputBitArray) {
		this.logger.silly('Driver:bitArrayToString(inputBitArray)', inputBitArray);
		const bitArray = inputBitArray.slice(0).map(Number);
		if (bitArray.find(isNaN)) {
			const err = new Error(`[Error] Bitarray (${inputBitArray}) contains non-integer values`);
			this.logger.error(err);
			this.emit('error', err);
		}
		return bitArray.join('');
	}

	bitArrayToNumber(inputBitArray) {
		this.logger.silly('Driver:bitArrayToNumber(inputBitArray)', inputBitArray);
		const bitArray = inputBitArray.slice(0).map(Number);
		if (bitArray.find(nr => nr !== 0 && nr !== 1)) {
			const err = new Error(`[Error] Bitarray (${inputBitArray}) contains non-binary values`);
			this.logger.error(err);
			this.emit('error', err);
		}
		return parseInt(bitArray.join(''), 2);
	}

	numberToBitArray(inputNumber, length) {
		this.logger.silly('Driver:numberToBitArray(inputNumber, length)', inputNumber, length);
		const number = Number(inputNumber);
		if (isNaN(number) || number % 1 !== 0) {
			const err = new Error(`[Error] inputNumber (${inputNumber}) is a non-integer value`);
			this.logger.error(err);
			this.emit('error', err);
		}
		return '0'
			.repeat(length)
			.concat(number.toString(2))
			.substr(length * -1)
			.split('')
			.map(Number);
	}

	bitArrayXOR(arrayA, arrayB) {
		this.logger.silly('Driver:bitArrayXOR(arrayA, arrayB)', arrayA, arrayB);
		if (arrayA.length !== arrayB.length) {
			const err = new Error(`[Error] bitarrays [${arrayA}] and [${arrayB}] do not have the same length`);
			this.logger.error(err);
			this.emit('error', err);
		}
		if (arrayA.find(nr => nr !== 0 && nr !== 1) || arrayB.find(nr => nr !== 0 && nr !== 1)) {
			const err = new Error(`[Error] Bitarray [${arrayA}] and/or [${arrayB}] contain non-binary values`);
			this.logger.error(err);
			this.emit('error', err);
		}
		return arrayA.map((val, index) => val !== arrayB[index] ? 1 : 0);
	}

	generateRandomBitString(length) {
		return new Array(length)
			.fill(null)
			.map(() => Math.round(Math.random()))
			.join('');
	}

	getSettings(device) {
		this.logger.silly('Driver:getSettings(device)', device);
		const id = this.getDeviceId(device);
		if (this.pairingDevice && this.pairingDevice.data && this.pairingDevice.data.id === id) {
			return this.pairingDevice.settings || {};
		} else if (id) {
			return this.settings.get(id) || {};
		}
		return {};
	}

	setSettings(device, settings, callback) {
		this.logger.silly('Driver:setSettings(device, settings, callback)', device, settings, callback);
		const id = this.getDeviceId(device);
		if (this.pairingDevice && this.pairingDevice.data && this.pairingDevice.data.id === id) {
			const newSettings = Object.assign(this.pairingDevice.settings = this.pairingDevice.settings || {}, settings);
			if (callback) {
				callback(null, newSettings);
			}
		} else if (id) {
			this.setSettingsExt(device, Object.assign(this.settings.get(id) || {}, settings), callback);
		}
		this.settings.set(id, Object.assign(this.settings.get(id) || {}, settings));
		this.logger.setExtra(
			{ [this.config.id]: Object.assign(this.driverState, { settings: Array.from(this.settings.entries()) }) }
		);
	}

	updateSettings(device, settings, oldSettings, changedKeys, callback) {
		this.logger.silly(
			'Driver:updateSettings(device, settings, oldSettings, changedKeys, callback)',
			device, settings, oldSettings, changedKeys, callback
		);
		if (!settings) {
			if (callback) {
				callback(new Error(__('433_generator.error.emptySettings')));
			}
		} else {
			const id = this.getDeviceId(device);
			this.settings.set(id, Object.assign({}, this.settings.get(id) || {}, settings || {}));
			if (callback) {
				callback(null, true);
			}
		}
		this.logger.setExtra(
			{ [this.config.id]: Object.assign(this.driverState, { settings: Array.from(this.settings.entries()) }) }
		);
	}

	getExports() {
		this.logger.silly('Driver:getExports()');
		return {
			init: this.init.bind(this),
			pair: this.pair.bind(this),
			deleted: this.deleted.bind(this),
			added: this.add.bind(this),
			settings: this.updateSettings.bind(this),
			driver: this,
		};
	}
};
