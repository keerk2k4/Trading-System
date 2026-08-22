SELECT
    o.order_id,
    i.ticker_symbol,
    a.account_num,
    o.action,
    o.type,
    o.price,
    o.quantity,
    o.created_at
FROM orders o
JOIN instruments i ON i.instrument_id = o.instrument_id
JOIN accounts a ON a.account_id = o.account_id
WHERE o.instrument_id = 1
ORDER BY o.created_at DESC;
