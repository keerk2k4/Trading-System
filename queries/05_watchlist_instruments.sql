SELECT
    w.watchlist_name,
    i.ticker_symbol,
    i.name,
    i.price,
    i.availability
FROM watchlist w
JOIN watchlist_inst wi ON wi.wlist_id = w.watchlist_id
JOIN instruments i ON i.instrument_id = wi.inst_id
WHERE w.user_id = 1
ORDER BY w.watchlist_name, i.ticker_symbol;
