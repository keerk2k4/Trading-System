# The two stretch extensions

The catalogue this programme draws from holds six extensions. Four of them are mandatory here
and have a brief each in this folder. The other two are described below.

Neither is available until all four mandatory modules meet the criteria. That is not a rule
about ambition, it is arithmetic: a team that starts a fifth module on Thursday with the
notification chain half-built finishes the week with five things nobody can demonstrate, and
the criteria are all about the four. If you reach Thursday with the chain working end to end,
the review written and the log up to date, tell your instructor, agree a scope, and take one of
these on the same terms as everything else. Both are larger than they look, and both are modules inside the Trade REST API like the four
before them.

## Trade advice and signals

A customer with a blotter and a priced portfolio still has to decide what to do next, and the
platform gives them nothing to decide with. Market data arrives on `market-data` every polling
interval, is used once to price a fill, and is then discarded. This module turns that data into
a stated view on an instrument, a buy, a sell or a hold, with the reason it was generated and
the numbers behind it. It informs a customer who trades; it does not trade. It consumes
`market-data` for anything reacting to now, and Fauxnance `GET /candles/{symbol}` for anything
with a lookback window, and it renders a direction, a strength and a sentence saying what
produced it.

The interesting decisions are about cost and cadence rather than about the indicator.
End-of-day candles do not change during the day, so refetching them per request burns quota for
an answer that cannot have moved: cache them, and be able to say for how long. Recomputing a
signal on every quote is expensive and mostly noise, while recomputing on a fixed interval is
usually enough. The second decision is what a signal is allowed to claim, because a generated
number presented as a recommendation is a product and legal problem before it is an engineering
one. One methodology computed from real candles, explained in the response and rendered in the
UI, is worth more here than three nobody can defend.
Implement the **Automated Strategy Execution** extension in the existing trading platform.

## IMPORTANT — BEFORE MAKING ANY CHANGES

First inspect the entire existing codebase and understand the current architecture.

Specifically inspect:

* Existing services and their responsibilities
* PostgreSQL schema, migrations, tables, relationships, constraints and indexes
* Existing order placement flow
* `POST /api/v1/orders`
* Existing order validation and authorization
* Existing idempotency implementation
* Existing order states and lifecycle
* Existing positions and holdings implementation
* Existing cancellation and update-order implementation
* Existing Kafka topics and producers/consumers
* Existing `market-data` Kafka consumer/producer
* Existing `orders` Kafka topic
* Existing `trade-events` Kafka topic
* Existing authentication/JWT flow
* Existing user/account ownership checks
* Existing Angular order-placement UI if the UI is part of this codebase
* Existing OpenAPI/REST contract

Do NOT immediately modify code.

First understand and document how the existing implementation works and identify the exact files/classes that should be extended.

---

# FEATURE: AUTOMATED STRATEGY EXECUTION

Implement an automated trading strategy feature where a customer can configure a rule that automatically places an order when a market condition is satisfied.

Example:

```text
BUY 50 TCS
when TCS price <= 3500
```

or:

```text
SELL 50 TCS
when TCS price >= 3800
```

The strategy must react to the existing `market-data` Kafka topic.

---

# 1. DO NOT CREATE A NEW MARKET-DATA KAFKA TOPIC

Reuse the existing:

```text
market-data
```

topic.

The strategy engine should consume the existing market data independently using its own consumer group.

For example:

```text
market-data
    |
    +---- watchlist-service consumer
    |
    +---- strategy-service consumer
```

Do NOT change the existing market-data producer unnecessarily.

Do NOT create another topic such as:

```text
strategy-market-data
```

because the existing `market-data` topic already contains the required information.

Use a separate consumer group, for example:

```text
strategy-service
```

so the strategy consumer independently receives market-data events.

---

# 2. STRATEGY DATA MODEL

Inspect the existing database conventions first and then add the minimum required persistent tables/migrations.

A strategy should conceptually contain:

```text
strategy_id
user_id
symbol
side
quantity
trigger_price
max_spend
max_position_size
status
failure_count
created_at
updated_at
```

Possible states:

```text
ACTIVE
DISABLED
TRIGGERED
FAILED
```

Use the project's existing enum/naming/database conventions instead of blindly creating these names if equivalent structures already exist.

Relationships must ensure that a user can only access their own strategies.

Add appropriate:

* Primary keys
* Foreign keys
* Indexes
* Unique constraints where required
* User ownership constraints

Do not duplicate existing user/account/instrument tables.

Reuse existing tables such as:

```text
users
accounts
instruments
orders
positions
holdings
```

where appropriate.

---

# 3. STRATEGY REST API

Inspect the existing REST API conventions and OpenAPI contract.

Add endpoints following the existing versioning and naming conventions.

At minimum, support:

```text
POST   /api/v1/strategies
GET    /api/v1/strategies
GET    /api/v1/strategies/{strategyId}
PATCH  /api/v1/strategies/{strategyId}
DELETE /api/v1/
```
