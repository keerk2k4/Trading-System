// Production settings, swapped in for environment.ts by
// `ng build --configuration production`. The browser has no access to
// server environment variables, so the APIs are addressed as same-origin
// paths: the web server hosting the UI routes /auth-api/** to the auth
// service and /trade-api/** to the trade API, and the real hosts are set
// there, per deployment. That keeps localhost addresses, hostnames and
// secrets out of the bundle.
export const environment = {
  production: true,
  AUTH_API_BASE_URL: '/auth-api',
  TRADE_API_BASE_URL: '/trade-api'
};
