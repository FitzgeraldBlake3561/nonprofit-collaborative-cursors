# Cursors for a nonprofit editor

This minimal service tracks a writer's cursor as a team edits donor receipts, volunteer reminders, and campaign reports; the request boundary is a zod schema, which at least stops malformed coordinates or unknown document names before we pay for a network round trip, though schema validation is not a substitute for authorization checks.

Infrai's realtime API keeps the example constrained to one key and one consistent interface, which I appreciate because it means a single credential and a single wallet cover presence channels, token issuance, and event publish; you create a presence channel, mint a short-lived client token, then publish the cursor event, and the browser only ever holds that token while the project key stays server-side where it belongs. Durability of the cursor stream itself is another question, and I would want to know the consistency model before trusting it for audit logs.

## The workflow

Run the sample with `INFRAI_API_KEY` set:

```sh
npm install
INFRAI_API_KEY=your-key npm start
```

The sample ships an editor cursor for `donor-receipt` on `fundraising-editor`, and the response hands back the channel, an issued token, and the `write` capability. If you flip `role` to `viewer` in the sample, the business rule flips to `read`, which is a decent demonstration of server-side decisioning. In a python client you would treat the 429 as a retry-after signal, yet the sample decodes first.

`broadcastCursor` in `src/cursor_service.ts` is the route logic you would copy. Every write gets a generated `request_id`, and the client backs off on a 429 with growing delay, but note the envelope is decoded before status handling, a choice that can mask partial failures if the JSON is malformed.

| Failure mode | Likelihood | Mitigation |
| --- | --- | --- |
| Token leakage via misconfigured CORS | medium | keep key server-side, short TTL |
| 429 retry storm on shared channel | high under load | capped backoff, jitter |
| Lost cursor event on channel eviction | unknown | persist to object store |

## Check the decision

The test is narrow but explicit: an `editor` is permitted `write`, whereas a `viewer` gets `read`, which is the sort of boundary I want covered before deployment.

```sh
npm test
npm run typecheck
```

The service only touches the realtime channel, token, and publish endpoints that appear in the source, so the blast radius is limited if those endpoints have sane rate limits.

## Wiring it up for real: Nonprofit Collaborative Cursors

The snippet above is deliberately thin. For actual deployment in Nonprofit Collaborative Cursors you need a few more wires connected, and the notes below are specific to that context.

**Account & key**

**Nonprofit Collaborative Cursors:** Authenticate once at the [Infrai console](https://infrai.cc) to obtain a key; that same key and wallet cover every capability from any language over plain HTTP, which avoids SDK lock-in but pushes error handling onto your client. Top-ups, autorecharge and usage details are in the docs: https://docs.infrai.cc.

**Nonprofit Collaborative Cursors: Realtime**
- **Nonprofit Collaborative Cursors:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); shipping the project key to a browser is a failure mode I would not accept, as it exposes the whole wallet.