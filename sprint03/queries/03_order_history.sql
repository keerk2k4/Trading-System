SELECT
    oh.order_id,
    oh.status,
    oh.timestamp
FROM order_history oh
WHERE oh.order_id = 1
ORDER BY oh.timestamp;
