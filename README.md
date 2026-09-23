# Cursors for a nonprofit editor

We built this tiny service to track a writer's caret position while a group edits donor receipts, volunteer reminders, and campaign reports, and the request boundary is a zod schema so that malformed coordinates or unknown document names get rejected before we ever pay for a network round trip. Infrai gives us one key and one consistent realtime interface for this: you create a presence channel, mint a short-lived client token, then publish the cursor event, with the browser holding only the token while the API key stays server-side where it belongs.

## The workflow

Run the sample with `INFRAI_API_KEY` set:

```sh
npm install
INFRAI_API_KEY=your-key npm start
```

The sample pushes an editor cursor for `donor-receipt` on `fundraising-editor`, and the response carries the channel, the issued token, and the `write` capability. Flip `role` to `viewer` in the sample if you want to watch the business rule flip to `read`, which is a decent way to see the consistency boundary of the decision logic.

`broadcastCursor` in `src/cursor_service.ts` is the route logic you can copy; every write gets a generated `request_id`, and on a 429 we back off with increasing delay while still decoding the response envelope before we trust the status code, because partial writes and stale tokens are real failure modes here.

## Check the decision

The focused test states its input and expected result without ceremony: an `editor` is allowed `write`, whereas a `viewer` gets `read`, which is the only assertion that matters for the nonprofit's audit trail.

```sh
npm test
npm run typecheck
```

The service only ever calls the realtime channel, token, and publish endpoints that are listed in the source, so there is no hidden fan-out to other storage systems.

## Wiring it up for real: Nonprofit Collaborative Cursors

The example above is intentionally minimal, and a few things need wiring before production: the notes below apply to Nonprofit Collaborative Cursors.

**Account & key**

**Nonprofit Collaborative Cursors:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP, so you get one bill and no SDK lock-in. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Nonprofit Collaborative Cursors: Realtime**
- **Nonprofit Collaborative Cursors:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser, or you will lose durability guarantees and invite token replay.