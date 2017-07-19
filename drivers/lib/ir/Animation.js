'use strict';

const Animation = Homey.manager('ledring').Animation;

const disableLedringAnimation = new Animation({
	options: {
		fps: 1,
		tfps: 1,
		rpm: 0,
	},
	frames: [new Array(24).fill(({ r: 0, g: 0, b: 0 }))],
	priority: 'CRITICAL',
});
disableLedringAnimation.register(() => null);
module.exports.getAnimation = (type) => {
	if(type === 'disableLedring'){

	}
};
