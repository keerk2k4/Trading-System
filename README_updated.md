# Entity Relationship Diagram (ERD) -- Trading System

## 1. Overview

This README documents the complete database design for the trading
system, including:

-   All entities/tables
-   All attributes/columns
-   Data types
-   Primary keys
-   Foreign keys
-   `NOT NULL` constraints
-   `UNIQUE` constraints
-   `CHECK` constraints
-   Default values where appropriate
-   Relationships and cardinalities
-   Composite keys
-   The `WATCHLIST_INST` junction table
-   The required **USERS → ACCOUNTS 1:1 relationship**

The database contains **9 tables**:

1.  `USERS`
2.  `ACCOUNTS`
3.  `INSTRUMENTS`
4.  `ORDERS`
5.  `ORDER_HISTORY`
6.  `POSITIONS`
7.  `HOLDINGS`
8.  `WATCHLIST`
9.  `WATCHLIST_INST`

------------------------------------------------------------------------

# 2. Entity and Attribute Definitions

## 2.1 USERS

Stores user account/profile information.

  Attribute       Data Type      Constraints            Description
  --------------- -------------- ---------------------- ------------------------
  `user_id`       INT            **PK, NOT NULL**       Unique user identifier
  `user_name`     VARCHAR(100)   **NOT NULL**           User's name/username
  `password`      VARCHAR(255)   **NOT NULL**           Hashed user password
  `email`         VARCHAR(255)   **NOT NULL, UNIQUE**   User email address
  `phonenumber`   VARCHAR(30)    UNIQUE                 User phone number

### Constraints

``` sql
PRIMARY KEY (user_id)
UNIQUE (email)
UNIQUE (phonenumber)
```

> `password` should store a password hash rather than a plain-text
> password.

------------------------------------------------------------------------

# 2.2 ACCOUNTS

Stores the trading account belonging to a user.

  ----------------------------------------------------------------------------
  Attribute         Data Type         Constraints           Description
  ----------------- ----------------- --------------------- ------------------
  `account_id`      INT               **PK, NOT NULL**      Unique account
                                                            identifier

  `account_num`     VARCHAR(50)       **NOT NULL, UNIQUE**  Account number

  `user_id`         INT               **FK, NOT NULL,       References
                                      UNIQUE**              `USERS.user_id`;
                                                            UNIQUE enforces
                                                            1:1

  `balance`         DECIMAL(18,2)     **NOT NULL, DEFAULT   Account balance
                                      0, CHECK \>= 0**      

  `status`          VARCHAR(30)       **NOT NULL**          Account status

  `created_at`      TIMESTAMP         **NOT NULL, DEFAULT   Account creation
                                      CURRENT_TIMESTAMP**   time
  ----------------------------------------------------------------------------

### Constraints

``` sql
PRIMARY KEY (account_id)

FOREIGN KEY (user_id)
    REFERENCES USERS(user_id)

UNIQUE (account_num)

UNIQUE (user_id)

CHECK (balance >= 0)
```

### Important 1:1 Constraint

The relationship between `USERS` and `ACCOUNTS` is **strictly 1:1**.

``` text
USERS 1 ───────── 1 ACCOUNTS
```

The `UNIQUE` constraint on `ACCOUNTS.user_id` prevents a user from
having more than one account.

------------------------------------------------------------------------

# 2.3 INSTRUMENTS

Stores financial instruments that can be traded.

  -----------------------------------------------------------------------
  Attribute         Data Type         Constraints       Description
  ----------------- ----------------- ----------------- -----------------
  `instrument_id`   INT               **PK, NOT NULL**  Unique instrument
                                                        identifier

  `ticker_symbol`   VARCHAR(20)       **NOT NULL,       Instrument ticker
                                      UNIQUE**          symbol

  `name`            VARCHAR(150)      **NOT NULL**      Instrument name

  `description`     TEXT              NULL              Instrument
                                                        description

  `status`          VARCHAR(30)       **NOT NULL**      Instrument status

  `availability`    BOOLEAN           **NOT NULL,       Whether
                                      DEFAULT TRUE**    instrument is
                                                        available for
                                                        trading

  `price`           DECIMAL(18,4)     **NOT NULL, CHECK Current/latest
                                      \>= 0**           instrument price
  -----------------------------------------------------------------------

### Constraints

``` sql
PRIMARY KEY (instrument_id)

UNIQUE (ticker_symbol)

CHECK (price >= 0)
```

------------------------------------------------------------------------

# 2.4 ORDERS

