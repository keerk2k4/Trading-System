# Customer notifications

An order is filled at nine in the morning and the customer finds out at four in the afternoon,
because that is when they next opened the blotter. A rejection is worse: nothing on the
platform tells anyone that the order they placed will never happen. `trade-events` already
carries every outcome that matters. This module is what turns one of those events into a
message a customer actually receives, on the channel they chose.

It is also the delivery path the rest of the platform uses. The alert watchlists raises this
week ends up here, which means its reliability matters to more than its own feature list.

## Where it sits in the order

Second of the four. It has a dependency behind it and a dependant in front of it, which makes
it the module most exposed to somebody else's schedule.

| Direction | Module | What crosses the boundary |
|---|---|---|
| Depends on | Customer preferences | The customer's alert channel, resolved through that module's interface before a message is sent |
| Provides | Watchlists and price alerts | A delivery interface, called when a threshold has been crossed |

Do not start this one before preferences has an interface that answers. Hardcoding a channel to
unblock yourself is the one shortcut this module does not have, because the criterion is that
the message goes out on the channel preferences holds. Agree that interface and what it returns
with the preferences pair, and agree the one watchlists will call on you, before either side
builds against a guess.

## Who uses it

The customer, on whichever channel they configured: email, SMS or a push message. The Angular
application shows the same history as an inbox, so a customer who missed a message can find it.

## What it integrates with

| Surface | How this module uses it |
|---|---|
| `trade-events` | Consume, with a group of its own. `ORDER_FILLED`, `ORDER_REJECTED` and `ORDER_CANCELLED` are all newsworthy |
| Customer preferences | In-process, through the interface that module publishes, to resolve the channel before sending |
| Watchlists and price alerts | Inbound. A triggered alert arrives here for delivery |
| Angular application | Notification history, and marking a message read if you build an inbox |
| An outbound channel | Email, SMS or push. A logging stub is acceptable for a channel you cannot provision, provided the routing decision is real and the resolved channel is recorded |

## The API is yours

There is no contract for this module. Design the API, write it as OpenAPI before you write the
controller, and bring it to your instructor on day one for review. The platform conventions
still bind: the `{errorCode, message}` envelope, the platform error catalogue extended only
where nothing in it fits, and the bearer token the Trade REST API verifies before any of your
routes run. What the verifier cannot decide is whether this caller may reach this resource, so
every route compares the `accountId` claim against the history it is about to return.

One part of this module is not for a customer at all: what watchlists calls to have an alert
delivered. That is a Java interface rather than a route. Publishing it as an HTTP route is how
a customer ends up able to send themselves anything, and it is the finding the review will look
for first.

## What makes it worth building

Consumption and delivery are two different failures, and separating them is the design problem
in this module. The Kafka offset says what has been read. The delivery state says what has
reached a customer. Commit the offset once the notification is durably recorded for delivery,
not once an external provider has confirmed it, because an email provider having a bad
afternoon should not stall a partition and back up every other account on it. Track queued,
sent and failed separately from the offset.

Kafka delivers at least once, so a duplicated event must not produce a duplicated message. The
discipline is the one the Trade Executor already uses: key on `eventId` and make the second
attempt a no-op. Being able to replay an event in front of your instructor and show that
nothing is sent twice is worth building the ledger for.

The last piece is the dependency. A notification cannot be routed without knowing where to
route it, so the channel comes from the preferences module on every send rather than from a
constant here or a copy taken at start-up. What happens when no preference has been stored is a
decision, and both answers are defensible: hold the message, or send on a documented default.
Choosing nothing means the message is lost and nobody finds out.

## Scope for one week

Consumption of the three order outcomes, resolution of the channel through preferences,
delivery on at least one channel, notification history exposed to the customer, an interface
watchlists calls to have an alert delivered, and idempotency proven by replaying an event and
showing that nothing is sent twice.

Out of scope unless the rest is finished: digest batching, retry with backoff that
distinguishes a transient failure from a permanent one, and read receipts.

## What to get right

- **Access control.** Notification history is read by its owning account only, checked against
  the verified token.
- **The channel is resolved, not assumed.** The criterion is delivery through the channel
  preferences holds. Record the resolved channel on the notification, so that the demonstration
  is a record you can show rather than a claim you make.
- **Nothing sensitive in a message.** A payload carrying a credential, a full card number or
  anything `contracts/kafka-topics.md` prohibits from a message is a disclosure that outlives
  the incident. The outbound message is held to the same rule as the event.
