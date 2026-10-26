const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withADIRegistration(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const assetsDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(
        path.join(assetsDir, 'adi-registration.properties'),
        'CXGEUMV2VDBDKAAAAAAAAAAAAA'
      );
      return config;
    },
  ]);
};
