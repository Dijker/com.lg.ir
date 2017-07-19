'use strict';

const EventEmitter = require('events').EventEmitter;
const Debouncer = require('./Debouncer');

const signals = new Map();
const registerLock = new Map();
const registerPromises = new Map();
const unRegisterPromises = new Map();

module.exports = class BaseSignal extends EventEmitter {
	constructor(SignalManager, signalKey, parser, options, logger) {
		super();
		this.logger = logger || {
				log: (() => null),
				silly: (() => null),
				debug: (() => null),
				verbose: (() => null),
				info: (() => null),
				warn: (() => null),
				error: (() => null),
			};
		this.logger.silly(
			'Signal:constructor(signalKey, parser, options, logger)',
			signalKey, parser, options, logger
		);
		options = typeof options === 'object' ? options : { debounceTime: options };
		this.SignalManager = SignalManager;
		this.payloadParser = parser || (payload => ({ payload: SignalManager.bitArrayToString(payload) }));
		this.debounceTimeout = Number(options.debounceTime) || 500;
		this.minTxInterval = options.minTxInterval;
		this.signalDefinition = options.signalDefinition;
		this.signalKey = signalKey;
		this.lastTx = 0;

		setInterval(() => {
			for (const entry in this.debounceBuffer) {
				const debouncer = entry[1];
				if (debouncer && debouncer.state === Debouncer.FINISHED) {
					console.log('cleaning debouncer', entry);
					this.debounceBuffer.delete(entry[0]);
				}
			}
		}, 60000);

		if (!signals.has(signalKey)) {
			const signal = new SignalManager(signalKey);

			signal.setMaxListeners(100);

			signal.debouncers = new Map();

			signals.set(signalKey, signal);
			registerLock.set(signalKey, new Set());
		}
		this.signal = signals.get(signalKey);

		// Add debounce event for timeout if there is none
		if (!this.signal.debouncers.has(this.debounceTimeout)) {
			this.signal.debouncers.set(this.debounceTimeout, new Map());
			this.debounceBuffer = this.signal.debouncers.get(this.debounceTimeout);
			this.signal.on('payload', payload => {
				const payloadStr = payload.join('');
				this.logger.debug(`[Signal ${signalKey} ~${this.debounceTimeout}] raw payload:`, payloadStr);
				const debouncer = this.debounce(payload);
				if (debouncer) {
					debouncer.pause();
					this.logger.info(`[Signal ${signalKey} ~${this.debounceTimeout}] payload:`, payloadStr);
					this.signal.emit(`debounce_payload_${this.debounceTimeout}`, payload);
					debouncer.reset();
				}
			});
			this.signal.on('cmd', cmd => {
				this.logger.debug(`[Signal ${signalKey} ~${this.debounceTimeout}] raw command:`, cmd);
				const debouncer = this.debounce(cmd);
				if (debouncer) {
					debouncer.pause();
					this.logger.info(`[Signal ${signalKey} ~${this.debounceTimeout}] command:`, cmd);
					if (!this.manualDebounceFlag && !this.signal.manualDebounceFlag) {
						this.emit('cmd', cmd);
					} else {
						this.logger.verbose(`[Signal ${this.signalKey}] Manually debounced command:`, cmd);
					}
					debouncer.reset();
				}
			});
		} else {
			this.debounceBuffer = this.signal.debouncers.get(this.debounceTimeout);
		}

		this.signal.on(`debounce_payload_${this.debounceTimeout}`, payloadData => { // Start listening to payload event
			if (!this.manualDebounceFlag && !this.signal.manualDebounceFlag) {
				if (true || registerLock.get(this.signalKey).has(this)) {
					// Copy array to prevent mutability issues with multiple drivers
					const payload = Array.from(payloadData).map(Number);
					this.emit('payload', payload);
					// Only continue if the received data is valid
					const data = this.payloadParser(payload);
					if (!data || data.constructor !== Object || !data.id) return;
					this.emit('data', data);
				}
			} else {
				this.logger.verbose(`[Signal ${this.signalKey}] Manually debounced payload:`, payloadData.join(''));
			}
		});
		this.signal.on('payload_send', this.emit.bind(this, 'payload_send'));
	}

	register(callback, key) {
		this.logger.silly('Signal:register(callback, key)', callback, key);
		callback = typeof callback === 'function' ? callback : (() => null);
		if (registerLock.get(this.signalKey).size === 0) {
			this.logger.info(`[Signal ${this.signalKey}] registered signal`);
			registerLock.get(this.signalKey).add(key || this);

			registerPromises.set(this.signalKey, new Promise((resolve, reject) => {
				(unRegisterPromises.get(this.signalKey) || Promise.resolve()).then(() => {
					this.signal.register(err => { // Register signal
						if (err) {
							this.logger.error(err, { extra: { registerLock, registerPromises } });
							return reject(err);
						}
						resolve();
					});
				});
			}));
		} else {
			registerLock.get(this.signalKey).add(key || this);
		}

		return registerPromises.get(this.signalKey)
			.then(() => callback(null, true))
			.catch(err => {
				registerLock.get(this.signalKey).delete(key || this);
				callback(err);
				return Promise.reject(err);
			});
	}

	unregister(key) {
		this.logger.silly('Signal:unregister()');
		if (registerLock.get(this.signalKey).size > 0) {
			registerLock.get(this.signalKey).delete(key || this);
			if (registerLock.get(this.signalKey).size === 0 && !unRegisterPromises.get(this.signalKey)) {
				this.logger.info(`[Signal ${this.signalKey}] unregistered signal`);

				(registerPromises.get(this.signalKey) || Promise.resolve()).then(() => {
					if (registerLock.get(this.signalKey).size === 0) {
						unRegisterPromises.set(this.signalKey, new Promise(resolve =>
							this.signal.unregister(err => {
								// Log errors but other than that just ignore them
								if (err) this.logger.error(err, { extra: { registerLock, registerPromises } });
								unRegisterPromises.delete(this.signalKey);
								resolve();
							})
						));
					}
				});
			}
		}
	}

	manualDebounce(timeout, allListeners) {
		this.logger.silly('Signal:manualDebounce(timeout, allListeners)', timeout, allListeners);
		if (allListeners) {
			this.signal.manualDebounceFlag = true;
			clearTimeout(this.signal.manualDebounceTimeout);
			this.signal.manualDebounceTimeout = setTimeout(() => this.signal.manualDebounceFlag = false, timeout);
		} else {
			this.manualDebounceFlag = true;
			clearTimeout(this.manualDebounceTimeout);
			this.manualDebounceTimeout = setTimeout(() => this.manualDebounceFlag = false, timeout);
		}
	}

	send(payload) {
		this.logger.silly('Signal:send(payload)', payload);
		let registerLockKey = Math.random();
		while (registerLock.get(this.signalKey).has(registerLockKey)) {
			registerLockKey = Math.random();
		}
		return this.register(null, registerLockKey).then(() => {
			return new Promise((resolve, reject) => {
				const frameBuffer = new Buffer(payload);
				const send = () => this.signal.tx(frameBuffer, (err, result) => { // Send the buffer to device
					if (err) { // Print error if there is one
						this.logger.warn(`[Signal ${this.signalKey}] sending payload failed:`, err);
						reject(err);
					} else {
						this.logger.info(`[Signal ${this.signalKey}] send payload:`, payload.join(''));
						this.signal.emit('payload_send', payload);
						resolve(result);
					}
				});
				if (this.minTxInterval) {
					if ((Date.now() - this.lastTx) < this.minTxInterval) {
						this.lastTx += this.minTxInterval;
						console.log('timeout', this.lastTx, this.lastTx - Date.now());
						setTimeout(send, this.lastTx - Date.now());
					} else {
						this.lastTx = Date.now();
						send();
					}
				} else {
					send();
				}
			});
		}).then(() => this.unregister(registerLockKey))
			.catch(err => {
				this.unregister(registerLockKey);
				this.logger.error(err, { extra: { registerLock, registerPromises } });
				this.emit('error', err);
				throw err;
			});
	}

	sendCmd(cmd) {
		this.logger.verbose('Signal:sendCmd(cmd)', cmd);
		let registerLockKey = Math.random();
		while (registerLock.get(this.signalKey).has(registerLockKey)) {
			registerLockKey = Math.random();
		}
		return this.register(null, registerLockKey).then(() => {
			return new Promise((resolve, reject) => {
				const send = () => this.signal.cmd(cmd, (err, result) => { // Send the cmd to device
					if (err) { // Print error if there is one
						this.logger.warn(`[Signal ${this.signalKey}] sending cmd "${cmd}" failed:`, err);
						reject(err);
					} else {
						this.logger.info(`[Signal ${this.signalKey}] send cmd:`, cmd);
						this.emit('cmd_send', cmd);
						resolve(result);
					}
				});
				if (this.minTxInterval) {
					if ((Date.now() - this.lastTx) < this.minTxInterval) {
						this.lastTx += this.minTxInterval;
						setTimeout(send, this.lastTx - Date.now());
					} else {
						this.lastTx = Date.now();
						send();
					}
				} else {
					send();
				}
			});
		}).then(() => this.unregister(registerLockKey))
			.catch(err => {
				this.unregister(registerLockKey);
				this.logger.error(err, { extra: { registerLock, registerPromises } });
				this.emit('error', err);
				throw err;
			});
	}

	pauseDebouncers() {
		this.logger.silly('Signal:pauseDebouncers()');
		this.signal.debouncers.forEach(debounceBuffer => {
			debounceBuffer.forEach(debouncer => {
				debouncer.pause();
			});
		});
	}

	resumeDebouncers() {
		this.logger.silly('Signal:resumeDebouncers()');
		this.signal.debouncers.forEach(debounceBuffer => {
			debounceBuffer.forEach(debouncer => {
				debouncer.resume();
			});
		});
	}

	tx(payload, callback) {
		this.logger.silly('Signal:tx(payload, callback)', payload, callback);
		callback = callback || (() => null);
		const frameBuffer = new Buffer(payload);
		this.signal.tx(frameBuffer, callback);
	}

	debounce(payload) {
		this.logger.silly('Signal:debounce(payload)', payload);
		if (this.debounceTimeout <= 0) return payload;

		const payloadString = Array.isArray(payload) ? payload.join('') : payload;
		if (!this.debounceBuffer.has(payloadString)) {
			const debouncer = new Debouncer(this.debounceTimeout, () => this.debounceBuffer.delete(payloadString));
			this.debounceBuffer.set(
				payloadString,
				debouncer
			);
			return debouncer;
		}
		const debouncer = this.debounceBuffer.get(payloadString);
		if (debouncer.state === Debouncer.FINISHED) {
			debouncer.reset();
			return debouncer;
		}

		if (debouncer.state !== Debouncer.PAUSED) {
			debouncer.reset();
		}
		return null;
	}

	shouldToggle(){
		this.toggleBool = !this.toggleBool;
		return this.toggleBool;
	}
};