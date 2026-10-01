// Development settings, used by `ng serve` and `ng test`. A production build
// swaps this file for environment.prod.ts (see fileReplacements in
// angular.json). Only public base URLs belong here: never API keys, signing
// secrets or market-data service addresses, since everything in this file
// ships to the browser.
export const environment = {
  production: false,
  AUTH_API_BASE_URL: 'http://localhost:3000',
  TRADE_API_BASE_URL: 'http://localhost:8080'
};
