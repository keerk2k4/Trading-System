# Customer preferences and personalisation

Every customer-facing feature on this platform needs to know something about the customer
beyond their trades. Which channel to reach them on. Which account to open on by default when
they sign in. Which currency to show a total in. Nothing owns any of that today, so each
feature that needs it invents its own copy, and within a fortnight the copies disagree and
nobody can say which one the customer actually set. This module is the single place that owns
it.

## Where it sits in the order

First of the four, and the reason it is first is that the next one cannot work without it. A
notification has no channel until something holds one, so notifications resolves the channel
through this module rather than holding a constant of its own. Watchlists reaches the same
preference one step further along the chain, through notifications.

| Direction | Module | What crosses the boundary |
|---|---|---|
| Provides | Customer notifications | The customer's alert channel, resolved before a message is sent |
| Depends on | Nothing in this sprint | This module can be built on Monday morning with nothing else running |

Because it is first and everything waits on it, the interface it publishes is the first thing
to agree and the first thing to make real. One Java interface with a stub behind it, agreed on
Monday morning, unblocks the rest of the team on Monday afternoon.

## Who uses it

The customer, through a settings screen in the Angular application, and again at sign-in
without knowing it, because the default account they set is the account the application opens
on. Other modules, which resolve a preference before they act.

## What it integrates with

| Surface | How this module uses it |
|---|---|
| Angular application | The settings screen, and the sign-in path that applies the stored default account |
| Customer notifications | Resolves a channel through this module before sending, across a package boundary rather than over HTTP |
| The platform's account data | Read-only, to resolve an account when a screen needs the holder's details, through the layer that owns it. Do not copy anything `accounts` already owns |
| Kafka | Nothing required. This module need consume no topic and produce none |

## The API is yours

There is no contract for this module. Design the API, write it as OpenAPI before you write the
controller, and bring it to your instructor on day one for review. The platform conventions
still bind: the `{errorCode, message}` envelope, the platform error catalogue extended only
where nothing in it fits, and the bearer token the Trade REST API verifies before any of your
routes run. What the verifier cannot decide is whether this caller may reach this resource, so
every route compares the `accountId` claim against the preferences it is about to return.

Agree one thing with the notifications pair before either of you builds it: the exact interface
notifications resolves a channel through, and what it answers when no preference has been set.
That is the seam, and it is cheaper to agree on Monday than to discover on Wednesday.

## What makes it worth building

Availability, not feature surface. Another module calls this one on a path that decides whether
a customer gets told about their own trade. That inverts the usual priority: a small interface
that is always there is worth more than a large one that is occasionally not. What that
interface looks like, what the caller does when nothing has been stored, and whether it fails
open or fails closed are the interesting parts, and every one of them is a decision log entry.

The call is in-process this year, which removes the timeout and adds a subtler risk: a caller
that reads your tables directly because the connection is right there. Publish one interface
for resolution, keep everything else behind it, and be able to say who calls it.

The second question is what this module should hold at all. An email address and a telephone
number are personal data, and they may already exist somewhere else on the platform. Storing a
second copy doubles the number of places a leak can happen and creates a reconciliation problem
the day one of them changes. Deciding to store a reference rather than a copy is a defensible
answer, and so is the opposite, but the decision has to be taken rather than fallen into.

## Scope for one week

A preference record per customer covering, at a minimum, a default account and an alert channel
with its contact detail. Reads and writes from the Angular settings screen. A resolution route
the notification path can call. Persistence that survives a restart, which the
acceptance criterion depends on: a preference that lives in memory is applied at the next login
only if nothing restarted in between.

The default account applied at the customer's next sign-in, in the Angular application, is part
of this deliverable rather than a nicety. It is what turns a stored row into a preference.

Out of scope unless the rest is finished: preference history and revert, multiple contact
points per channel, and publishing a change event so that callers do not have to ask.

## What to get right

- **Access control.** A customer reads and writes their own preferences only. The account comes
  from the verified token and is compared against the account in the path on every route.
- **The internal path is not the customer route.** What notifications calls to resolve a
  channel is a Java interface, not an HTTP route reachable by anyone holding a customer token.
  Keep resolution off the wire, or say why it has to be on it.
