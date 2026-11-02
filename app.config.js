// Étend app.json : le build "development" (eas.json, APP_VARIANT=development) devient une appli à
// part, "Pimp It Dev", avec son propre identifiant iOS — pour l'installer à côté de la Pimp It de
// l'App Store sans la remplacer. Les builds preview/production gardent la config d'app.json telle
// quelle.
const estDev = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => {
  if (!estDev) return config;
  return {
    ...config,
    name: 'Pimp It Dev',
    scheme: 'pimpitapp-dev',
    ios: { ...config.ios, bundleIdentifier: 'com.pimpitstore.app.dev' },
  };
};
