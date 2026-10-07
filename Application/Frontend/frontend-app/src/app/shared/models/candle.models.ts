/** One daily OHLC bar, as returned by the market-data candles API. */
export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  /** True for bars the provider filled in rather than observed. */
  synthetic: boolean;
}

/** Response body of GET /v1/candles/{symbol}. */
export interface CandlesResponse {
  data: {
    symbol: string;
    interval: string;
    currency: string;
    candles: Candle[];
  };
}
