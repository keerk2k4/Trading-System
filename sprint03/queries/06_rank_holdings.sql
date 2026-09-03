SELECT

    da.account_number,

    i.symbol,

    h.quantity,

    h.average_price,

    (h.quantity * h.average_price) AS holding_value,

    RANK() OVER (

        PARTITION BY h.demat_account_id

        ORDER BY (h.quantity * h.average_price) DESC

    ) AS holding_rank

FROM holdings h

JOIN demat_accounts da

    ON da.demat_account_id = h.demat_account_id

JOIN instruments i

    ON i.instrument_id = h.instrument_id

ORDER BY da.account_number, holding_rank;