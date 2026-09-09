SELECT
    a.account_number,
    i.symbol,
    i.display_name,
    h.quantity,
    h.average_price,
    (h.quantity * h.average_price) AS total_value,
    h.created_at_date
FROM holdings h
JOIN trading_accounts a ON a.trading_account_id = h.demat_account_id
JOIN instruments i ON i.instrument_id = h.instrument_id
WHERE h.demat_account_id = 1
ORDER BY total_value DESC;