- **No caller-supplied destinations.** A webhook target or channel URL that a customer can set,
  and that the platform then fetches or posts to, is a server-side request forgery. Fix the
  destination per channel type or validate it hard.
- **A rejection is news.** A customer who only hears about successes has no idea their order
  failed.



Implement the **Customer Notifications** module in the existing trading platform.

## CRITICAL RULE — INSPECT BEFORE MODIFYING

**DO NOT make any code, database, contract, configuration, Kafka, or Angular changes immediately.**

First go through the existing codebase thoroughly and understand how the current platform works.

The implementation must extend the existing architecture rather than creating parallel or duplicate mechanisms.

### Phase 1 — READ ONLY / CODEBASE ANALYSIS

Before changing anything, inspect:

### Backend

* All existing services
* Existing Spring Boot services
* Existing package/module structure
* Existing controllers
* Existing services
* Existing repositories/mappers
* Existing entities/DTOs
* Existing exception/error handling
* Existing authentication and JWT verification
* Existing account ownership checks
* Existing database schema and migrations
* Existing transaction boundaries
* Existing configuration conventions

### Kafka

Inspect:

* `trade-events`
* Existing Kafka producers
* Existing Kafka consumers
* Consumer groups
* Event envelope structure
* `eventId`
* `eventType`
* `eventTime`
* `source`
* `schemaVersion`
* Existing retry/DLT behavior
* Existing idempotency mechanisms
* Existing Kafka conventions documented in `contracts/kafka-topics.md`

Specifically determine how these events are currently produced:

```text
ORDER_FILLED
ORDER_REJECTED
ORDER_CANCELLED
```

Do not assume their payload structure. Read the actual implementation and contract.

### Customer preferences

Find the existing Customer Preferences module.

Determine:

* Where preferences are stored
* What interface it currently exposes
* How a customer's alert channel is resolved
* Supported channels
* Email/SMS/push representation
* What happens when no preference exists
* Whether there is already an interface that can be reused
* Whether the preferences module is in the same process or a separate service

**Do not hardcode a notification channel.**

If the preferences interface does not exist yet, STOP before implementation and clearly identify the interface that needs to be agreed with the preferences module.

Do not invent an interface without first checking the existing codebase.

### Watchlists / price alerts

Inspect the existing watchlist and price-alert implementation.

Determine:

* How alerts are represented
* How threshold crossings are detected
* Whether an existing service already calls another component for notification
* What interface watchlists currently expects
* Whether that interface exists
* What information an alert contains

The notification module must expose a **Java interface** for internal alert delivery.

Do NOT expose this alert-delivery operation as a customer-facing HTTP endpoint.

### Angular

Inspect:

* Existing Angular architecture
* Services
* Components
* HTTP interceptors
* Authentication handling
* Existing account/user state
* Existing UI patterns
* Existing tables/cards/inbox-like components
* Existing error handling
* Existing API client generation

Determine where notification history should fit naturally into the existing UI.

### API contracts

Inspect:

* Existing OpenAPI contracts
* API versioning
* Error response format
* `{errorCode, message}` convention
* Authentication requirements
* Existing accountId handling

The new notification API must follow these conventions.

---

# PHASE 1 OUTPUT — DO NOT MODIFY CODE YET

After inspecting the codebase, provide a concise implementation proposal containing:

1. Existing notification-related components found
2. Existing Kafka event structure
3. Existing preferences interface
4. Existing watchlist alert interface
5. Existing database structure relevant to notifications
6. Existing authentication/authorization mechanism
7. Proposed notification database tables
8. Proposed REST endpoints
9. Proposed Java alert-delivery interface
10. Proposed Kafka consumer/group
11. Proposed notification lifecycle
12. Proposed Angular changes
13. Files that would need to be created
14. Files that would need to be modified
15. Any architectural conflicts or missing dependencies

**STOP HERE and wait for approval before making modifications.**

Do not create files or edit files during this analysis phase.

---

# PHASE 2 — IMPLEMENT ONLY AFTER APPROVAL

After the design has been reviewed/approved, implement the module.

## 1. NOTIFICATION PURPOSE

The module must turn important trading events into customer notifications.

The primary events are:

```text
ORDER_FILLED
ORDER_REJECTED
ORDER_CANCELLED
```

Example:

```text
Trade Executor
      |
      | trade-events
      v
Notification Consumer
      |
      v
Notification Ledger
      |
      +---- Resolve customer preference
      |
      +---- Deliver through selected channel
      |
      v
Customer
```