- **Personal data.** Decide what is stored here, encrypt or reference what is sensitive, and
  keep contact details out of logs and out of Kafka payloads.
- **A default is a decision.** What the platform does when no preference has been set, and what
  a caller does when nothing has been stored, are both behaviours somebody has to choose
  deliberately.





Implement the **Customer Preferences and Personalisation** module in the existing trading platform.

# CRITICAL IMPLEMENTATION RULE

**Do not modify any code, database migration, OpenAPI contract, configuration, Kafka configuration, Angular code, or existing service during the initial investigation.**

The implementation must happen in **one consolidated change after the complete codebase inspection is finished**.

The required workflow is:

```text
PHASE 1
Read/inspect the complete relevant codebase
        ↓
Understand existing architecture
        ↓
Identify reusable components
        ↓
Design database/API/interface changes
        ↓
Present implementation plan
        ↓
ONLY AFTER THE ANALYSIS IS COMPLETE
        ↓
PHASE 2
Make all required changes in one implementation pass
        ↓
Run tests/build
        ↓
Report all changes
```

Do not make speculative changes while investigating.

Do not create duplicate tables, services, authentication mechanisms, account logic, or contact-data storage if the existing platform already owns them.

---

# 1. UNDERSTAND THE EXISTING CODEBASE FIRST

Before making any changes, inspect the relevant parts of the repository.

## Backend

Inspect:

* Existing Spring Boot services
* Package structure
* Controllers
* Services
* Repositories/MyBatis mappers
* Entities
* DTOs
* Configuration
* Exception handling
* Error catalogue
* Authentication
* JWT verification
* Account ownership checks
* Transaction handling
* Existing database migrations

Identify which existing service should own customer preferences.

Do not automatically create a new microservice if the existing architecture has an appropriate place for this functionality.

---

# 2. INSPECT THE DATABASE

Before designing the preference table, inspect all relevant existing database tables.

Especially inspect:

```text
users
accounts
instruments
any customer/profile tables
any contact-information tables
any settings/preferences tables
```

Determine:

* What identifies a customer?
* What identifies an account?
* How `userId` relates to `accountId`
* Where email is currently stored
* Where phone number is currently stored
* Whether contact information already exists
* Whether account status is already available
* Existing primary/foreign keys
* Existing indexes
* Existing migration conventions
* Existing schema names

## VERY IMPORTANT

Do not duplicate existing personal data without a strong reason.

For example, if the platform already owns:

```text
email
phone
```

do not automatically create:

```text
preferences.email
preferences.phone
```

and maintain a second copy.

Determine whether the preferences module should store:

```text
reference → existing customer/contact data
```

or a copy.

Make this decision based on the actual codebase.

---

# 3. UNDERSTAND AUTHENTICATION

Inspect the existing JWT authentication implementation.

Determine exactly how the authenticated customer's:

```text
accountId
userId
```

are obtained from the verified token.

Inspect:

* JWT filter
* JWT provider
* authentication context
* claims
* existing controllers that perform ownership checks

The implementation must use the verified identity.

Do not trust a caller-supplied account ID as the source of truth.

---

# 4. ACCESS CONTROL REQUIREMENT

A customer can only read or modify their own preferences.

For example:

```text
JWT:
accountId = 6

GET /api/v1/preferences/6
```

must be allowed.

But:

```text
JWT:
accountId = 6

GET /api/v1/preferences/7
```

must be rejected.

The same ownership check applies to:

```text
GET
PUT/PATCH
```

and every other customer-facing preference route.

Follow the existing project's authorization/error conventions.

Do not introduce a new authorization mechanism if one already exists.

---

# 5. INSPECT THE EXISTING ACCOUNT FLOW

The requirement includes:

> The customer's default account should be the account the application opens on at sign-in.

Therefore inspect:

* Login flow
* Auth service
* Angular authentication service
* Account loading
* Account selection
* Current-account state
* Any existing account dropdown
* Token claims
* Existing `/accounts` APIs
* Any account-selection logic

Determine where the default account should actually be applied.

Do not duplicate account data into preferences.

The preference should store a reference such as:

```text
defaultAccountId
```

and the existing account service should remain the source of truth for account details.

---

# 6. CUSTOMER PREFERENCES

The module must own customer-specific preferences.