Stores orders submitted by trading accounts.

  ---------------------------------------------------------------------------------------
  Attribute         Data Type         Constraints           Description
  ----------------- ----------------- --------------------- -----------------------------
  `order_id`        INT               **PK, NOT NULL**      Unique order identifier

  `account_id`      INT               **FK, NOT NULL**      References
                                                            `ACCOUNTS.account_id`

  `instrument_id`   INT               **FK, NOT NULL**      References
                                                            `INSTRUMENTS.instrument_id`

  `action`          VARCHAR(10)       **NOT NULL, CHECK**   Buy or sell

  `type`            VARCHAR(20)       **NOT NULL, CHECK**   Order type

  `price`           DECIMAL(18,4)     **NOT NULL, CHECK \>  Order price
                                      0**                   

  `quantity`        DECIMAL(18,4)     **NOT NULL, CHECK \>  Quantity ordered
                                      0**                   

  `timestamp`       TIMESTAMP         **NOT NULL, DEFAULT   Order creation time
                                      CURRENT_TIMESTAMP**   
  ---------------------------------------------------------------------------------------

### Constraints

``` sql
PRIMARY KEY (order_id)

FOREIGN KEY (account_id)
    REFERENCES ACCOUNTS(account_id)

FOREIGN KEY (instrument_id)
    REFERENCES INSTRUMENTS(instrument_id)

CHECK (action IN ('BUY', 'SELL'))

CHECK (type IN ('MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'))

CHECK (price > 0)

CHECK (quantity > 0)
```

> If the application supports additional order types, the `type` CHECK
> constraint should be extended accordingly.

------------------------------------------------------------------------

# 2.5 ORDER_HISTORY

Stores every status change associated with an order.

  -------------------------------------------------------------------------
  Attribute         Data Type         Constraints       Description
  ----------------- ----------------- ----------------- -------------------
  `order_id`        INT               **PK, FK, NOT     References
                                      NULL**            `ORDERS.order_id`

  `status`          VARCHAR(30)       **PK, NOT NULL,   Order status
                                      CHECK**           

  `timestamp`       TIMESTAMP         **PK, NOT NULL**  Time of status
                                                        change
  -------------------------------------------------------------------------

### Composite Primary Key

``` sql
PRIMARY KEY (
    order_id,
    status,
    timestamp
)
```

### Foreign Key

``` sql
FOREIGN KEY (order_id)
    REFERENCES ORDERS(order_id)
```

### Suggested Status Constraint

``` sql
CHECK (
    status IN (
        'PENDING',
        'PARTIALLY_FILLED',
        'FILLED',
        'CANCELLED',
        'REJECTED',
        'EXPIRED'
    )
)
```

### Relationship

``` text
ORDERS 1 ───────── N ORDER_HISTORY
```

One order can have multiple status-history records.

------------------------------------------------------------------------

# 2.6 POSITIONS

Stores positions associated with accounts and instruments.

  ------------------------------------------------------------------------------------
  Attribute          Data Type         Constraints       Description
  ------------------ ----------------- ----------------- -----------------------------
  `position_id`      INT               **PK, NOT NULL**  Unique position identifier

  `account_id`       INT               **FK, NOT NULL**  References
                                                         `ACCOUNTS.account_id`

  `instrument_id`    INT               **FK, NOT NULL**  References
                                                         `INSTRUMENTS.instrument_id`

  `status`           VARCHAR(30)       **NOT NULL**      Position status

  `total_quantity`   DECIMAL(18,4)     **NOT NULL, CHECK Total position quantity
                                       \>= 0**           

  `total_price`      DECIMAL(18,4)     **NOT NULL, CHECK Total position value/price
                                       \>= 0**           

  `as_of_date`       DATE              **NOT NULL**      Date the position represents

  `average_price`    DECIMAL(18,4)     **NOT NULL, CHECK Average position price
                                       \>= 0**           

  `trade_type`       VARCHAR(20)       NOT NULL          Trade type
  ------------------------------------------------------------------------------------

### Constraints

``` sql
PRIMARY KEY (position_id)

FOREIGN KEY (account_id)
    REFERENCES ACCOUNTS(account_id)

FOREIGN KEY (instrument_id)
    REFERENCES INSTRUMENTS(instrument_id)

CHECK (total_quantity >= 0)

CHECK (total_price >= 0)

CHECK (average_price >= 0)
```

### Relationships

``` text
ACCOUNTS     1 ───────── N POSITIONS
INSTRUMENTS  1 ───────── N POSITIONS
```