The customer should not have to open the blotter to discover that an order was filled or rejected.

---

# 2. KAFKA CONSUMER

Consume the existing:

```text
trade-events
```

topic.

Use a **dedicated consumer group** for notifications.

Do not reuse the consumer group of another service.

For example:

```text
notification-service
```

Use the project's existing Kafka configuration conventions rather than hardcoding values.

Consume:

```text
ORDER_FILLED
ORDER_REJECTED
ORDER_CANCELLED
```

Do not create a duplicate event stream if `trade-events` already contains everything required.

---

# 3. KAFKA AT-LEAST-ONCE SEMANTICS

Assume Kafka can deliver an event more than once.

For example:

```text
eventId = abc-123
```

received once:

```text
abc-123 → create notification
```

received again:

```text
abc-123 → DO NOT create/send another notification
```

Use the existing idempotency patterns if possible.

The primary idempotency key should be:

```text
eventId
```

A duplicate event must become a no-op.

This must be proven with a test.

---

# 4. DATABASE / NOTIFICATION LEDGER

Inspect the existing database naming and migration conventions first.

Then introduce the minimum persistent data required for reliable notification delivery.

A notification record should conceptually contain:

```text
notification_id
event_id
account_id
type
title
message
channel
status
created_at
sent_at
failed_at
```

Potential status values:

```text
QUEUED
SENT
FAILED
```

Use existing project conventions if equivalent enums/status representations exist.

Important:

The database notification record is the **delivery ledger**.

Kafka offset and notification delivery state are separate concepts.

---

# 5. KAFKA OFFSET VS DELIVERY STATE

Do not treat a committed Kafka offset as proof that the customer received a notification.

The flow should conceptually be:

```text
Kafka event received
       |
       v
Create durable notification record
       |
       v
Notification is QUEUED
       |
       v
Kafka offset can be committed
       |
       v
Resolve channel
       |
       v
Attempt delivery
       |
       +---- success → SENT
       |
       +---- failure → FAILED
```

The external email/SMS/push provider must NOT block the Kafka partition indefinitely.

The important guarantee is:

> Once the Kafka event is durably recorded as a notification, it can be delivered independently of the Kafka consumer lifecycle.

Follow the existing transaction and Kafka acknowledgment conventions in the codebase.

Do not invent a completely separate messaging infrastructure.

---

# 6. CUSTOMER PREFERENCES DEPENDENCY

The notification channel must come from the Customer Preferences module.

Do NOT do this:

```text
channel = EMAIL;
```

Do NOT read a duplicated preference stored inside the notification module.

Instead:

```text
Notification
     |
     v
Customer Preferences interface
     |
     v
EMAIL / SMS / PUSH
```

The channel must be resolved when the notification is being sent.

Do not cache the channel indefinitely.

The requirement is that the channel comes from the current preference.

---

# 7. NO CUSTOMER-SUPPLIED DESTINATION

Do not allow a customer to submit an arbitrary destination such as:

```text
webhookUrl
callbackUrl
customEndpoint
```

and then make the backend call it.

The notification system must use trusted destinations associated with the configured channel.

For example:

```text
EMAIL → customer's verified email
SMS   → customer's verified phone
PUSH  → registered push destination
```

Use whatever verified destination mechanism already exists in the codebase.

---

# 8. OUTBOUND CHANNEL

At least one real notification channel must work.

Preferred implementation:

```text
Email
```

if an existing email/SMTP infrastructure is already available.

If SMS/push infrastructure cannot be provisioned, a logging stub is acceptable.

However, the important part is:

```text
preference resolved
        ↓
actual channel selected
        ↓
resolved channel persisted
        ↓
delivery attempted
```

Do not simply log:

```text
"Notification sent"
```

without actually performing the configured channel behavior or explicitly using the project's approved delivery stub.

---

# 9. RECORD THE RESOLVED CHANNEL

When a notification is created/sent, persist the actual resolved channel.

Example:

```text
notification_id: 101
event_id: abc-123
account_id: 6
type: ORDER_FILLED
channel: EMAIL
status: SENT
```

This allows the demonstration to prove that the notification was routed according to customer preference.

Do not rely on the current preference to reconstruct historical routing.

---

# 10. NOTIFICATION CONTENT

Create safe customer-facing messages.

Examples:

### Filled

```text
Your order for 10 TCS has been filled.
```

### Rejected

```text
Your order for 10 TCS was rejected.
```

### Cancelled

