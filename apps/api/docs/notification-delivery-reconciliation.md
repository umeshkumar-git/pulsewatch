# Notification Delivery Reconciliation Runbook

## Purpose

This runbook explains how to investigate and reconcile notifications marked `DELIVERY_UNKNOWN`.

SMTP delivery cannot guarantee exactly-once delivery. A connection failure after message submission may occur even when the SMTP provider has accepted the email. Automatically retrying such a notification could send duplicate emails.

## Notification Statuses

| Status             | Meaning                                               | Automatic action               |
| ------------------ | ----------------------------------------------------- | ------------------------------ |
| `PENDING`          | Waiting for delivery                                  | Eligible for queue processing  |
| `SENDING`          | A worker claimed the notification                     | In progress                    |
| `SENT`             | SMTP acceptance was recorded in the database          | No retry                       |
| `FAILED`           | A definite failure occurred or retries were exhausted | No automatic retry             |
| `DELIVERY_UNKNOWN` | Delivery outcome cannot be determined                 | Manual reconciliation required |

## Reconciliation Procedure

### 1. Identify affected notifications

Use a read-only database query to inspect unresolved notifications:

```sql
SELECT
    id,
    recipient,
    event_type,
    incident_id,
    status,
    attempt_started_at,
    provider_message_id,
    error_message,
    created_at
FROM notifications
WHERE status = 'DELIVERY_UNKNOWN'
ORDER BY attempt_started_at ASC;
```

Do not automatically retry these records.

### 2. Check the SMTP provider

For each notification:

1. Identify the recipient and approximate attempt time.
2. Check the SMTP provider's message or delivery logs.
3. Search using the recipient, timestamp, and provider message ID if available.
4. Establish whether the provider accepted the message.
5. Record the evidence and reconciliation decision.

### 3. If provider evidence confirms acceptance

Only after confirming acceptance, update the notification to `SENT`.

Use a transaction and replace the placeholders with verified values:

```sql
BEGIN;

UPDATE notifications
SET
    status = 'SENT',
    sent_at = NOW(),
    provider_message_id = '<verified-provider-message-id>',
    error_message = NULL
WHERE id = '<notification-id>'
  AND status = 'DELIVERY_UNKNOWN';

-- Verify that exactly one row was updated.
COMMIT;
```

If the update affects zero rows, stop and investigate the current status. Do not force the update.

### 4. If provider evidence confirms non-acceptance

Only when provider evidence establishes that the message was not accepted, an operator may return it to `PENDING`:

```sql
BEGIN;

UPDATE notifications
SET
    status = 'PENDING',
    attempt_started_at = NULL,
    error_message = NULL
WHERE id = '<notification-id>'
  AND status = 'DELIVERY_UNKNOWN';

-- Verify that exactly one row was updated.
COMMIT;
```

The worker's startup recovery process re-enqueues `PENDING` notifications. Confirm that the worker is running and monitor the notification's subsequent status.

Do not perform this update when provider evidence is missing or inconclusive.

### 5. If the outcome remains uncertain

Leave the notification in `DELIVERY_UNKNOWN`.

Escalate to the responsible operations team or SMTP provider. Do not retry merely because a provider log entry is unavailable.

## Operational Safety Rules

- Never bulk-reset `DELIVERY_UNKNOWN` notifications to `PENDING`.
- Never retry an ambiguous delivery without evidence of non-acceptance.
- Preserve provider message IDs and investigation evidence.
- Use the status condition in every reconciliation update.
- Verify the affected row count before committing a database transaction.
- Record the operator, timestamp, notification ID, evidence, and decision in the incident or operations record.
- Do not mark a notification `SENT` based only on an assumption that the email was delivered.

## Verification After Reconciliation

After resolving a notification:

1. Query its database status.
2. Confirm that the status matches the provider evidence.
3. If requeued, confirm that the worker processes it.
4. Check worker logs for errors.
5. Record the final outcome in the operations record.

## Important Limitation

`SENT` means the application recorded SMTP acceptance. It does not independently prove that the recipient's mailbox received, displayed, or was read by the email.
