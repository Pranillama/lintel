# Cartesia reviewer setup (Pranil)

Phone-first option A, with the phone number optional. The agent can be created and talked to in the Cartesia Playground with no number. Do not build the browser panel in this step.

The tools are read-only. Nothing in this setup can approve, reject, assign, process, or pay a bill.

## 1. Cartesia account and card

1. Create an account at https://play.cartesia.ai (a dedicated Lintel account, not a personal one you use for other projects).
2. Add a card. Agent minutes are billed in USD. They are not covered by free credits. About $0.06/min plus model tokens. A number, if you buy one, adds about $0.014/min.
3. Create an API key at https://play.cartesia.ai/keys. It looks like `sk_car_…`.

## 2. Env vars, and where each one goes

| Variable | Where | Required |
|---|---|---|
| `LINTEL_VOICE_TOOL_SECRET` | Convex dashboard → Settings → Environment Variables, and your local shell when you run the script. Same value in both places. | Yes |
| `CONVEX_SITE_URL` | Local shell only. `https://<deployment>.convex.site`, no trailing slash. | Yes, for the script |
| `CARTESIA_API_KEY` | Local shell only. Never in the Convex dashboard and never `NEXT_PUBLIC_`. | Yes, for a live script run |
| `CARTESIA_REVIEWER_AGENT_ID` | Local shell, after the first successful run, if you want the next run to update that agent. | No |
| `CARTESIA_AGENT_MODEL` | Local shell. Skip it and the script asks `GET /v1/agents/models`, preferring `claude-sonnet-5`. | No |
| `CARTESIA_VOICE_ID` | Local shell. Default is the Skylar id in `src/voice/reviewerAgent.ts`. | No |
| `CARTESIA_PHONE_NUMBER_ID` | Local shell, and only if you pass `--phone`. | No |

Put the local values in `.env.local` (gitignored) or export them in the shell. `.env.example` lists the names with empty values. Do not commit real secrets.

Convex HTTP actions read `LINTEL_VOICE_TOOL_SECRET` from the deployment. The Next.js app does not need the Cartesia key.

## 3. Deploy the voice routes

The three routes are `GET /voice/open`, `GET /voice/find`, and `GET /voice/bill/<bill_id>` on the Convex site (not the Next.js app).

1. From the repo: `npx convex dev` (or `npx convex deploy` for the shared deployment).
2. Copy the `.convex.site` origin into `CONVEX_SITE_URL`.
3. Set `LINTEL_VOICE_TOOL_SECRET` in that deployment's dashboard before you place a test call. Without it every tool returns 401.

The deployment must already contain processed bills. Voice only reads what `listBills` returns. Run the Saturday intake on that desk first. Live bill ids are not the fixture keys `BILL-101` / `BILL-103`. Ask by vendor name (`EBMUD`).

Check by hand:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$CONVEX_SITE_URL/voice/open"
curl -s -H "Authorization: Bearer $LINTEL_VOICE_TOOL_SECRET" "$CONVEX_SITE_URL/voice/find?q=EBMUD"
```

The first is 401. The second is 200 and JSON.

## 4. Create the agent (no phone number)

Dry run, no key, no network:

```bash
node --experimental-strip-types scripts/cartesia-setup.mjs --dry-run
```

Live create or update. This does not buy or attach a number:

```bash
node --experimental-strip-types scripts/cartesia-setup.mjs
```

The script writes the agent id. Save it as `CARTESIA_REVIEWER_AGENT_ID` if you will run the script again. Re-running updates the tools and the agent named `Lintel Reviewer`.

## 5. Phone number (optional)

Skip this if you are staying in the Playground.

1. In the Cartesia dashboard, buy a US number (Phone Numbers). This script will not buy one.
2. Copy the phone number id into `CARTESIA_PHONE_NUMBER_ID`.
3. Attach it:

```bash
node --experimental-strip-types scripts/cartesia-setup.mjs --phone
```

Inbound calls to that number then reach Lintel Reviewer. One number is assigned to one agent.

## 6. Smoke test

Ask, in the Playground chat for this agent, or on the phone if you attached a number:

> Why is the EBMUD bill held?

The reply should use the tool's words, including `+281.0%` and `VP Finance`, and it should say a person has to decide. Then ask it to approve the bill. It should refuse and leave the bill unchanged.

If it says it cannot find EBMUD, that deployment has no processed EBMUD bill yet.