```text
Your order for 10 TCS was cancelled.
```

Use the actual event data available in the existing `trade-events` contract.

Do not include sensitive information.

Never include:

* Passwords
* JWTs
* Refresh tokens
* Credentials
* Full payment/card information
* Internal secrets

Respect the restrictions defined in:

```text
contracts/kafka-topics.md
```

---

# 11. CUSTOMER NOTIFICATION HISTORY API

Design and implement customer-facing notification history endpoints following the existing API conventions.

The API contract must be written/updated before implementing the controller.

At minimum, support something equivalent to:

```text
GET /api/v1/notifications
```

The exact route should follow existing project naming conventions.

The history should support the current authenticated customer.

---

# 12. ACCESS CONTROL

This is mandatory.

The JWT contains an `accountId`.

Every notification-history request must verify that the requested history belongs to that account.

Never trust a caller-supplied account ID alone.

For example:

```text
JWT accountId = 6

GET /api/v1/notifications?accountId=7
```

must NOT return account 7's notifications.

Prefer deriving the account from the verified token wherever possible.

If the existing project uses:

```text
AUTH-401
```

for unauthenticated requests and an existing authorization error convention for forbidden resources, follow those conventions.

Do not invent unnecessary error codes.

---

# 13. API ERROR FORMAT

Use the existing platform error format:

```json
{
  "errorCode": "....",
  "message": "...."
}
```

Do not introduce a completely different error response structure.

Extend the error catalogue only if an existing error code cannot represent the required failure.

---

# 14. WATCHLIST / PRICE ALERT DELIVERY INTERFACE

Expose an internal Java interface for other modules to request a notification.

Conceptually:

```java
public interface NotificationDeliveryService {

    void notifyPriceAlert(...);

}
```

The exact interface and method signature must be designed from the existing watchlist implementation.

The interface should contain enough information to create and deliver the alert without allowing arbitrary destinations.

For example, conceptually:

```text
accountId
symbol
alert type
trigger price
current price
```

Do NOT expose this as:

```text
POST /api/v1/notifications/send
```

A customer must never be able to directly call an endpoint to send arbitrary notifications.

Watchlists should call the Java interface.

---

# 15. WATCHLIST INTEGRATION

Inspect how price alerts are currently detected.

When an alert is triggered:

```text
Watchlist
    |
    v
NotificationDeliveryService
    |
    v
Notification module
    |
    v
Resolve preference
    |
    v
Deliver
```

Do not duplicate threshold detection inside the notification module.

The watchlist module owns:

```text
"Has the threshold been crossed?"
```

The notification module owns:

```text
"How do I notify the customer?"
```

---

# 16. ANGULAR NOTIFICATION HISTORY

Add notification history to the Angular application following the existing UI architecture.

The UI should display at least:

```text
Notification
Time
Type
Message
Channel
Status
```

Example:

```text
-----------------------------------------------
Notifications

09:00 AM
ORDER FILLED
Your order for 10 TCS has been filled.
Channel: EMAIL
Status: SENT

10:30 AM
ORDER REJECTED
Your order for 5 INFY was rejected.
Channel: EMAIL
Status: SENT
-----------------------------------------------
```

Do not use localStorage as the source of truth.

The backend notification history API is the source of truth.

---

# 17. OPTIONAL READ STATE

Do NOT prioritize read/unread functionality if it is not already supported.

The specification explicitly lists read receipts as out of scope unless the rest of the module is complete.

Focus first on:

* Consumption
* Persistence
* Preference resolution
* Delivery
* History
* Idempotency
* Watchlist integration

---

# 18. RETRIES

Do not over-engineer retry logic initially.

The mandatory scope does NOT require sophisticated retry/backoff differentiation.

At minimum:

```text
delivery succeeds → SENT

delivery fails → FAILED
```

Keep the design extensible for future retry/backoff.

Do not allow an external provider failure to block Kafka processing indefinitely.

---

# 19. OPENAPI CONTRACT

There is currently no contract for this module.

Design the API and update/create the OpenAPI contract **before implementing the controller**.

The contract must include:

* Endpoints
* Request schemas
* Response schemas
* Authentication
* Authorization behavior
* Error responses
* Notification status
* Notification channel
* Notification type

Follow existing platform conventions.

After modifying the contract, update any generated clients used by Angular or other services.

---

# 20. TESTING

Add tests for all important behavior.

### Kafka event → notification

```text
ORDER_FILLED
    ↓
notification created
    ↓
channel resolved
    ↓
delivery attempted
```

