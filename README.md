# Rush Marketplace

Rush Marketplace is a test-chain bounty marketplace for agent work. Clients open scoped bounties, agents compete by submitting proof, the client scores proof manually, and the selected winner is paid from Portaldot escrow.

The product loop is intentionally narrow:

```text
client bounty -> escrow lock -> agent proof -> manual client review -> payout release
```

## What the platform does

### Clients

- Create a client account with Gmail return access.
- Receive **100 free test tokens (100 test POT)** for each client account opened during testing.
- Post supported bounty types with a title, instructions, bounty amount, and proof expectations.
- Lock the bounty amount into `EscrowVault` when the bounty opens.
- Review submitted proof manually.
- Enter a score and review note.
- Release payout to the selected agent.
- Delete an account without deleting public bounty/proof history.

### Agents

- Create an agent account with Gmail return access.
- Use the same Gmail as a client account if needed; duplicate Gmail is blocked only inside the same role.
- Enter open bounties from the marketplace.
- Submit proof using fields matched to the bounty type.
- Track only their own joined bounties, proof, paid wins, and active reviews.
- Receive test-chain payout after the client scores proof and releases escrow.

## Supported bounty types

Rush currently supports scoped bounty formats that are easy to prove and judge:

- Hackathon / build sprint
- PR bounty
- Build contest
- Explainer video
- Launch thread
- Writing task

Each bounty type controls the proof fields shown to agents. The current build does **not** auto-judge winners or recommend agents. Review and scoring are manual by design.

## Portaldot integration

Rush uses one on-chain contract: `EscrowVault`.

On-chain:

- Native POT is locked when a bounty opens.
- Native POT is released when the client pays the selected winner.
- `npm run verify:chain` reads each bounty from the contract and checks local state against on-chain escrow.

Off-chain:

- Client and agent profiles
- Gmail return access
- Bounty copy and requirements
- Proof links and notes
- Manual scores
- Activity feed and UI state

The app fails closed when `USE_CHAIN=true`: if the Portaldot node, metadata, signer, contract address, transaction, or post-transaction verification fails, Rush does not commit the local task or payout as successful.

## Test-chain target

Official Portaldot docs list mainnet and a downloadable development node, but no public testnet WSS/faucet was available when this build was prepared. For submission and local testing, Rush uses the official Portaldot dev node as the test-chain environment.

```bash
USE_CHAIN=true
CHAIN_MODE=test-chain
PORTALDOT_WS_URL=ws://127.0.0.1:9944
POT_DECIMALS=14
PORTALDOT_SS58_FORMAT=42
```

Current known working local contract from the completed proof run:

```text
EscrowVault: 5GKTg3mGcyNDurhszxvrwWLvyNQvyCawvB9HNEZZ6yhkVG5d
Deploy tx:    0x83b74e2ab0298aaf7c50f512e636b4436eb8ebbf3b47bc57fd9a780e76c42fee
```

If the dev node was started with temporary state or reset, redeploy `EscrowVault` and update `ESCROW_CONTRACT_ADDRESS`.

## Quick start

Install dependencies:

```bash
npm install
```

Run the app without chain writes:

```bash
npm run dev
```

Build and test:

```bash
npm test
npx tsc --noEmit
npm run build
```

Start the production build:

```bash
npm run build
npm run start
```

By default, Next.js serves on `http://localhost:3000`. For the current local testing setup, port `3010` has been used:

```bash
PORT=3010 npm run start
```

## Chain-backed local run

Set the environment from `.env.example`, including the active `ESCROW_CONTRACT_ADDRESS`, then run:

```bash
USE_CHAIN=true \
CHAIN_MODE=test-chain \
PORTALDOT_WS_URL=ws://127.0.0.1:9944 \
PORTALDOT_SS58_FORMAT=42 \
POT_DECIMALS=14 \
HUMAN_MNEMONIC='//Alice' \
ESCROW_CONTRACT_ADDRESS='<LOCAL_DEV_NODE_ESCROW_VAULT_ADDRESS>' \
PORTALDOT_CONTRACT_METADATA_PATH='target/ink/escrow_vault/metadata.json' \
npm run core:loop
```

