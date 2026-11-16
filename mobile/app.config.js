// Build local Windows (APP_VARIANT=local) : appli installée à côté de celle d'EAS, qui a une autre signature.
module.exports = ({ config }) => (process.env.APP_VARIANT === 'local'
  ? {
    ...config,
    name: 'Budgetter (local)',
    scheme: 'budget-local',
    android: { ...config.android, package: 'com.dlrcoding.budget.local' },
  }
  : config);
