SELECT
    a.account_number,
    i.symbol,
    h.quantity,
    (h.quantity * h.average_price) AS total_value,
    RANK() OVER (
        PARTITION BY h.demat_account_id
        ORDER BY (h.quantity * h.average_price) DESC
    ) AS holding_rank
FROM holdings h
JOIN trading_accounts a ON a.trading_account_id = h.demat_account_id
JOIN instruments i ON i.instrument_id = h.instrument_id
ORDER BY a.account_number, holding_rank;
