SELECT
    o.order_id,
    a.account_num,
    i.ticker_symbol,
    o.action,
    o.type,
    o.price,
    o.quantity,
    o.created_at
FROM orders o
JOIN accounts a ON a.account_id = o.account_id
JOIN instruments i ON i.instrument_id = o.instrument_id
WHERE o.account_id = 1
ORDER BY o.created_at DESC;
