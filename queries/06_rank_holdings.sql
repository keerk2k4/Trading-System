SELECT
    a.account_num,
    i.ticker_symbol,
    h.total_quantity,
    h.total_price,
    RANK() OVER (
        PARTITION BY h.account_id
        ORDER BY h.total_price DESC
    ) AS holding_rank
FROM holdings h
JOIN accounts a ON a.account_id = h.account_id
JOIN instruments i ON i.instrument_id = h.instrument_id
ORDER BY a.account_num, holding_rank;
