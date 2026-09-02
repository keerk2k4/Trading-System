# Normalisation Notes

### 1NF (First Normal Form)
- All tables have a primary key 
- Each column contains atomic values. For example, the `watchlist_inst` table splits the multi-valued relationship of watchlists holding multiple instruments into separate tables.

### 2NF (Second Normal Form)
- The schema satisfies 2NF because it is in 1NF and there are no partial dependencies. 
- In junction tables like `watchlist_inst`, the only attributes are the composite keys themselves, so they are already in 2NF. 

### 3NF (Third Normal Form)
- Transitive dependencies have been removed. 
- Instead of storing user details in the `trading_accounts` or `orders` tables, they are kept in `users`, linked via a foreign key `user_id`. 
- `holdings` and `positions` reference `instrument_id` rather than storing the stock's `symbol`, `exchange`, and `company_name` directly in the table. 