At minimum:

```text
default account
alert channel
contact detail/reference required for that channel
```

Potential preference representation:

```text
accountId
defaultAccountId
alertChannel
contactReference/contact detail
createdAt
updatedAt
```

However, **do not blindly use these exact columns**.

Inspect the existing data model first and use the project's conventions.

---

# 7. ALERT CHANNEL

The notification module must be able to ask the preferences module:

```text
"What channel should I use to notify this customer?"
```

The preferences module must expose a **Java interface** for this.

Conceptually:

```java
public interface CustomerPreferenceResolver {

    NotificationChannel resolveAlertChannel(Long accountId);

}
```

But do not blindly use this exact name or signature.

First inspect the existing package/module architecture and then choose the correct interface.

The interface must:

* Be small
* Be stable
* Be the only internal contract notifications needs
* Hide database details
* Not expose repositories/mappers
* Not require HTTP
* Not require a customer JWT

---

# 8. NO INTERNAL HTTP ROUTE FOR CHANNEL RESOLUTION

This is critical.

The notification module should NOT call something like:

```text
GET /api/v1/preferences/{accountId}/channel
```

for internal notification routing if both modules are designed to communicate in-process.

The internal path should be:

```text
Notification Service
       ↓
CustomerPreferenceResolver
       ↓
Preferences implementation
       ↓
Database
```

Not:

```text
Notification Service
       ↓
HTTP
       ↓
Preferences REST API
```

unless the actual existing architecture makes an in-process interface impossible.

If an HTTP boundary is required by the current architecture, explain why before implementing it.

---

# 9. DEFAULT BEHAVIOR

Inspect the existing application conventions and deliberately decide what happens when a customer has no preference.

This must NOT be accidental.

For example:

```text
No preference
     ↓
use documented default channel
```

or:

```text
No preference
     ↓
hold/reject notification delivery
```

The choice must be documented and implemented consistently.

Similarly determine:

```text
No default account configured
        ↓
What account does Angular open?
```

Use the existing account-selection behavior where possible.

Do not silently invent behavior.

---

# 10. PERSONAL DATA

Inspect where personal information currently lives.

Potentially sensitive information includes:

```text
email
phone number
```

Do not expose personal data unnecessarily.

Requirements:

* Do not log contact details
* Do not put contact details into Kafka messages
* Do not expose unnecessary contact details through APIs
* Do not duplicate personal information without justification
* Reuse existing verified contact information where possible
* If new sensitive data must be stored, follow existing encryption/security conventions

If the existing system already owns the contact information, prefer referencing/resolving it through the owning layer rather than duplicating it.

---

# 11. REST API DESIGN

There is currently no contract for this module.

Inspect the existing API conventions and then design the preferences API.

Write/update the OpenAPI contract **before implementing controllers**.

Possible API shape:

```text
GET    /api/v1/preferences/{accountId}
PUT    /api/v1/preferences/{accountId}
```

But do not blindly use these routes.

Follow the existing platform's:

* URL naming
* versioning
* HTTP methods
* DTO conventions
* response formats
* error formats

The API should allow the customer to:

```text
View preferences
Update default account
Update alert channel
Update relevant preference/contact configuration
```

Do not expose the internal channel-resolution interface as a customer-facing API.

---

# 12. OPENAPI CONTRACT

Create/update the OpenAPI contract before implementing the controller.

The contract must define:

### Preference response

Conceptually:

```json
{
  "defaultAccountId": 6,
  "alertChannel": "EMAIL"
}
```

Do not expose sensitive contact information unless the UI actually requires it.

### Update request

Conceptually:

```json
{
  "defaultAccountId": 6,
  "alertChannel": "EMAIL"
}
```

Use the actual domain model discovered during inspection.

Document:

* 200/204 success behavior
* 400/422 validation errors
* 401 unauthenticated
* 403 unauthorized
* 404 if applicable
* Existing `{errorCode, message}` format

Do not invent a completely new error structure.

---

# 13. DATABASE PERSISTENCE

Create a database migration only after inspecting the existing schema and migration strategy.

The preference record must survive application restart.

The acceptance criterion is:

```text
Customer sets preference
        ↓
Application restarts
        ↓
Preference still exists
        ↓
Next login uses it
```

