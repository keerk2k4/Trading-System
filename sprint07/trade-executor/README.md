# Trade Executor — Sprint 7

See `sprint07/README.md` for the full sprint contract.

## Characterisation tests (Sprint 6 order placement, committed first)

Package: `com.tradingsystem.spring_boot_app.characterisation`

Location: `sprint07/spring-boot-app/src/test/java/com/tradingsystem/spring_boot_app/characterisation/`

Classes:

- `OrderPlacementCharacterisationTest` — HTTP edge of `POST /api/v1/orders`:
  affordable order field-by-field (including `FILLED`), reused idempotency key
  (`409 ORD-409`), unaffordable buy (`400 ORD-400`), unknown symbol
  (`404 INS-404`), delisted instrument (conflated to the same `404 INS-404`),
  non-`ACTIVE` account (`403 ACC-403`), missing account (`404 ACC-404`).
- `OrderSettlementCharacterisationTest` — what an accepted order writes:
  order row (`insertOrder` then `updateOrderStatus(..., FILLED)`), cash
  (`updateAvailableBalanceOptimistic` with `price × qty` debited), position
  (`insertPosition` of `qty @ limitPrice` for a fresh account), plus the
  service-level errors (`DuplicateOrderException`, `InsufficientFundsException`,
  `InstrumentNotFoundException`, `AccountNotActiveException`) with no writes.

These tests record what the service does now, including the parts we disagree
with (synchronous `FILLED` instead of `NEW`; delisted conflated with unknown).
Run them with:

```bash
cd sprint07/spring-boot-app && mvn -Dtest='com.tradingsystem.spring_boot_app.characterisation.*Test' test
```

The Sprint 7 change (record at `NEW`, publish to `orders`, answer `NEW`) will
deliberately turn the `FILLED` assertions red; that test is updated in the same
commit as the change.