------------------------------------------------------------------------

# 2.7 HOLDINGS

Stores instruments currently held by trading accounts.

  ------------------------------------------------------------------------------------
  Attribute          Data Type         Constraints       Description
  ------------------ ----------------- ----------------- -----------------------------
  `holding_id`       INT               **PK, NOT NULL**  Unique holding identifier

  `account_id`       INT               **FK, NOT NULL**  References
                                                         `ACCOUNTS.account_id`

  `instrument_id`    INT               **FK, NOT NULL**  References
                                                         `INSTRUMENTS.instrument_id`

  `total_quantity`   DECIMAL(18,4)     **NOT NULL, CHECK Total quantity held
                                       \>= 0**           

  `total_price`      DECIMAL(18,4)     **NOT NULL, CHECK Total holding value
                                       \>= 0**           

  `as_of_date`       DATE              **NOT NULL**      Date the holding represents

  `average_price`    DECIMAL(18,4)     **NOT NULL, CHECK Average holding price
                                       \>= 0**           
  ------------------------------------------------------------------------------------

### Constraints

``` sql
PRIMARY KEY (holding_id)

FOREIGN KEY (account_id)
    REFERENCES ACCOUNTS(account_id)

FOREIGN KEY (instrument_id)
    REFERENCES INSTRUMENTS(instrument_id)

CHECK (total_quantity >= 0)

CHECK (total_price >= 0)

CHECK (average_price >= 0)
```

### Relationships

``` text
ACCOUNTS     1 ───────── N HOLDINGS
INSTRUMENTS  1 ───────── N HOLDINGS
```

------------------------------------------------------------------------

# 2.8 WATCHLIST

Stores watchlists created by users.

  ----------------------------------------------------------------------------
  Attribute          Data Type         Constraints           Description
  ------------------ ----------------- --------------------- -----------------
  `watchlist_id`     INT               **PK, NOT NULL**      Unique watchlist
                                                             identifier

  `user_id`          INT               **FK, NOT NULL**      References
                                                             `USERS.user_id`

  `watchlist_name`   VARCHAR(100)      **NOT NULL**          Name of watchlist

  `description`      TEXT              NULL                  Watchlist
                                                             description

  `created_ts`       TIMESTAMP         **NOT NULL, DEFAULT   Creation time
                                       CURRENT_TIMESTAMP**   

  `updated_ts`       TIMESTAMP         **NOT NULL, DEFAULT   Last update time
                                       CURRENT_TIMESTAMP**   
  ----------------------------------------------------------------------------

### Constraints

``` sql
PRIMARY KEY (watchlist_id)

FOREIGN KEY (user_id)
    REFERENCES USERS(user_id)
```

### Relationship

``` text
USERS 1 ───────── N WATCHLIST
```

One user can create multiple watchlists.

------------------------------------------------------------------------

# 2.9 WATCHLIST_INST

Junction/associative table connecting watchlists and instruments.

  -----------------------------------------------------------------------------------
  Attribute         Data Type         Constraints       Description
  ----------------- ----------------- ----------------- -----------------------------
  `wlist_id`        INT               **PK, FK, NOT     References
                                      NULL**            `WATCHLIST.watchlist_id`

  `inst_id`         INT               **PK, FK, NOT     References
                                      NULL**            `INSTRUMENTS.instrument_id`
  -----------------------------------------------------------------------------------

### Composite Primary Key

``` sql
PRIMARY KEY (wlist_id, inst_id)
```

### Foreign Keys

``` sql
FOREIGN KEY (wlist_id)
    REFERENCES WATCHLIST(watchlist_id)

FOREIGN KEY (inst_id)
    REFERENCES INSTRUMENTS(instrument_id)
```

### Relationships

``` text
WATCHLIST    1 ───────── N WATCHLIST_INST

INSTRUMENTS  1 ───────── N WATCHLIST_INST
```

Therefore, the conceptual relationship is:

``` text
WATCHLIST N ───────── M INSTRUMENTS
```

`WATCHLIST_INST` resolves this many-to-many relationship.

------------------------------------------------------------------------

