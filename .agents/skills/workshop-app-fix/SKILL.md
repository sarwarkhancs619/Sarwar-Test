---
name: workshop-app-fix
description: >
  Scans the user's codebase using a parallel subagent team to find and fix full-stack deployment, authentication, and login/signup errors across frontend, backend, database, and hosting. Enforces Supabase best practices (separating Auth from Public data) and Vercel deployment best practices, while staying efficient on tokens.
---

# Workshop App Fix Skill

## Communication Guidelines (CRITICAL)
The participants in this workshop are non-technical beginners. When this skill is invoked, you MUST permanently shift your communication style for the rest of the conversation:
* Avoid all technical jargon (e.g., instead of "foreign key constraint," say "linking the tables together").
* Explain all changes in extremely simple, easy-to-understand terms.
* Be highly encouraging, patient, and guide them step-by-step.
* Do not overwhelm them with deep architectural details unless they specifically ask.

## Execution Model: Parallel Subagent Team (CRITICAL)
When this skill is invoked, do NOT investigate the codebase sequentially yourself.
Instead, spin up a team of three subagents that run concurrently, each with a narrow, bounded scope. This is both faster and more token-efficient than one agent reading everything in sequence, because each subagent only loads the files relevant to its domain instead of the whole repo.

| Subagent | Scope | Reads |
| :--- | :--- | :--- |
| **Subagent A — Database & Auth Auditor** | Supabase schema, RLS policies, key usage | Supabase config, migration/SQL files, `.env` variable names only (never values) |
| **Subagent B — Frontend & Login Flow Auditor** | Login, signup, session, and form logic | Auth components, API client calls, form validation code |
| **Subagent C — Deployment & Hosting Auditor** | Vercel config, build health, env var presence | `vercel.json`, build logs via Vercel MCP, env var *names* in Vercel project settings |

**Rules for running the team:**
* Launch all three at once — do not wait for one to finish before starting the next.
* Each subagent reports back only its own findings and proposed fixes; it does not apply fixes to files outside its domain.
* After all three report back, YOU (the coordinating agent) reconcile the findings — some bugs span two domains (e.g., a login failure caused by both a bad frontend call AND a missing Vercel env var), so cross-check before applying fixes.
* Apply fixes in dependency order: **Database/Auth first → Frontend second → Deployment last**, since a working login system requires the database to be correct before the frontend can be verified, and deployment is only worth checking once the app works locally.
* Do not re-read a file a subagent already read. Pass findings between subagents as short summaries, not full file contents.

