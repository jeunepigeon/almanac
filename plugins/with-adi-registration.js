const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withADIRegistration(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest['meta-data']) {
      manifest['meta-data'] = [];
    }

    const exists = manifest['meta-data'].find(
      (item) => item.$['android:name'] === 'com.google.android.play.developerverfication.REGISTRATION_TOKEN'
    );

    if (!exists) {
      manifest['meta-data'].push({
        $: {
          'android:name': 'com.google.android.play.developerverfication.REGISTRATION_TOKEN',
          'android:value': 'CXGEUMV2VDBDKAAAAAAAAAAAAA',
        },
      });
    }

    return config;
  });
};
