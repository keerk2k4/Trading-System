SELECT
    o.order_id,
    a.account_number,
    i.symbol,
    o.side,
    o.order_type,
    o.limit_price,
    o.quantity,
    o.created_at
FROM orders o
JOIN trading_accounts a ON a.trading_account_id = o.trading_account_id
JOIN instruments i ON i.instrument_id = o.instrument_id
WHERE o.trading_account_id = 1
ORDER BY o.created_at DESC;