## 1. Supabase Database & Auth Checks (Subagent A)
Users often store user data incorrectly or have authentication logic flaws.
* **Rule**: Core user credentials MUST be stored in the built-in Supabase `auth.users` schema (Authentication tab), NOT in a public `users` table.
* **Action**: If the user has a custom `users` table for passwords/emails, instruct them to delete it. Show them how to use `supabase.auth.signUp()` and `supabase.auth.signInWithPassword()` in their frontend code.
* **Rule**: Public profile data (like usernames or avatars) goes in a `profiles` table in the `public` schema.
* **Action**: If they need a profiles table, generate a SQL script to create `public.profiles` with a foreign key to `auth.users(id)` and a Postgres Trigger that automatically inserts a row upon signup.
* **Rule**: RLS (Row Level Security) must be enabled on every public table, with policies that default to deny and explicitly allow only what's needed (e.g., "users can only read/edit their own row").
* **Action**: If RLS is off anywhere, or a table has no policies (meaning it's fully open or fully locked), generate the correct policy from a plain-English description of what the table is for.

**Key naming — check which system the project uses (IMPORTANT)**
Supabase changed its key naming in November 2025. Projects created before that date may still use the old names; projects created after use the new ones. **Check which one is actually present before assuming — do not hardcode one.**

| | Old (pre-Nov 2025) | New (current) |
| :--- | :--- | :--- |
| **Client-safe key** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (value starts with `sb_publishable_`) |
| **Server-only secret key** | `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SECRET_KEY` (value starts with `sb_secret_`) |

* **Action**: Search the codebase and Vercel env vars for whichever naming is present. If old naming is found in a project that was clearly created after Nov 2025 (check the Supabase dashboard), flag this as likely copied from an outdated tutorial and offer to migrate it to the new key names.
* **Never** let the secret/service-role key appear in any file that ships to the browser (anything in a frontend component, `NEXT_PUBLIC_`-prefixed variable, or client-side bundle). It belongs only in server-side API routes.

## 2. Frontend & Login Flow Checks (Subagent B)
Participants often have errors logging in (using correct, incorrect, or existing credentials) or incomplete signup flows.
* **Action**: Use `grep_search` to find their login/signup/session components.
* **Verify**: Ensure they are not trying to manually query a `users` table for authentication. They must use `@supabase/supabase-js` auth methods (`signUp`, `signInWithPassword`, `signOut`, `getSession`).
* **Verify**: Session persistence is working — a logged-in user should stay logged in on refresh (Supabase handles this automatically if the client is configured correctly; check the client is created once and reused, not recreated on every render).
* **Verify**: Protected pages/routes actually check for a valid session before showing content, and redirect to login if there isn't one.

**Full login/signup coverage checklist (apply across the whole stack)**
For every project, walk through this list and confirm each case is handled — not just the "happy path":
* **Signup**: duplicate email attempted → clear error shown, not a crash. Weak/short password → validated client-side before hitting the server, with a plain-English message ("Password needs at least 6 characters," not a raw Supabase error string).
* **Email confirmation**: if confirmation is required, the user is told to check their email, and login before confirming shows a clear "please confirm your email" message rather than a silent failure.
* **Login**: wrong password / non-existent email → one generic, friendly error (avoid revealing which field was wrong, for basic security hygiene). Empty fields → caught before the request is even sent.
* **Logout**: actually clears the session everywhere (client state + Supabase session), and protected pages immediately reflect the logged-out state.
* **Loading states**: buttons show a loading/disabled state during the request so students don't double-submit by clicking twice.
* **Error display**: every `catch` block shows something to the user — never a silent failure or a raw error object dumped in the console with nothing on screen.

## 3. Vercel Deployment Checks (Subagent C)
If their app is failing to deploy or run on Vercel:
* **Action**: Use the Vercel MCP `list_projects` and `get_deployment_build_logs` to check for build errors.
* **Verify**: Check for the "Missing public directory" error. If found, create a `vercel.json` with `{"framework": "nextjs"}`.
* **Verify**: Use the Vercel MCP to check their environment variables against the key-naming table in Section 1 — confirm both the client-safe and secret keys are present under whichever naming convention the project actually uses, and that the secret key is NOT prefixed `NEXT_PUBLIC_`.
* **Verify**: Confirm the production domain (`project-name.vercel.app` or custom domain) is pointing at the latest successful deployment, not a stale one — check the "Production" badge in the deployments list against the most recent commit.
* **Verify**: If they're sharing a link that keeps "changing," confirm they're sharing the stable production domain and not a per-branch/per-commit preview URL.

## 4. Token Efficiency Rules (apply throughout)
* Subagents read only what their domain needs — never the whole repo.
* Use targeted `grep_search` / file search before opening full files; open only the specific files that match.
* Don't re-fetch build logs or re-read a file more than once per session unless a fix was just applied to it.
* Summarize subagent findings in a few bullet points when passing them to the coordinator — not full file dumps.
* Batch related fixes into a single edit per file instead of many small sequential edits.
* Produce ONE final walkthrough at the end (see Section 5) instead of narrating every intermediate step in full detail.

## 5. Final Walkthrough
After all three subagents report back and fixes are applied, provide the participant with ONE clear summary covering:
* What was wrong with their Supabase data model / auth setup and how it was fixed.
* What was wrong or missing in their login/signup flow (including which edge cases — duplicate email, wrong password, etc. — are now properly handled) and what changed.
* Why Vercel was failing (or which key-naming mismatch was found) and the configuration added to fix it.
* Confirmation of which URL is their stable, shareable production link.
* Instructions to trigger a new deployment and test the live URL end-to-end: sign up, log out, log back in.
