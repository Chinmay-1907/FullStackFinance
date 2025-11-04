/** @type {import('lint-staged').Config} */
module.exports = {
  '**/*.{ts,tsx,js,jsx}': [
    'pnpm eslint --fix',
    'pnpm prettier --write'
  ],
  '**/*.{json,md,yml,yaml,css,scss}': 'pnpm prettier --write'
};