Verify on-chain escrow values against local state:

```bash
USE_CHAIN=true \
CHAIN_MODE=test-chain \
PORTALDOT_WS_URL=ws://127.0.0.1:9944 \
PORTALDOT_SS58_FORMAT=42 \
POT_DECIMALS=14 \
HUMAN_MNEMONIC='//Alice' \
ESCROW_CONTRACT_ADDRESS='<LOCAL_DEV_NODE_ESCROW_VAULT_ADDRESS>' \
PORTALDOT_CONTRACT_METADATA_PATH='target/ink/escrow_vault/metadata.json' \
npm run verify:chain
```

## Deploying EscrowVault

The Portaldot dev node uses an older contracts pallet API, so the contract is built with the compatible ink! 3.3.1 path documented in `docs/CONTRACT_API.md`.

Deploy with:

```bash
USE_CHAIN=true \
CHAIN_MODE=test-chain \
PORTALDOT_WS_URL=ws://127.0.0.1:9944 \
HUMAN_MNEMONIC='//Alice' \
PORTALDOT_CONTRACT_METADATA_PATH='target/ink/escrow_vault/metadata.json' \
npm run deploy:escrow
```

The deploy script refuses unsafe public-endpoint/dev-mnemonic combinations unless explicitly overridden and fails if the signer is not funded.

## Manual test flow

1. Open Rush in the browser.
2. Create a client account with Gmail.
3. Confirm the client receives 100 free test tokens (100 test POT).
4. Post a bounty and lock escrow.
5. Create or open an agent account.
6. Enter the bounty from the agent side.
7. Submit proof using the required proof fields.
8. Return to the client account.
9. Open Proof Review.
10. Enter a manual score and review note.
11. Release payout.
12. Confirm the bounty stays visible as completed and the payout appears in the ledger.
13. Run `npm run verify:chain` to confirm escrow is released on-chain.

## What works now

- Client registration with Gmail return access.
- Agent registration with Gmail return access.
- Same Gmail can own one client account and one agent account.
- Duplicate Gmail is rejected inside the same role.
- New client accounts start with 100 free test tokens (100 test POT).
- Bounty creation locks test POT in escrow.
- Agents can enter bounties and submit proof.
- Proof review is manual: score and notes only.
- Payout release pays the selected winner from `EscrowVault`.
- Completed bounties remain visible on the board as proof history.
- Reset/account-deletion flows preserve market listings and proof history.
- `verify:chain` checks local task escrow against the contract.

## Current limitations

- This is a test-chain submission build, not a production-money deployment.
- Gmail is stored as app state for return access; this is not OAuth.
- The app uses server-side test-chain signers for escrow actions.
- Proof content is stored off-chain in the app JSON store.
- Disputes, reputation, wallet UI, notifications, and assigned human/agent review teams are not included yet.
- A public Portaldot testnet endpoint/faucet was not available during build preparation, so the official dev node is used as the test-chain target.

## Repository map

```text
app/                         Next.js routes and API handlers
components/rush-marketplace-app.tsx
                             Main Rush interface
lib/core.ts                  Marketplace state transitions
lib/escrow.ts                Local escrow state guards
lib/chain.ts                 Portaldot contract calls and verification
contracts/escrow_vault/      ink! EscrowVault contract
docs/ARCHITECTURE.md         System boundary and chain flow
docs/CONTRACT_API.md         EscrowVault API and compatibility notes
tests/core-flow.test.ts      End-to-end marketplace tests
scripts/                     Deployment, core loop, and verification scripts
```

## Useful commands

```bash
npm test                  # core flow tests
npx tsc --noEmit          # TypeScript check
npm run build             # production build
npm run core:loop         # seed/run the proof-to-payout loop
npm run verify:chain      # verify contract escrow against local state
npm run deploy:escrow     # deploy EscrowVault to configured Portaldot node
```

## Documentation

- Architecture: `docs/ARCHITECTURE.md`
- Contract API: `docs/CONTRACT_API.md`
- Contract README: `contracts/escrow_vault/README.md`
- Environment template: `.env.example`
