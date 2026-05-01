const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withADIRegistration(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    
    // Ajoute le meta-data ADI au manifest
    if (!manifest.manifest[0]['meta-data']) {
      manifest.manifest[0]['meta-data'] = [];
    }
    
    manifest.manifest[0]['meta-data'].push({
      $: {
        'android:name': 'com.google.android.gms.ads.REGISTRATION_TOKEN',
        'android:value': 'CXGEUMV2VDBDKAAAAAAAAAAAAA'
      }
    });
    
    return config;
  });
};
