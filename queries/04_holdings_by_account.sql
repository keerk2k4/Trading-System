SELECT
    a.account_num,
    i.ticker_symbol,
    i.name,
    h.total_quantity,
    h.total_price,
    h.average_price,
    h.as_of_date
FROM holdings h
JOIN accounts a ON a.account_id = h.account_id
JOIN instruments i ON i.instrument_id = h.instrument_id
WHERE h.account_id = 1
ORDER BY h.total_price DESC;