# 3. Complete Relationship and Cardinality List

  --------------------------------------------------------------------------------------------
  \#             Parent Entity   Child Entity       Cardinality    FK
  -------------- --------------- ------------------ -------------- ---------------------------
  1              `USERS`         `ACCOUNTS`         **1:1**        `ACCOUNTS.user_id`

  2              `USERS`         `WATCHLIST`        **1:N**        `WATCHLIST.user_id`

  3              `WATCHLIST`     `WATCHLIST_INST`   **1:N**        `WATCHLIST_INST.wlist_id`

  4              `INSTRUMENTS`   `WATCHLIST_INST`   **1:N**        `WATCHLIST_INST.inst_id`

  5              `ACCOUNTS`      `ORDERS`           **1:N**        `ORDERS.account_id`

  6              `INSTRUMENTS`   `ORDERS`           **1:N**        `ORDERS.instrument_id`

  7              `ORDERS`        `ORDER_HISTORY`    **1:N**        `ORDER_HISTORY.order_id`

  8              `ACCOUNTS`      `POSITIONS`        **1:N**        `POSITIONS.account_id`

  9              `INSTRUMENTS`   `POSITIONS`        **1:N**        `POSITIONS.instrument_id`

  10             `ACCOUNTS`      `HOLDINGS`         **1:N**        `HOLDINGS.account_id`

  11             `INSTRUMENTS`   `HOLDINGS`         **1:N**        `HOLDINGS.instrument_id`
  --------------------------------------------------------------------------------------------

------------------------------------------------------------------------

# 4. Conceptual ER Relationships

``` text
USERS
  │
  │ 1:1
  ▼
ACCOUNTS
  │
  ├────────────── 1:N ──────────────► ORDERS
  │                                    │
  │                                    │ 1:N
  │                                    ▼
  │                              ORDER_HISTORY
  │
  ├────────────── 1:N ──────────────► POSITIONS
  │                                    ▲
  │                                    │ N:1
  │                                    │
  │                              INSTRUMENTS
  │
  └────────────── 1:N ──────────────► HOLDINGS
                                       ▲
                                       │ N:1
                                       │
                                  INSTRUMENTS


USERS
  │
  │ 1:N
  ▼
WATCHLIST
  │
  │ 1:N
  ▼
WATCHLIST_INST
  ▲
  │ N:1
  │
INSTRUMENTS
```

------------------------------------------------------------------------

# 5. Primary Key Summary

  Table              Primary Key
  ------------------ -------------------------------
  `USERS`            `user_id`
  `ACCOUNTS`         `account_id`
  `INSTRUMENTS`      `instrument_id`
  `ORDERS`           `order_id`
  `ORDER_HISTORY`    `order_id, status, timestamp`
  `POSITIONS`        `position_id`
  `HOLDINGS`         `holding_id`
  `WATCHLIST`        `watchlist_id`
  `WATCHLIST_INST`   `wlist_id, inst_id`

------------------------------------------------------------------------

# 6. Foreign Key Summary

  Table              Foreign Key       References
  ------------------ ----------------- -----------------------------
  `ACCOUNTS`         `user_id`         `USERS.user_id`
  `ORDERS`           `account_id`      `ACCOUNTS.account_id`
  `ORDERS`           `instrument_id`   `INSTRUMENTS.instrument_id`
  `ORDER_HISTORY`    `order_id`        `ORDERS.order_id`
  `POSITIONS`        `account_id`      `ACCOUNTS.account_id`
  `POSITIONS`        `instrument_id`   `INSTRUMENTS.instrument_id`
  `HOLDINGS`         `account_id`      `ACCOUNTS.account_id`
  `HOLDINGS`         `instrument_id`   `INSTRUMENTS.instrument_id`
  `WATCHLIST`        `user_id`         `USERS.user_id`
  `WATCHLIST_INST`   `wlist_id`        `WATCHLIST.watchlist_id`
  `WATCHLIST_INST`   `inst_id`         `INSTRUMENTS.instrument_id`

------------------------------------------------------------------------

# 7. Constraint Summary

## Primary Keys

Every entity has a primary key.

``` text
USERS            → user_id
ACCOUNTS         → account_id
INSTRUMENTS      → instrument_id
ORDERS           → order_id
ORDER_HISTORY    → order_id + status + timestamp
POSITIONS        → position_id
HOLDINGS         → holding_id
WATCHLIST        → watchlist_id
WATCHLIST_INST   → wlist_id + inst_id
```

## Foreign Keys

All relationships between entities are enforced using foreign keys.

## Unique Constraints

The following attributes should be unique:

``` text
USERS.email
USERS.phonenumber
ACCOUNTS.account_num
ACCOUNTS.user_id
INSTRUMENTS.ticker_symbol
```

The most important unique constraint is:

``` text
ACCOUNTS.user_id UNIQUE
```

