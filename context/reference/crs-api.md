# CRS Credit API Sandbox Reference (Verified for Cal Hacks 13.0 — Lintel)

**Source:** Official Cal Hacks CRS portal (`https://calhacks.crscreditapi.com`) and unpacked `@crscreditapi/crs-calhacks-mcp-server@1.1.2`.

---

## 1. How to Get Your Credentials (Self-Serve in 60 Seconds — No Slack Wait Needed)

1. Open **`https://calhacks.crscreditapi.com/#getting-started`** and enter your email (`juniyalama50@gmail.com`) in Step 01 ("Enter your email" -> **Send invite**), OR run this in your terminal:
   ```bash
   curl -s "https://portal.internal.crscreditapi.com/api/v1/developers?email=juniyalama50%40gmail.com&name=Pranil%20Lama"
   ```
2. Check your email for the CRS portal invite to get your **`CRS_USERNAME`** and **`CRS_PASSWORD`**.
   - *Important:* If your password contains `#`, wrap it in quotes in `.env.local` / Convex env.
   - *Important:* Never retry a failed login in a loop—repeated failed logins trigger `CRS113`/`CRS114` and disable the sandbox account.
3. Optional for Claude Code / Cursor local dev: attach the official CRS MCP server in one command:
   ```bash
   claude mcp add crs-calhacks \
     -e CRS_USERNAME=YOUR_USERNAME \
     -e CRS_PASSWORD=YOUR_PASSWORD \
     -- npx -y @crscreditapi/crs-calhacks-mcp-server@latest
   ```

---

## 2. Sandbox Base URL & Authentication Flow

- **Sandbox Base URL:** `https://api-sandbox.stitchcredit.com/api`
- **Step 1 — Login to get JWT Bearer Token (`POST /users/login`):**
  ```typescript
  const loginRes = await fetch("https://api-sandbox.stitchcredit.com/api/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      username: process.env.CRS_USERNAME,
      password: process.env.CRS_PASSWORD,
    }),
  });
  // Returns: { token: "<JWT>", expires: ..., refreshToken: "..." }
  const { token } = await loginRes.json();
  ```
- **Step 2 — Call Product Endpoints with `Authorization: Bearer ${token}`:**
  Every response includes a `RequestID` response header (`res.headers.get("RequestID")`) which you should record in `CrsResult.raw_summary` / audit logs to prove the live sandbox call!

---

## 3. Best CRS Endpoints & Official Sandbox Personas for Lintel (`verifyVendor`)

In Lintel, `V-APEX` (**Apex Rapid HVAC LLC**) is our `UNVERIFIED_CONTRACTOR`. Every record in the CRS sandbox is one of 20 official fake personas (`P01`–`P20`).

### Best Persona Match for an Unverified Contractor Principal (`V-APEX`):
- **Persona `P08` — `PRIYA VENKATESAN` (`crs_identity_ref: "P08"`):**
  - *Official CRS summary:* **"Decent credit, but PitchPoint shows an unpaid state tax lien and a civil judgment from a contractor dispute."**
  - **Endpoint 1 (PitchPoint Bankruptcies, Liens & Judgments — `POST /pp/fcrablj/data`):**
    ```json
    {
      "terms": {
        "term": [
          {
            "person": {
              "firstName": "PRIYA",
              "lastName": "VENKATESAN",
              "ssn": "666701008"
            }
          }
        ]
      }
    }
    ```
    *Returns:* Synchronous 200 JSON showing **1 civil judgment ($12,300) + 1 state tax lien ($7,450)** -> maps cleanly to `status: "FLAGGED"` (or `HELD`/`BLOCKED`) with real court lien/judgment data!
- **Alternative High-Fraud Persona (`P13` — `KAYLA BRENNAN`, `crs_identity_ref: "P13"`):**
  - **Endpoint 2 (AtData Fraud Finder — `POST /fraud-finder/fraud-finder`):**
    ```json
    {
      "firstName": "KAYLA",
      "lastName": "BRENNAN",
      "phoneNumber": "5550101013",
      "email": "kb.9921x@example.com",
      "ipAddress": "198.51.100.13",
      "address": {
        "addressLine1": "9021 KINGSTON PIKE",
        "city": "KNOXVILLE",
        "state": "TN",
        "postalCode": "37923"
      }
    }
    ```
    *Returns:* `risk.score: 88` (high risk, email 3 days old, phone owner `no_match`, VoIP prepaid).
  - **Endpoint 3 (TransUnion TruValidate Identity Verification — `POST /transunion/identity-manager-verification/basic`):**
    ```json
    {
      "firstName": "KAYLA",
      "lastName": "BRENNAN",
      "ssn": "666701013",
      "dob": "1999-12-24",
      "street1": "9021 KINGSTON PIKE",
      "city": "KNOXVILLE",
      "state": "TN",
      "zip": "37923"
    }
    ```
    *Returns:* `FAIL` (SSN issue date inconsistent with DOB; multiple names linked to SSN).
- **Clean Small-Business Owner Persona for `PASS` Testing (`P19` — `GRACE NAKAMURA` or `P01` — `MARGARET OKAFOR`):**
  - `P19` (`firstName: "GRACE"`, `lastName: "NAKAMURA"`, `ssn: "666701019"`, `dob: "1976-09-16"`, `street1: "1850 SOLANO AVE"`, `city: "BERKELEY"`, `state: "CA"`, `zip: "94707"`, `email: "grace.nakamura@example.com"`, `phoneNumber: "5550101019"`):
  - Returns `PASS` on TU Identity, `0/0/0` on PitchPoint BLJ, `risk.score: 9` (low) on Fraud Finder, and `770` credit score across all 3 bureaus.
