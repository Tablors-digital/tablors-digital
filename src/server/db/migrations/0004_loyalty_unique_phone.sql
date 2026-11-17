-- Run this check first. It must return 0 rows, otherwise merge duplicates before creating the index:
-- SELECT restaurant_id, right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) AS p, count(*)
-- FROM loyalty_customers GROUP BY 1, 2 HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_customers_restaurant_phone_uidx
  ON loyalty_customers (restaurant_id, phone);