This enforces the required:

``` text
USERS 1 : 1 ACCOUNTS
```

## Check Constraints

Recommended validation rules include:

``` sql
balance >= 0

price >= 0

quantity > 0

total_quantity >= 0

total_price >= 0

average_price >= 0

action IN ('BUY', 'SELL')
```

------------------------------------------------------------------------

# 8. Suggested SQL Constraint Definitions

The following illustrates how the key constraints can be implemented.

``` sql
CREATE TABLE USERS (
    user_id INT PRIMARY KEY,
    user_name VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phonenumber VARCHAR(30) UNIQUE
);
```

``` sql
CREATE TABLE ACCOUNTS (
    account_id INT PRIMARY KEY,
    account_num VARCHAR(50) NOT NULL UNIQUE,
    user_id INT NOT NULL UNIQUE,
    balance DECIMAL(18,2) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_accounts_user
        FOREIGN KEY (user_id)
        REFERENCES USERS(user_id),

    CONSTRAINT chk_account_balance
        CHECK (balance >= 0)
);
```

``` sql
CREATE TABLE INSTRUMENTS (
    instrument_id INT PRIMARY KEY,
    ticker_symbol VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    status VARCHAR(30) NOT NULL,
    availability BOOLEAN NOT NULL DEFAULT TRUE,
    price DECIMAL(18,4) NOT NULL,

    CONSTRAINT chk_instrument_price
        CHECK (price >= 0)
);
```

``` sql
CREATE TABLE ORDERS (
    order_id INT PRIMARY KEY,
    account_id INT NOT NULL,
    instrument_id INT NOT NULL,
    action VARCHAR(10) NOT NULL,
    type VARCHAR(20) NOT NULL,
    price DECIMAL(18,4) NOT NULL,
    quantity DECIMAL(18,4) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_orders_account
        FOREIGN KEY (account_id)
        REFERENCES ACCOUNTS(account_id),

    CONSTRAINT fk_orders_instrument
        FOREIGN KEY (instrument_id)
        REFERENCES INSTRUMENTS(instrument_id),

    CONSTRAINT chk_order_action
        CHECK (action IN ('BUY', 'SELL')),

    CONSTRAINT chk_order_price
        CHECK (price > 0),

    CONSTRAINT chk_order_quantity
        CHECK (quantity > 0)
);
```

``` sql
CREATE TABLE ORDER_HISTORY (
    order_id INT NOT NULL,
    status VARCHAR(30) NOT NULL,
    timestamp TIMESTAMP NOT NULL,

    PRIMARY KEY (order_id, status, timestamp),

    CONSTRAINT fk_history_order
        FOREIGN KEY (order_id)
        REFERENCES ORDERS(order_id),

    CONSTRAINT chk_history_status
        CHECK (
            status IN (
                'PENDING',
                'PARTIALLY_FILLED',
                'FILLED',
                'CANCELLED',
                'REJECTED',
                'EXPIRED'
            )
        )
);
```

``` sql
CREATE TABLE POSITIONS (
    position_id INT PRIMARY KEY,
    account_id INT NOT NULL,
    instrument_id INT NOT NULL,
    status VARCHAR(30) NOT NULL,
    total_quantity DECIMAL(18,4) NOT NULL,
    total_price DECIMAL(18,4) NOT NULL,
    as_of_date DATE NOT NULL,
    average_price DECIMAL(18,4) NOT NULL,
    trade_type VARCHAR(20) NOT NULL,

    CONSTRAINT fk_positions_account
        FOREIGN KEY (account_id)
        REFERENCES ACCOUNTS(account_id),

    CONSTRAINT fk_positions_instrument
        FOREIGN KEY (instrument_id)
        REFERENCES INSTRUMENTS(instrument_id),

    CONSTRAINT chk_position_quantity
        CHECK (total_quantity >= 0),

    CONSTRAINT chk_position_price
        CHECK (total_price >= 0),

    CONSTRAINT chk_position_average_price
        CHECK (average_price >= 0)
);
```