### Rejection

```text
ORDER_REJECTED
    ↓
customer receives notification
```

### Cancellation

```text
ORDER_CANCELLED
    ↓
customer receives notification
```

### Idempotency

Replay:

```text
eventId = abc-123
```

twice.

Expected:

```text
first → notification created/sent
second → no duplicate notification
```

### Preferences

```text
preference = EMAIL
→ EMAIL delivery
```

```text
preference = SMS
→ SMS delivery
```

or the available configured channels.

### No preference

Test the behavior agreed with the preferences module.

Possible documented behavior:

```text
No preference
    ↓
hold notification
```

or:

```text
No preference
    ↓
documented default channel
```

Do not silently discard the notification.

### Access control

```text
Account 6 token
    ↓
GET notifications for account 6
    → allowed

Account 6 token
    ↓
attempt to read account 7 history
    → denied
```

### Watchlist alert

Trigger a price alert and verify:

```text
watchlist
    ↓
notification interface
    ↓
notification ledger
    ↓
configured channel
```

### Sensitive information

Verify sensitive credentials are never included in notification messages.

---

# 21. DEMONSTRATION REQUIREMENTS

The final implementation should allow a demonstration of:

### Scenario 1 — Filled order

```text
Place order
    ↓
Trade Executor fills order
    ↓
trade-events → ORDER_FILLED
    ↓
Notification service
    ↓
Preference resolved
    ↓
Notification persisted
    ↓
Customer receives notification
```

### Scenario 2 — Rejected order

```text
Place invalid/unexecutable order
    ↓
ORDER_REJECTED
    ↓
Notification
    ↓
Customer sees rejection
```

### Scenario 3 — Cancelled order

```text
Order cancelled
    ↓
ORDER_CANCELLED
    ↓
Notification
```

### Scenario 4 — Duplicate event

Replay the same Kafka event.

Show:

```text
eventId = X

First delivery  → notification
Second delivery → no duplicate
```

### Scenario 5 — Notification history

Customer opens Angular notification history and sees the previous notifications without needing to reopen the blotter.

### Scenario 6 — Watchlist price alert

Trigger a watchlist price alert and demonstrate:

```text
Watchlist
   ↓
Notification interface
   ↓
Customer preference
   ↓
Configured channel
```

---

# 22. FINAL ARCHITECTURE

The expected high-level architecture should be:

```text
                    +----------------+
                    | Trade Executor |
                    +-------+--------+
                            |
                            | trade-events
                            v
                    +---------------------+
                    | Notification Kafka  |
                    | Consumer            |
                    +----------+----------+
                               |
                               v
                    +---------------------+
                    | Notification        |
                    | Service             |
                    +----------+----------+
                               |
                +--------------+--------------+
                |                             |
                v                             v
       Notification DB             Customer Preferences
                |                             |
                |                             |
                +--------------+--------------+
                               |
                               v
                       Email / SMS / Push
                               |
                               v
                           Customer


Watchlist / Price Alerts
          |
          | Java interface
          v
Notification Service
          |
          v
Configured channel
```

Angular:

```text
Angular
   |
   | GET /api/v1/notifications
   v
Trade REST API / Notification API
   |
   v
Notification DB
```

---

# 23. FINAL REVIEW

After implementation, report:

### Files inspected

List the important existing files that were inspected before making changes.

### Files created

List every new file.

### Files modified

List every modified file.

### Database

Explain:

* New tables
* Columns
* Relationships
* Indexes
* Constraints
* Migration

### Kafka

Explain:

* Existing topic consumed
* Consumer group
* Event types
* Idempotency mechanism
* Offset/notification delivery separation

### Preferences

Explain:

* Existing interface used
* How channel is resolved
* How missing preference is handled

### Watchlists

Explain:

* Java interface
* How alerts call the notification module

### REST API

Explain:

* Endpoints
* Authentication
* Account ownership checks
* OpenAPI changes

### Angular

Explain:

* Notification history
* API service
* Components
* Authentication behavior

### Tests

List tests executed and their results.

## FINAL RULE

**Do not modify anything until the complete codebase inspection and implementation proposal are finished.**

Do not make speculative changes.

Do not create duplicate infrastructure.

Reuse existing:

* `trade-events`
* Kafka configuration
* authentication
* account ownership
* database conventions
* error handling
* idempotency patterns
* notification channel/preferences interface
* Angular architecture

Only make changes after verifying how these pieces currently work in the actual codebase.