Use:

* Proper foreign keys
* Appropriate indexes
* Unique constraint for one preference record per customer/account as appropriate
* Existing schema naming conventions

Do not duplicate existing account/user data.

---

# 14. ANGULAR SETTINGS SCREEN

Inspect the current Angular architecture before modifying it.

Determine:

* Existing settings components
* Existing account services
* Existing authentication service
* Existing HTTP services
* Signals/state management
* Form patterns
* Error handling
* Loading indicators
* Existing styling conventions

Then add a customer settings screen consistent with the application.

The customer should be able to configure:

```text
Default Account
Alert Channel
```

and any other required preference supported by the backend.

Example:

```text
Customer Preferences

Default Account
[ Account 6 ▼ ]

Alert Channel
( ) Email
( ) SMS
( ) Push

[Save Preferences]
```

Do not hardcode accounts.

Load available accounts from the existing account API/service.

---

# 15. DEFAULT ACCOUNT AT SIGN-IN

This is part of the required feature.

After the customer signs in:

```text
Login
  ↓
Authenticated user
  ↓
Load customer preference
  ↓
Read defaultAccountId
  ↓
Load/select that account
  ↓
Open application using that account
```

If there is no configured default account:

```text
Use the existing platform's documented default-account behavior.
```

Do not create a second account-selection mechanism.

Make the smallest change necessary to integrate the preference into the existing sign-in flow.

---

# 16. CUSTOMER NOTIFICATIONS INTEGRATION

The next module, Customer Notifications, depends on this module.

Therefore expose the agreed Java interface.

The notification module should be able to do:

```text
accountId
    ↓
CustomerPreferenceResolver
    ↓
alert channel
```

Example:

```text
account 6
   ↓
resolveAlertChannel(6)
   ↓
EMAIL
```

If no preference exists, return the explicitly agreed/default behavior.

Do not make Notification Service access the preferences database directly.

Do not expose repositories or mappers across the package boundary.

---

# 17. WATCHLIST INTEGRATION

Do not implement watchlist behavior inside this module.

Only provide the dependency required by downstream notification delivery.

The architecture should eventually be:

```text
Watchlist
    ↓
Notification interface
    ↓
Notification service
    ↓
Customer preferences interface
    ↓
Preferences
```

This module should not consume Kafka.

This module should not produce Kafka.

---

# 18. KAFKA

Do NOT introduce Kafka for this module.

The specification explicitly states:

```text
Kafka:
Nothing required
```

Therefore:

* No new Kafka topic
* No Kafka consumer
* No Kafka producer
* No preference-change event

unless inspection proves the existing architecture absolutely requires it.

Preference resolution is an in-process interface.

---

# 19. TESTING

Add tests according to the existing testing conventions.

At minimum:

### Create/update preference

```text
Valid preference
→ persisted successfully
```

### Persistence

```text
Save preference
→ restart/reload
→ preference still exists
```

### Ownership

```text
Account 6 token
→ access account 6 preferences
→ allowed
```

```text
Account 6 token
→ access account 7 preferences
→ rejected
```

### Default account

```text
defaultAccountId = valid account
→ accepted
```

```text
defaultAccountId = account belonging to another customer
→ rejected
```

### Alert channel

Test every supported channel.

For example:

```text
EMAIL
SMS
PUSH
```

using whatever channels actually exist in the platform.

### No preference

Verify the explicitly selected default behavior.

### Internal interface

Test:

```text
Notification
    ↓
CustomerPreferenceResolver
    ↓
correct channel
```

and verify the notification module does not access the preferences repository directly.

### Personal data

Verify contact details are not logged or unnecessarily returned.

---

# 20. ERROR HANDLING

Use the existing platform error conventions.

The response must remain compatible with:

```json
{
  "errorCode": "...",
  "message": "..."
}
```

Only extend the error catalogue if an existing error code cannot represent the situation.

Potential cases:

```text
Invalid default account
Unsupported alert channel
Preference not found
Unauthorized preference access
```

Use the project's existing status-code conventions rather than inventing new behavior.

---

# 21. ARCHITECTURE

The final architecture should conceptually be:

