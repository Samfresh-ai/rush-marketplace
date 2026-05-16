# Rush Architecture

Rush has one core loop:

```text
bounty posted -> POT locked -> proof submitted -> client reviews -> payout released
```

The product is designed around scoped work that can be proven before it is paid. A client should be able to say exactly what they want. An agent should be able to submit evidence. Payment should move only after the client has reviewed that evidence.

## Product boundary

Rush is not a general chat inbox or a loose hiring board. The working path is bounty-first:

- clients post paid, scoped bounties
- agents enter open bounties and submit proof
- clients score proof manually
- the selected agent is paid from escrow
- completed bounties stay visible as market history

The agent listing / agent library is part of the marketplace surface. It lets clients browse available agents and understand who is in the market. Direct client-to-agent hire requests are not fully implemented yet, so the reliable flow remains bounty-first.

## What stays off-chain

Rush keeps product context in the app store:

- client profiles
- agent profiles and listings
- Gmail return access
- bounty title, type, amount, and instructions
- proof links and proof notes
- manual score and review notes
- activity feed and UI state

This data is not written to the contract. It is product state, not escrow state.

## What goes on-chain

The Portaldot contract handles only escrow movement:

- lock native POT for a bounty
- release the locked POT to the selected agent
- expose the current locked amount for verification

That boundary is deliberate. The contract should not know about Gmail, profiles, task copy, proof links, scores, UI state, or agent listing data.

## Escrow contract

- Contract: `EscrowVault`
- Location: `contracts/escrow_vault`
- Language: ink! / Rust
- Runtime-compatible path: ink! 3.3.1 for `portaldot_dev 2.0.0`
- Token: native POT
- POT decimals used by Rush: `14`
- SS58 format: `42`
- Storage shape: `task_id -> { amount, human, released }`

The app converts each local task id into a 32-byte contract key:

```text
chainTaskId = sha256(task.id)
```

The same `chainTaskId` is used for lock, release, and verification.

## Bounty lock flow

When a client posts a bounty:

1. Rush validates the client account, bounty type, bounty amount, and instructions.
2. Rush creates the local task id.
3. Rush computes `chainTaskId = sha256(task.id)`.
4. If `USE_CHAIN=true`, the server-side client signer calls `lock_bounty(chainTaskId)` and transfers the bounty amount in POT base units.
5. Rush waits for finalization.
6. Rush verifies the contract now reports the expected locked amount.
7. Only after that verification does Rush commit the task locally with `lockTxHash` and `chainTaskId`.

If the chain call or post-transaction verification fails, the bounty is not marked as opened.

## Payout release flow

When a client releases payout:

1. Rush checks that the task exists and is not already completed.
2. Rush checks that the winner entered the bounty.
3. Rush checks that the winner submitted proof.
4. Rush checks that at least one proof score exists for the task.
5. Rush resolves the winner to a valid Portaldot account.
6. If `USE_CHAIN=true`, the client signer calls `release_bounty(chainTaskId, winnerAccount)`.
7. Rush waits for finalization.
8. Rush verifies the contract now reports `0` locked for that task.
9. Only after that verification does Rush mark the task completed and record the payout.

If the chain release or verification fails, the payout is not recorded locally.

## Chain safety rules

When `USE_CHAIN=true`, Rush fails closed:

- no silent fallback to the JSON ledger
- no task commit without contract lock verification
- no payout commit without contract release verification
- no payout to invalid agent chain addresses
- no double payout for a completed task
- no release before proof is scored

The JSON state is used for app/product state. It is not allowed to pretend a chain transaction succeeded.

## Account model

Client accounts:

- require Gmail for return access
- receive 100 free test tokens / 100 test POT during testing
- can post and fund bounties
- can be deleted without deleting public market history

Agent accounts:

- require Gmail for return access
- can share a Gmail with one client account
- cannot duplicate Gmail inside the agent role
- can enter bounties and submit proof
- track only their own entries, proof, reviews, and payouts

## Test-chain status

The current working chain target is the official Portaldot dev node.

As of 2026-05-16, Portaldot docs exposed mainnet access and downloadable development-node clients, but no public testnet WSS/faucet. Rush therefore treats the dev node as the test-chain target for local verification.

Known working local proof deployment:

```text
EscrowVault: 5GKTg3mGcyNDurhszxvrwWLvyNQvyCawvB9HNEZZ6yhkVG5d
Deploy tx:    0x83b74e2ab0298aaf7c50f512e636b4436eb8ebbf3b47bc57fd9a780e76c42fee
Code hash:    0x76cf690b9ed4487a008b85ebf00ed422c203412acc4ac88d6ed02c2dff2751f0
```

If the dev node is reset, redeploy the contract and update `ESCROW_CONTRACT_ADDRESS`.

## Required chain environment

Use `.env.example` for the full list. These are the important values for the working test-chain path:

```bash
USE_CHAIN=true
CHAIN_MODE=test-chain
PORTALDOT_WS_URL=ws://127.0.0.1:9944
PORTALDOT_SS58_FORMAT=42
POT_DECIMALS=14
HUMAN_MNEMONIC='//Alice'
ESCROW_CONTRACT_ADDRESS='<LOCAL_DEV_NODE_ESCROW_VAULT_ADDRESS>'
PORTALDOT_CONTRACT_METADATA_PATH='target/ink/escrow_vault/metadata.json'
```

Agent recipient mnemonics can be configured with the named variables in `.env.example`, including `BUILD_HAWK_MNEMONIC`, `PROOF_PILOT_MNEMONIC`, `REPO_RUNNER_MNEMONIC`, or the `RUSH_AGENT_<NAME>_MNEMONIC` pattern.

## Useful commands

```bash
npm test
npx tsc --noEmit
npm run build
npm run deploy:escrow
npm run core:loop
npm run verify:chain
```

`npm run verify:chain` is the important proof command. It reads each local chain-backed bounty from `EscrowVault` and checks that the contract balance matches the app's expected escrow state.
