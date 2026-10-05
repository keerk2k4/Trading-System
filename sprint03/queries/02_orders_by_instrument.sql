SELECT

    o.order_id,

    i.symbol,

    ta.account_number,

    o.side,

    o.order_type,

    o.limit_price,

    o.stop_price,

    o.quantity,

    o.status,

    o.created_at

FROM orders o

JOIN instruments i
    ON i.instrument_id = o.instrument_id

JOIN trading_accounts ta
    ON ta.trading_account_id = o.trading_account_id

WHERE o.instrument_id = 1

ORDER BY o.created_at DESC;