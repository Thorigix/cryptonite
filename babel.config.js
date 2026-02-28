module.exports = function (api) {
	api.cache(true);
	return {
		presets: [
			['babel-preset-expo', { unstable_transformImportMeta: true }]
		],
		plugins: [
			[
				'module-resolver',
				{
					alias: {
						crypto: 'react-native-crypto',
						stream: 'stream-browserify',
						events: 'events',
					},
				},
			],
		],
	};
};
