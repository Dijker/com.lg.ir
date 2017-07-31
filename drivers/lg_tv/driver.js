'use strict';
/* eslint-disable */
const config = {
	signal: 'lg',
	actions: [{
		id: 'lg_tv:send_cmd',
		title: 'ir_generator.flow.send_cmd',
		args: [{
			name: 'cmd',
			type: 'autocomplete'
		}, {
			name: 'device',
			type: 'device',
			filter: 'driver_id=lg_tv'
		}]
	}, {
		id: 'lg_tv:send_cmd_number',
		title: 'ir_generator.flow.send_cmd_number',
		args: [{
			name: 'number',
			type: 'number',
			min: '0',
			max: '9999'
		}, {
			name: 'device',
			type: 'device',
			filter: 'driver_id=lg_tv'
		}]
	}],
	pair: {
		viewOrder: ['generic_check_device', 'generic_done'],
		views: [{
			template: '../lib/pair/check_device.html',
			options: {
				title: 'views.generic_done.title',
				device_exists_message: 'views.generic_check_device.device_exists_message',
				prepend: '',
				append: ''
			},
			prepend: [],
			append: [],
			id: 'generic_check_device'
		}, {
			template: '../lib/pair/done.html',
			options: {
				title: 'views.generic_done.title',
				prepend: '',
				append: ''
			},
			prepend: [],
			append: [],
			id: 'generic_done'
		}]
	},
	images: {
		small: '../../ir_generator/assets/images/small.jpg',
		large: '../../ir_generator/assets/images/large.jpg'
	},
	id: 'lg_tv',
	name: 'lg_tv',
	class: 'tv',
	icon: '../../ir_generator/assets/remote.svg',
	cmdType: 'tv',
	capabilities: ['onoff',
		'volume_mute',
		'volume_up',
		'volume_down',
		'channel_up',
		'channel_down'
	],
	capabilityToCommandMap: {
		onoff: ['POWER_ON', 'POWER_OFF', 'POWER_TOGGLE'],
		volume_mute: 'MUTE_TOGGLE',
		volume_up: 'VOLUME_UP',
		volume_down: 'VOLUME_DOWN',
		channel_up: 'CHANNEL_UP',
		channel_down: 'CHANNEL_DOWN'
	},
	driver: '../lib/ir/driver',
	signalDefinition: {
		id: 'lg',
		type: 'prontohex',
		repetitions: 1,
		options: {
			cmdNumberPrefix: 'DIGIT_',
			minTxInterval: 250
		},
		cmds: ['tv$~POWER_TOGGLE',
			'tv$~POWER_ON',
			'tv$~POWER_OFF',
			'tv$~VOLUME_UP',
			'tv$~VOLUME_DOWN',
			'tv$~MUTE_TOGGLE',
			'tv$~CHANNEL_UP',
			'tv$~CHANNEL_DOWN',
			'tv$~DIGIT_0',
			'tv$~DIGIT_1',
			'tv$~DIGIT_2',
			'tv$~DIGIT_3',
			'tv$~DIGIT_4',
			'tv$~DIGIT_5',
			'tv$~DIGIT_6',
			'tv$~DIGIT_7',
			'tv$~DIGIT_8',
			'tv$~DIGIT_9',
			'tv$~PREVIOUS_CHANNEL',
			'tv$~CHANNEL_SEARCH',
			'tv$~GUIDE',
			'tv$~TV_GUIDE',
			'tv$~TELETEXT',
			'tv$~CURSOR_UP',
			'tv$~CURSOR_LEFT',
			'tv$~CURSOR_RIGHT',
			'tv$~CURSOR_DOWN',
			'tv$~CURSOR_ENTER',
			'tv$~BACK',
			'tv$~ENTER',
			'tv$~EXIT',
			'tv$~PLAY',
			'tv$~PAUSE',
			'tv$~FORWARD',
			'tv$~REVERSE',
			'tv$~STOP',
			'tv$~RECORD',
			'tv$~RECORD_LIST',
			'tv$~MY_APPS',
			'tv$~FUNCTION_RED',
			'tv$~FUNCTION_GREEN',
			'tv$~FUNCTION_YELLOW',
			'tv$~FUNCTION_BLUE',
			'tv$~CC',
			'tv$~MENU_HOME',
			'tv$~MENU_LIVE',
			'tv$~MENU_MAIN',
			'tv$~MENU_PREMIUM',
			'tv$~MENU_QUICK',
			'tv$~MENU_SMART_HOME',
			'tv$~MENU_USB',
			'tv$~INFO',
			'tv$~BRIGHTNESS_DOWN',
			'tv$~BRIGHTNESS_UP',
			'tv$~INPUT_TV',
			'tv$~INPUT_HDMI_1',
			'tv$~INPUT_HDMI_2',
			'tv$~INPUT_HDMI_3',
			'tv$~INPUT_HDMI_4',
			'tv$~INPUT_ANTENNA',
			'tv$~INPUT_PC',
			'tv$~INPUT_DVI',
			'tv$~INPUT_DVI_PC_OR_HDMI_1',
			'tv$~INPUT_COMPONENT_1',
			'tv$~INPUT_COMPONENT_2',
			'tv$~INPUT_COMPONENT_3',
			'tv$~INPUT_VIDEO_1',
			'tv$~INPUT_VIDEO_2',
			'tv$~INPUT_VIDEO_3',
			'tv$~INPUT_VIDEO_4',
			'tv$~INPUT_VIDEO_5',
			'tv$~INPUT_USB',
			'tv$~INPUT_USB_PHOTO',
			'tv$~INPUT_USB_PHOTO_AND_MUSIC',
			'tv$~INPUT_RGB',
			'tv$~INPUT_RGB_1',
			'tv$~INPUT_RGB_2',
			'tv$~INPUT_RGB_DTV',
			'tv$~INPUT_RGB_PC',
			'tv$~INPUT_S_VIDEO',
			'tv$~INPUT_S_VIDEO_1',
			'tv$~INPUT_S_VIDEO_2',
			'tv$~INPUT_SCROLL',
			'tv$~INPUT_1394',
			'tv$~3D',
			'tv$~3D_ALTERNATE',
			'tv$~POWER_ON_AND_INPUT_VIDEO',
			'tv$~POWER_ON_AND_INPUT_VIDEO_1_OR_AV1',
			'tv$~POWER_ON_AND_INPUT_VIDEO_2_OR_AV2',
			'tv$~POWER_ON_AND_INPUT_VIDEO_3_OR_FRONT',
			'tv$~POWER_ON_AND_INPUT_VIDEO_4_OR_FRONT',
			'tv$~POWER_ON_AND_INPUT_VIDEO_5',
			'tv$~POWER_ON_AND_INPUT_PC',
			'tv$~POWER_ON_AND_INPUT_COMPONENT_OR_COMPONENT_1',
			'tv$~POWER_ON_AND_INPUT_RGB',
			'tv$~POWER_ON_AND_INPUT_S_VIDEO',
			'tv$~POWER_ON_AND_INPUT_S_VIDEO_1',
			'tv$~POWER_ON_AND_INPUT_S_VIDEO_2',
			'tv$~ADJUST',
			'tv$~APM',
			'tv$~AUTO_CONFIGURE',
			'tv$~AV_MODE',
			'tv$~CLEAR',
			'tv$~DASP',
			'tv$~DIGIT_SEPARATOR',
			'tv$~ENERGY_SAVING',
			'tv$~EZ_PICTURE',
			'tv$~EZ_SOUND',
			'tv$~FAVORITE',
			'tv$~FORMAT_169',
			'tv$~FORMAT_43',
			'tv$~FORMAT_AUTO',
			'tv$~FORMAT_SCROLL',
			'tv$~FORMAT_ZOOM',
			'tv$~FREEZE',
			'tv$~GO_TO_NEXT',
			'tv$~GO_TO_PREVIOUS',
			'tv$~LIST',
			'tv$~MC_EJECT',
			'tv$~NETCAST',
			'tv$~OPEN/CLOSE',
			'tv$~PICTURE',
			'tv$~PIP',
			'tv$~PIP_ARC',
			'tv$~PIP_CHANNEL_DOWN',
			'tv$~PIP_CHANNEL_UP',
			'tv$~PIP_FREEZE',
			'tv$~PIP_INPUT',
			'tv$~PIP_SWAP',
			'tv$~PORTAL',
			'tv$~PREMIUM',
			'tv$~RECENT',
			'tv$~SAP',
			'tv$~SIMPLINK',
			'tv$~SLEEP',
			'tv$~SOUND',
			'tv$~SPLIT_ZOOM',
			'tv$~SURF',
			'tv$~SYSTEM_OFF',
			'tv$~TEXT_OPTION',
			'tv$~TILE',
			'tv$~TIMER',
			'tv$~TOUCH',
			'tv$~TV/PC',
			'tv$~USB_EJECT',
			'tv$~USER_GUIDE',
			'tv$~VD/*',
			'tv$~WIDGETS',
			'tv$~X_STUDIO',
			'tv$~X_STUDIO_PRO',
			'tv$~ZOOM_IN',
			'tv$~ZOOM_OUT',
			'hometheather$~AUDIO',
			'hometheather$~BACK',
			'hometheather$~CLEAR',
			'hometheather$~CURSOR_DOWN',
			'hometheather$~CURSOR_ENTER',
			'hometheather$~CURSOR_LEFT',
			'hometheather$~CURSOR_RIGHT',
			'hometheather$~CURSOR_UP',
			'hometheather$~DIGIT_0',
			'hometheather$~DIGIT_1',
			'hometheather$~DIGIT_2',
			'hometheather$~DIGIT_3',
			'hometheather$~DIGIT_4',
			'hometheather$~DIGIT_5',
			'hometheather$~DIGIT_6',
			'hometheather$~DIGIT_7',
			'hometheather$~DIGIT_8',
			'hometheather$~DIGIT_9',
			'hometheather$~FORWARD/NEXT',
			'hometheather$~FUNCTION_BLUE',
			'hometheather$~FUNCTION_GREEN',
			'hometheather$~FUNCTION_RED',
			'hometheather$~FUNCTION_YELLOW',
			'hometheather$~INPUT_OPTICAL/TV_SOUND',
			'hometheather$~INPUT_SCROLL',
			'hometheather$~MENU_DISC',
			'hometheather$~MENU_HOME',
			'hometheather$~MENU_MAIN',
			'hometheather$~MENU_POP_UP',
			'hometheather$~MODE_3D_SOUND',
			'hometheather$~MODE_SCROLL',
			'hometheather$~MUSIC_ID',
			'hometheather$~MUTE_TOGGLE',
			'hometheather$~OPEN/CLOSE',
			'hometheather$~PAUSE',
			'hometheather$~PLAY',
			'hometheather$~POWER_TOGGLE',
			'hometheather$~RECORD',
			'hometheather$~REPEAT',
			'hometheather$~REVERSE/PREVIOUS',
			'hometheather$~SPEAKER_LEVEL',
			'hometheather$~STOP',
			'hometheather$~SUBTITLE',
			'hometheather$~TUNER_PRESET_DOWN',
			'hometheather$~TUNER_PRESET_UP',
			'hometheather$~TUNER_TUNE_DOWN',
			'hometheather$~TUNER_TUNE_UP',
			'hometheather$~VOLUME_DOWN',
			'hometheather$~VOLUME_UP'
		]
	}
};
const Driver = require(config.driver);
const driver = new Driver(config);
module.exports = Object.assign(
  {},
	driver.getExports(), 
	{ init: (devices, callback) => driver.init(module.exports, devices, callback) }
);
