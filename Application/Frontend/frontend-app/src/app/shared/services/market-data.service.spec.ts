import { MarketDataService } from './market-data.service';

describe('MarketDataService', () => {
  let service: MarketDataService;

  beforeEach(() => {
    service = new MarketDataService();
  });

  it('exposes the top 10 selling stocks by default', () => {
    const top = service.topSellers();

    expect(top.length).toBe(10);
    expect(new Set(top.map((s) => s.symbol)).size).toBe(10);
    for (const stock of top) {
      expect(stock.symbol).toBe(stock.symbol.toUpperCase());
      expect(stock.companyName.length).toBeGreaterThan(0);
      expect(stock.price).toBeGreaterThan(0);
    }
  });

  it('caps the default list at the requested limit', () => {
    expect(service.topSellers(3).length).toBe(3);
    expect(service.topSellers(0)).toEqual([]);
  });

  it('resolves a quote case-insensitively', () => {
    expect(service.quote('aapl')?.companyName).toBe('Apple Inc.');
    expect(service.quote(' oversized symbol ')).toBeUndefined();
  });

  it('finds stocks by company name', () => {
    const results = service.search('Apple');

    expect(results.map((s) => s.symbol)).toContain('AAPL');
  });

  it('finds stocks by symbol fragment', () => {
    const results = service.search('ms');

    expect(results.map((s) => s.symbol)).toContain('MSFT');
  });

  it('matches nothing on a blank query', () => {
    expect(service.search('   ')).toEqual([]);
    expect(service.search('')).toEqual([]);
  });
});
