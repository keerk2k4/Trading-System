SELECT

    da.account_number,

    i.symbol,

    i.company_name,

    h.quantity,

    h.average_price,

    (h.quantity * h.average_price) AS total_value,

    h.created_at,

    h.updated_at

FROM holdings h

JOIN demat_accounts da
    ON da.demat_account_id = h.demat_account_id

JOIN instruments i
    ON i.instrument_id = h.instrument_id

WHERE h.demat_account_id = 1

ORDER BY total_value DESC;