'use strict';

const BaseDriver = require('../BaseDriver');
const Signal = require('./signal');

module.exports = class Driver extends BaseDriver {

	constructor(driverConfig){
		super('433', Signal, driverConfig);
	}

	// TODO document that this function should be overwritten
	codewheelsToData(codewheelIndexes) { // Convert user set bitswitches to usable data object
		throw new Error(
			`codewheelsToData(codewheelIndexes) should be overwritten by own driver for device ${this.config.id}`
		);
	}

	// TODO document that this function should be overwritten
	dipswitchesToData(dipswitches) { // Convert user set bitswitches to usable data object
		throw new Error(`dipswitchToData(dipswitches) should be overwritten by own driver for device ${this.config.id}`);
	}

	// TODO document that this function should be overwritten
	generateData() {
		throw new Error(`generateData() should be overwritten by own driver for device ${this.config.id}`);
	}

	sendProgramSignal(device, callback) {
		this.logger.silly('Driver:sendProgramSignal(device, callback)', device, callback);
		const exports = this.getExports();
		if (exports.capabilities) {
			Object.keys(exports.capabilities).forEach(capability => {
				if (exports.capabilities[capability].get && exports.capabilities[capability].set) {
					exports.capabilities[capability].get(device, (err, result) => {
						if (typeof result === 'boolean') {
							this.logger.info(
								'sending program',
								`capabilities.${capability}.set(${JSON.stringify(device)}, true, ${callback})`
							);
							exports.capabilities[capability].set(device, true, callback);
						}
					});
				}
			});
		} else {
			this.logger.warn('Device does not have boolean capability');
			callback(new Error('Device does not have boolean capability'));
		}
		callback(null, true);
	}

	pair(socket) { // Pair sequence
		this.logger.verbose('Driver:pair(socket)', socket);
		this.logger.info('opening pair wizard');
		this.isPairing = true;
		this.registerSignal();
		const receivedListener = (frame) => {
			this.logger.verbose('emitting frame to pairing wizard', frame);
			socket.emit('frame', frame);
		};

		this.on('frame', receivedListener);

		socket.on('next', (data, callback) => {
			this.logger.verbose('Driver:pair->next(data, callback)', data, callback);
			socket.emit('nextView', this.config.pair.views.map(view => view.id));
			callback();
		});

		socket.on('previous', (data, callback) => {
			this.logger.verbose('Driver:pair->previous(data, callback)', data, callback);
			socket.emit('previousView', this.config.pair.views.map(view => view.id));
			callback();
		});

		socket.on('set_device', (data, callback) => {
			this.logger.verbose(
				'Driver:pair->set_device(data, callback)+this.pairingDevice', data, callback, this.pairingDevice
			);
			if (this.getDevice(data)) {
				return callback(new Error('433_generator.error.device_exists'));
			}
			const device = this.generateDevice(data);
			if (!device) {
				return callback(new Error('433_generator.error.invalid_device'));
			}

			this.pairingDevice = device;
			this.setLastFrame(device, data);
			this.emit('new_pairing_device', this.pairingDevice);
			return callback(null, this.pairingDevice);
		});

		socket.on('set_device_dipswitches', (dipswitches, callback) => {
			this.logger.verbose(
				'Driver:pair->set_device_dipswitches(dipswitches, callback)+this.pairingDevice',
				dipswitches, callback, this.pairingDevice
			);
			const data = this.dipswitchesToData(dipswitches.slice(0));
			if (!data) return callback(new Error('433_generator.error.invalid_dipswitch'));
			const device = this.generateDevice(Object.assign({ dipswitches: dipswitches }, data));
			if (!device) {
				return callback(new Error('433_generator.error.invalid_device'));
			}

			this.pairingDevice = device;
			this.setLastFrame(device, data);
			this.emit('new_pairing_device', this.pairingDevice);
			return callback(null, this.pairingDevice);
		});

		socket.on('set_device_codewheels', (codewheelIndexes, callback) => {
			this.logger.verbose(
				'Driver:pair->set_device_codewheels(codewheelIndexes, callback)+this.pairingDevice',
				codewheelIndexes, callback, this.pairingDevice
			);
			const data = this.codewheelsToData(codewheelIndexes.slice(0));
			if (!data) return callback(new Error('433_generator.error.invalid_codewheelIndexes'));
			const device = this.generateDevice(Object.assign({ codewheelIndexes }, data));
			if (!device) {
				return callback(new Error('433_generator.error.invalid_device'));
			}

			this.pairingDevice = device;
			this.setLastFrame(device, data);
			this.emit('new_pairing_device', this.pairingDevice);
			return callback(null, this.pairingDevice);
		});

		socket.on('get_device', (data, callback) => {
			this.logger.verbose(
				'Driver:pair->get_device(data, callback)+this.pairingDevice', data, callback, this.pairingDevice
			);
			callback(null, data && data.id ? this.getDevice(data.id) : this.pairingDevice);
		});

		socket.on('program', (data, callback) => {
			this.logger.verbose(
				'Driver:pair->program(data, callback)+this.pairingDevice', data, callback, this.pairingDevice
			);
			let device;
			do {
				device = this.generateDevice(Object.assign(this.generateData(), { generated: true }));
			} while (this.get(device));
			if (!device) {
				return callback(new Error('433_generator.error.invalid_device'));
			}

			this.pairingDevice = device;
			this.setLastFrame(device, data);
			this.emit('new_pairing_device', this.pairingDevice);
			callback(null, this.pairingDevice);
		});

		socket.on('program_send', (data, callback) => {
			this.logger.verbose(
				'Driver:pair->program_send(data, callback)+this.pairingDevice', data, callback, this.pairingDevice
			);
			if (this.pairingDevice && this.pairingDevice.data) {
				return this.sendProgramSignal(this.pairingDevice.data, callback);
			}
			return callback(new Error('433_generator.error.no_device'));
		});

		socket.on('test', (data, callback) => {
			this.logger.verbose('Driver:pair->test(data, callback)+this.pairingDevice', data, callback, this.pairingDevice);
			callback(
				!this.pairingDevice,
				this.pairingDevice ?
					Object.assign(
						{},
						this.pairingDevice,
						{ data: Object.assign({}, this.pairingDevice.data, this.getLastFrame(this.pairingDevice)) || {} }
					) :
					null
			);
		});

		socket.on('override_device', (data, callback) => {
			if (!this.pairingDevice) {
				return callback(new Error('433_generator.error.no_device'));
			}
			if (!(data && data.constructor === Object)) {
				return callback(new Error('Data must be an object!'), this.pairingDevice.data);
			}
			const newPairingDeviceData = Object.assign({}, this.pairingDevice.data, data, { overridden: true });
			const payload = this.dataToPayload(newPairingDeviceData);
			if (!payload) {
				return callback(
					new Error('New pairing device data is invalid, changes are reverted.'),
					this.pairingDevice.data
				);
			}
			const frame = payload.map(Number);
			const dataCheck = this.payloadToData(frame);
			if (
				frame.find(isNaN) || !dataCheck ||
				dataCheck.constructor !== Object || !dataCheck.id ||
				dataCheck.id !== this.getDeviceId(newPairingDeviceData)
			) {
				return callback(
					new Error('New pairing device data is invalid, changes are reverted.'),
					this.pairingDevice.data
				);
			}
			this.pairingDevice.data = newPairingDeviceData;
			callback(null, this.pairingDevice.data);
		});

		socket.on('done', (data, callback) => {
			this.logger.verbose('Driver:pair->done(data, callback)+this.pairingDevice', data, callback, this.pairingDevice);
			if (!this.pairingDevice) {
				return callback(new Error('433_generator.error.no_device'));
			}
			return callback(null, this.pairingDevice);
		});

		socket.on('send', (data, callback) => {
			this.logger.verbose('Driver:pair->send(data, callback)+this.pairingDevice', data, callback, this.pairingDevice);
			if (this.pairingDevice && this.pairingDevice.data) {
				this.send(this.pairingDevice.data, data).then(callback.bind(false)).catch(callback);
			}
			return callback(new Error('433_generator.error.no_device'));
		});

		socket.on('set_settings', (data, callback) => {
			this.logger.verbose(
				'Driver:pair->set_settings(data, callback)+this.pairingDevice', data, callback, this.pairingDevice
			);
			if (this.pairingDevice && this.pairingDevice.data) {
				this.setSettings(this.pairingDevice.data.id, data, callback);
			} else {
				callback(new Error('433_generator.error.no_device'));
			}
		});

		socket.on('get_settings', (data, callback) => {
			this.logger.verbose(
				'Driver:pair->get_settings(data, callback)+this.pairingDevice', data, callback, this.pairingDevice
			);
			if (!this.pairingDevice) {
				return callback(new Error('433_generator.error.no_device'));
			}
			return callback(null, this.getSettings(this.pairingDevice));
		});

		socket.on('get_setting', (data, callback) => {
			this.logger.verbose(
				'Driver:pair->get_setting(data, callback)+this.pairingDevice', data, callback, this.pairingDevice
			);
			if (!this.pairingDevice) {
				return callback(new Error('433_generator.error.no_device'));
			}
			return callback(null, this.getSettings(this.pairingDevice)[data]);
		});

		socket.on('emulate_frame', (data, callback) => {
			this.logger.verbose(
				'Driver:pair->emulate_frame(data, callback)+this.pairingDevice', data, callback, this.pairingDevice
			);
			if (!this.pairingDevice) {
				return callback(new Error('433_generator.error.no_device'));
			}
			return callback(
				null,
				this.emit(
					'frame',
					Object.assign({}, this.pairingDevice, this.getLastFrame(this.pairingDevice) || {}, data || {})
				)
			);
		});

		socket.on('assert_device', (data, callback) => {
			this.logger.verbose(
				'Driver:pair->assert_device(data, callback)+this.pairingDevice', data, callback, this.pairingDevice
			);
			this.assertDevice(this.pairingDevice, callback);
		});

		const exports = this.getExports() || {};
		socket.on('toggle', (data, callback) => {
			this.logger.verbose(
				'Driver:pair->toggle(data, callback)+this.pairingDevice', data, callback, this.pairingDevice
			);
			if (!this.pairingDevice) {
				return callback(new Error('433_generator.error.no_device'));
			}
			if (exports.capabilities) {
				Object.keys(exports.capabilities).forEach(capability => {
					if (exports.capabilities[capability].get && exports.capabilities[capability].set) {
						exports.capabilities[capability].get(this.pairingDevice.data, (err, result) => {
							if (typeof result === 'boolean') {
								exports.capabilities[capability].set(this.pairingDevice.data, !result, callback);
							}
						});
					}
				});
			} else {
				callback(new Error('Device does not have boolean capability'));
			}
			callback(null, true);
		});

		Object.keys(exports.capabilities || {}).forEach(capability => {
			socket.on(capability, (data, callback) => {
				exports.capabilities[capability].set(this.pairingDevice.data, data, callback);
			});
		});

		const highlightListener = data => {
			this.logger.verbose('emitting highlight to pairing wizard', data);
			socket.emit('highlight', data);
		};
		this.on('highlight', highlightListener);

		socket.on('disconnect', (data, callback) => {
			this.logger.verbose('Driver:pair->toggle(data, callback)+this.pairingDevice', data, callback, this.pairingDevice);
			this.isPairing = false;
			this.removeListener('frame', receivedListener);
			this.removeListener('highlight', highlightListener);
			this.pairingDevice = null;
			this.state.delete('_pairingDevice');
			this.lastFrame.delete('_pairingDevice');
			this.unregisterSignal();
			this.logger.info('pair wizard closed');
			callback();
		});
	}
};
