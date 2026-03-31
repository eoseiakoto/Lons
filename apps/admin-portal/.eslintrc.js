module.exports = {
  extends: ['@lons/eslint-config'],
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  overrides: [
    {
      files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'e2e/**/*.ts'],
      parserOptions: {
        project: null,
      },
    },
  ],
};
