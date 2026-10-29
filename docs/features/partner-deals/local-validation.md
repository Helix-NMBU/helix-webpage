# Local sponsor workflow validation

Run `npm run dev:member` and open the loopback URL printed by Vite. Sign in using the dedicated local member session. Create a partner and deal on Sponsor pipeline, add a current-season cash contribution and deliverable, and confirm the deal as Won. Open Partner agreements to inspect the deal and linked task progress. The local workspace contains the generated Finance and Business & Marketing project tasks. In the local access editor, grant the local member the Financials space to inspect the current-season secured cash contribution on Financing.

The local fixture stores its own fictional state in browser localStorage. Clearing site data removes it. Only the dedicated `member-local` development mode on a loopback origin can use it; a signed-out session cannot read or write it. A production build uses the authenticated server APIs instead.

The fixture simulates current-season task and funding records in one browser. Later-season invoice work is shown as planned; this fixture does not execute the scheduler. It does not exercise Neon, the actual transaction or duplicate-funding recovery, separate-user authorization, persistent server notifications, or provider delivery. Use the server-side integration tests and a properly configured isolated environment to verify those behavior paths.