```text
                    Angular
                       |
                       | REST
                       v
             Preferences Controller
                       |
                       v
             Preferences Service
                       |
             +---------+---------+
             |                   |
             v                   v
      Preference DB       Account Owner Layer
                              |
                              v
                           Accounts


Notification Service
        |
        | Java interface
        v
CustomerPreferenceResolver
        |
        v
Preferences Service
        |
        v
Preference DB
```

Authentication:

```text
Angular
   ↓
Bearer JWT
   ↓
JWT verification
   ↓
accountId claim
   ↓
ownership check
   ↓
preferences
```

---

# 22. DO NOT DUPLICATE ACCOUNT DATA

The preferences module should store the relationship/reference:

```text
defaultAccountId
```

It should NOT copy:

```text
account balance
account status
cash
positions
holdings
account details
```

Those remain owned by the account/trading domain.

When account information is needed, use the existing account-owning layer.

---

# 23. DO NOT DUPLICATE CUSTOMER CONTACT DATA UNNECESSARILY

Before adding:

```text
email
phone
```

to the preferences table, inspect where they already exist.

If another existing module owns them, use the existing source.

If the preferences module genuinely needs to own a reference, document the decision.

The goal is:

```text
ONE source of truth
```

not:

```text
User email
   ├── users.email
   ├── preferences.email
   └── notifications.email
```

---

# 24. IMPLEMENTATION SEQUENCE

After the codebase inspection and design are complete, implement in this order:

```text
1. Database migration
        ↓
2. Domain/entity/DTO changes
        ↓
3. Repository/MyBatis mapper
        ↓
4. Preference service
        ↓
5. CustomerPreferenceResolver interface
        ↓
6. OpenAPI contract
        ↓
7. REST controller
        ↓
8. Authentication/ownership integration
        ↓
9. Angular API service
        ↓
10. Angular settings UI
        ↓
11. Default-account login integration
        ↓
12. Unit/integration tests
        ↓
13. Build/test entire affected application
```

Do not repeatedly modify the same files while discovering requirements.

Complete the analysis first, then perform the implementation as one coherent change.

---

# 25. FINAL VALIDATION

After implementation verify:

### Preference persistence

```text
Set preference
    ↓
restart backend
    ↓
GET preference
    ↓
same value
```

### Default account

```text
Set default account
    ↓
logout
    ↓
login
    ↓
application opens configured account
```

### Notification dependency

```text
Notification Service
    ↓
CustomerPreferenceResolver
    ↓
configured channel
```

### Access control

```text
Account A
    ↓
can only access Account A preferences
```

### No Kafka

Confirm that this module has:

```text
No Kafka consumer
No Kafka producer
No Kafka topic
```

unless the codebase inspection proves otherwise.

---

# 26. FINAL RESPONSE AFTER IMPLEMENTATION

After making the changes, provide a concise implementation report containing:

## Codebase inspected

List the important existing files/modules inspected before making changes.

## Files created

List all newly created files.

## Files modified

List all modified files.

## Database changes

Explain:

* New/modified table
* Columns
* Foreign keys
* Indexes
* Constraints
* Migration

## REST API

List:

* Endpoints
* Request/response schemas
* Authentication
* Authorization
* Error behavior

## Internal interface

Show:

```text
CustomerPreferenceResolver
```

or the actual interface name chosen.

Explain:

* Who provides it
* Who consumes it
* What it returns
* Behavior when no preference exists

## Angular

Explain:

* Settings screen
* Preference loading
* Preference saving
* Default-account behavior
* Error/loading handling

## Security

Explain:

* JWT account identity
* Ownership validation
* Personal-data handling

## Tests

Report:

```text
Tests passed
Tests failed
Build status
```

## Important architectural decisions

Explicitly state:

* Why Kafka was not used
* Where the source of truth for accounts remains
* Where contact information remains
* How default account is resolved
* How notification channel resolution works
* What happens when no preference exists

---

# FINAL NON-NEGOTIABLE RULE

**Inspect first. Do not modify anything during inspection.**

After the complete codebase analysis and implementation plan are established, make the required changes **once, as one consolidated implementation pass**.

Do not guess existing classes, database tables, APIs, Kafka structures, authentication claims, or Angular services.

**Reuse the existing architecture wherever possible and only create new components where the codebase genuinely has no suitable existing component.**
