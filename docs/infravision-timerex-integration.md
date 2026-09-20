# InfraVision Partner Lead × TimeRex integration

## Decision (2026-09-21)

Current TimeRex plan is not Premium. For initial production operation, TimeRex booking status is maintained manually in the InfraVision partner lead admin screen.

The lead funnel remains:

1. `schedule_pending` — LP form received / booking not yet confirmed
2. `scheduled` — staff confirms TimeRex booking and updates status
3. `meeting_completed`
4. `partnered` or `lost`

Cancellation: staff changes `scheduled` back to `schedule_pending`.
Reschedule: keep `scheduled` and update booking information manually as needed.

## Why webhook is disabled

The LP creates an atLIB lead ID and passes it to the TimeRex URL as `lead_id`. Automatic correlation requires TimeRex to return that arbitrary URL parameter through the booking/webhook data. This capability is treated as a Premium upgrade dependency and must be verified against the actual production account before enabling automatic status changes.

The webhook route implementation is intentionally retained in the codebase but is **not mounted in production routing** while the current plan is in use. Do not enable a generic/guessed payload parser.

## Premium upgrade implementation path

When TimeRex is upgraded to Premium:

1. Register the atLIB webhook endpoint:
   `POST /api/webhooks/timerex/infravision-partner`
2. Verify the exact official webhook event names and JSON payload using the production TimeRex account.
3. Verify that `lead_id` passed on the scheduling URL is returned in webhook data.
4. Implement strict schema validation for booking, cancellation and reschedule events.
5. Add webhook authenticity controls supported by TimeRex (signature/secret or equivalent, if provided).
6. Make processing idempotent using the TimeRex reservation/event identifier.
7. Booking: `schedule_pending -> scheduled`, store scheduled datetime and TimeRex identifier.
8. Cancellation: return the lead to `schedule_pending` and clear/update booking fields as appropriate.
9. Reschedule: keep `scheduled` and replace scheduled datetime/identifier according to the verified payload.
10. Run E2E test:
    LP form -> DB lead -> TimeRex -> booking webhook -> admin status -> cancellation/reschedule webhook.
11. Only after the E2E test succeeds, mount the webhook router in `src/server.ts`.

## Current operational rule

The admin screen is the source of truth for sales follow-up status. Staff must check TimeRex and update the corresponding lead status manually. This is an accepted temporary operating model, not a defect blocking the InfraVision partner LP launch.
