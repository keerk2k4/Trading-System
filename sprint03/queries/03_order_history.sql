SELECT

    oh.history_id,

    oh.event_type,

    oh.old_status,

    oh.new_status,

    oh.event_data,

    oh.created_at

FROM order_history oh

WHERE oh.order_id = 1

ORDER BY oh.created_at;