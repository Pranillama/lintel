# Cartesia reviewer setup (Pranil)

Browser only. Talk to Lintel from a bill page. There is no phone number and no `--phone` flag.

The tools are read-only. Nothing in this setup can approve, reject, assign, process, or pay a bill. The Cartesia API key stays on the server. The browser only receives a short-lived access token.

## 1. Cartesia account and API key

1. Create an account at https://play.cartesia.ai (a dedicated Lintel account).
2. Add a card. Agent minutes are billed in USD. They are not covered by free credits. About $0.06/min plus model tokens.
3. Create an API key at https://play.cartesia.ai/keys. It looks like `sk_car_…`.

## 2. Which env var goes where

| Variable | Convex dashboard | `.env.local` or the shell (setup script) | Vercel |
|---|---|---|---|
| `LINTEL_VOICE_TOOL_SECRET` | Yes. The three GET tools check this bearer. | Yes. Same value, so the script can store it on the tools. | No |
| `CARTESIA_API_KEY` | Yes. `startVoiceSession` mints the browser token with it. | Yes. The setup script calls the Cartesia API with it. | No |
| `CARTESIA_REVIEWER_AGENT_ID` | Yes, after the script prints it. The bill page will not connect without it. | Yes, if you run the script again and want it to update that agent. | No |
| `CONVEX_SITE_URL` | No | Yes. `https://<deployment>.convex.site`, no trailing slash. | No |
| `CARTESIA_AGENT_MODEL` | No | Optional. Skip it and a live run prefers `claude-sonnet-5` from `GET /v1/agents/models`. | No |
| `CARTESIA_VOICE_ID` | No | Optional. Default is the Skylar id in `src/voice/reviewerAgent.ts`. | No |
| `NEXT_PUBLIC_CONVEX_URL` | No | Yes, for `next dev`. `npx convex dev` writes it. | Yes. This is the only voice-related value Vercel needs. |

Never prefix the Cartesia key or the tool secret with `NEXT_PUBLIC_`. Never commit a real value. `.env.example` lists the names empty.

## 3. Deploy the voice routes

The three routes are `GET /voice/open`, `GET /voice/find`, and `GET /voice/bill/<bill_id>` on the Convex site (not the Next.js app). `startVoiceSession` is a Convex action in `convex/pipeline/voice.ts`.

1. From the repo: `npx convex dev` (or `npx convex deploy` for the shared deployment).
2. Copy the `.convex.site` origin into `CONVEX_SITE_URL`.
3. In that deployment's dashboard, set `LINTEL_VOICE_TOOL_SECRET` and `CARTESIA_API_KEY`. Add `CARTESIA_REVIEWER_AGENT_ID` after step 4.

The deployment must already contain processed bills. Voice only reads what `listBills` returns. Run the Saturday intake on that desk first. Live bill ids are not the fixture keys `BILL-101` / `BILL-103`. Ask by vendor name (`EBMUD`).

Check by hand:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$CONVEX_SITE_URL/voice/open"
curl -s -H "Authorization: Bearer $LINTEL_VOICE_TOOL_SECRET" "$CONVEX_SITE_URL/voice/find?q=EBMUD"
```

The first is 401. The second is 200 and JSON.

## 4. Create the Reviewer agent

Dry run. No key, no network, no phone:

```bash
node --experimental-strip-types scripts/cartesia-setup.mjs --dry-run
```

Live create or update, after the env vars in the local shell are set:

```bash
node --experimental-strip-types scripts/cartesia-setup.mjs
```

The script prints `agent_id`. Copy it into the Convex dashboard as `CARTESIA_REVIEWER_AGENT_ID`. Re-running updates the tools and the agent named `Lintel Reviewer`. `--phone` is not a flag. The script exits if you pass it.

## 5. Smoke test in the browser

1. `npm run dev` with `NEXT_PUBLIC_CONVEX_URL` set.
2. Open a processed EBMUD bill at `/bills/<id>`.
3. Click **Talk to Lintel**. Allow the microphone.
4. The status should move through Connecting, then Listening or Speaking. The greeting is: "Hi, I'm Lintel. Ask me about any bill on the desk."
5. Ask: "Why is this bill held?"

The reply should use the tool's words, including `+281.0%` and `VP Finance`, and it should say a person has to decide. Then ask it to approve the bill. It should refuse, and the bill status on the page should stay the same.

If the panel says "Voice is not configured.", `CARTESIA_API_KEY` or `CARTESIA_REVIEWER_AGENT_ID` is missing on the Convex deployment. If it says the microphone was denied, allow the mic and click Talk again. The rest of the bill page still loads in both cases.

If it says it cannot find EBMUD, that deployment has no processed EBMUD bill yet.