``` sql
CREATE TABLE HOLDINGS (
    holding_id INT PRIMARY KEY,
    account_id INT NOT NULL,
    instrument_id INT NOT NULL,
    total_quantity DECIMAL(18,4) NOT NULL,
    total_price DECIMAL(18,4) NOT NULL,
    as_of_date DATE NOT NULL,
    average_price DECIMAL(18,4) NOT NULL,

    CONSTRAINT fk_holdings_account
        FOREIGN KEY (account_id)
        REFERENCES ACCOUNTS(account_id),

    CONSTRAINT fk_holdings_instrument
        FOREIGN KEY (instrument_id)
        REFERENCES INSTRUMENTS(instrument_id),

    CONSTRAINT chk_holding_quantity
        CHECK (total_quantity >= 0),

    CONSTRAINT chk_holding_price
        CHECK (total_price >= 0),

    CONSTRAINT chk_holding_average_price
        CHECK (average_price >= 0)
);
```

``` sql
CREATE TABLE WATCHLIST (
    watchlist_id INT PRIMARY KEY,
    user_id INT NOT NULL,
    watchlist_name VARCHAR(100) NOT NULL,
    description TEXT,
    created_ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_watchlist_user
        FOREIGN KEY (user_id)
        REFERENCES USERS(user_id)
);
```

``` sql
CREATE TABLE WATCHLIST_INST (
    wlist_id INT NOT NULL,
    inst_id INT NOT NULL,

    PRIMARY KEY (wlist_id, inst_id),

    CONSTRAINT fk_watchlist_inst_watchlist
        FOREIGN KEY (wlist_id)
        REFERENCES WATCHLIST(watchlist_id),

    CONSTRAINT fk_watchlist_inst_instrument
        FOREIGN KEY (inst_id)
        REFERENCES INSTRUMENTS(instrument_id)
);
```

------------------------------------------------------------------------

# 9. Final ERD Cardinalities

``` text
USERS        1 : 1  ACCOUNTS

USERS        1 : N  WATCHLIST

WATCHLIST    1 : N  WATCHLIST_INST

INSTRUMENTS  1 : N  WATCHLIST_INST

WATCHLIST    N : M  INSTRUMENTS
                 ↑
                 │
       implemented through
        WATCHLIST_INST

ACCOUNTS     1 : N  ORDERS

INSTRUMENTS  1 : N  ORDERS

ORDERS       1 : N  ORDER_HISTORY

ACCOUNTS     1 : N  POSITIONS

INSTRUMENTS  1 : N  POSITIONS

ACCOUNTS     1 : N  HOLDINGS

INSTRUMENTS  1 : N  HOLDINGS
```

------------------------------------------------------------------------

# 10. Design Rules

The following rules define the intended database structure:

1.  A user has exactly one account.
2.  An account belongs to exactly one user.
3.  A user can have multiple watchlists.
4.  A watchlist belongs to one user.
5.  A watchlist can contain multiple instruments.
6.  An instrument can appear in multiple watchlists.
7.  `WATCHLIST_INST` implements the WATCHLIST--INSTRUMENT many-to-many
    relationship.
8.  An account can place multiple orders.
9.  Each order belongs to one account.
10. Each order is for one instrument.
11. An instrument can appear in many orders.
12. An order can have multiple history records.
13. An account can have multiple positions.
14. A position belongs to one account and one instrument.
15. An account can have multiple holdings.
16. A holding belongs to one account and one instrument.
17. Primary keys uniquely identify records.
18. Foreign keys maintain referential integrity.
19. `ACCOUNTS.user_id` must be unique to enforce the required 1:1
    relationship.
20. Composite keys are used for `ORDER_HISTORY` and `WATCHLIST_INST` as
    defined above.

------------------------------------------------------------------------

# 11. Entity Count

``` text
Total Tables: 9

1. USERS
2. ACCOUNTS
3. INSTRUMENTS
4. ORDERS
5. ORDER_HISTORY
6. POSITIONS
7. HOLDINGS
8. WATCHLIST
9. WATCHLIST_INST
```

------------------------------------------------------------------------

# 12. Relationship Count

``` text
Total direct relationships: 11

1. USERS → ACCOUNTS             1:1
2. USERS → WATCHLIST             1:N
3. WATCHLIST → WATCHLIST_INST    1:N
4. INSTRUMENTS → WATCHLIST_INST  1:N
5. ACCOUNTS → ORDERS             1:N
6. INSTRUMENTS → ORDERS          1:N
7. ORDERS → ORDER_HISTORY        1:N
8. ACCOUNTS → POSITIONS          1:N
9. INSTRUMENTS → POSITIONS       1:N
10. ACCOUNTS → HOLDINGS          1:N
11. INSTRUMENTS → HOLDINGS       1:N
```

The conceptual `WATCHLIST ↔ INSTRUMENTS` relationship is **N:M**,
implemented by the two 1:N relationships through `WATCHLIST_INST`.
