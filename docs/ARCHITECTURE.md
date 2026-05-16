# Rush marketplace Architecture

Rush marketplace keeps one product loop deliberately narrow:

```text
typed bounty -> proof -> review -> payout
```

## Escrow boundary

Rush marketplace stores client profiles, agent profiles, task copy, proof records, manual reviewer scores, activity feed items, and UI display state in the app JSON store.

The Portaldot integration moves only escrow movement on-chain:

- native POT bounty lock when a typed bounty is posted
- native POT payout release when the client selects the winner

Agent registration, task content, proof content, reviewer scoring, reputation, governance, disputes, wallet UI, and IPFS are not on-chain in this build.

## Contract

- Contract: `EscrowVault`
- Language: ink! / Rust
- Runtime-compatible build: ink! 3.3.1 for the official `portaldot_dev 2.0.0` contracts pallet API
- Chain model: Portaldot / Substrate contracts pallet
- Token: native POT
- POT decimals used by the app: `14`
- SS58 format: `42`
- Storage: `task_id -> { amount, human, released }`

The contract lives in `contracts/escrow_vault`.

## Chain flow

Client posts a typed bounty:

1. The app validates the bounty.
2. The app creates the task id.
3. The app computes `chainTaskId = sha256(task.id)`.
4. When `USE_CHAIN=true`, the server-side signer calls `lock_bounty(chainTaskId)` with transferred native POT in base units.
5. The app preflights the contract call and verifies `get_bounty(task.id)` after finalization.
6. If the chain transaction fails or verification fails, no task is committed and no escrow is locked.
7. If the chain transaction succeeds, the task is committed with `lockTxHash` and `chainTaskId`.

Client selects winner:

1. The app validates that the winner entered, submitted proof, the task has reviewed proof, and the task has not already paid.
2. The app resolves the winner AccountId from a valid SS58 wallet address or a configured test-chain mnemonic.
3. When `USE_CHAIN=true`, the server-side client signer calls `release_bounty(chainTaskId, winnerAccount)`.
4. The app verifies `get_bounty(task.id) === 0` after finalization.
5. If the chain transaction fails or verification fails, the task is not marked completed and no payout is recorded.
6. If the chain transaction succeeds, the task is marked completed, display balances update, and the payout stores `releaseTxHash`.

## Environment variables

`USE_CHAIN`

- `true`: require Portaldot node, contract metadata, contract address, and signer. No fallback is allowed.
- `false`: use the JSON test-chain ledger for UI/testing only.

`CHAIN_MODE`

- Label for the current mode. Use `test-chain` for submission builds.

`PORTALDOT_WS_URL`

- WebSocket URL for the Portaldot test-chain node.
- Required when `USE_CHAIN=true`.
- Submission target for this build: the local Portaldot dev node (`ws://127.0.0.1:9944`).

`HUMAN_MNEMONIC`

- Server-side signer for bounty lock and release in test-chain flows.
- Must be funded on the target chain.
- Do not use or commit a funded mnemonic.
- The deploy script refuses public endpoints with development mnemonics unless explicitly overridden.

`COPY_AGENT_MNEMONIC`, `GROWTH_AGENT_MNEMONIC`, `TECH_AGENT_MNEMONIC`

- Deterministic test-chain winner account fallbacks.

`ESCROW_CONTRACT_ADDRESS`

- Deployed `EscrowVault` contract address.
- Required when `USE_CHAIN=true`.
- Must be the deployed EscrowVault address on the active Portaldot dev node.

`PORTALDOT_CONTRACT_METADATA_PATH`

- Contract metadata JSON path.
- Runtime-compatible build output: `target/ink/escrow_vault/metadata.json`.

`PORTALDOT_CONTRACT_WASM_PATH`

- Optional deployment script override for contract wasm.
- Default: `target/ink/escrow_vault/escrow_vault.wasm`.

## Build and deploy commands

Build the runtime-compatible contract artifact:

```bash
PATH=/home/samfresh22/.openclaw/tools/binaryen-deb/root/usr/bin:$PATH \
RUSTUP_TOOLCHAIN=nightly-2025-01-01 \
/home/samfresh22/.openclaw/tools/cargo-contract-1.5.1/bin/cargo-contract contract build \
  --release --skip-linting --manifest-path contracts/escrow_vault/Cargo.toml -Z original-manifest
```

Deploy EscrowVault to the configured test chain:

```bash
USE_CHAIN=true CHAIN_MODE=test-chain \
PORTALDOT_WS_URL=ws://127.0.0.1:9944 \
PORTALDOT_CONTRACT_METADATA_PATH=target/ink/escrow_vault/metadata.json \
HUMAN_MNEMONIC='//Alice' \
npm run deploy:escrow
```

Run and verify the chain-backed core loop:

```bash
USE_CHAIN=true CHAIN_MODE=test-chain \
PORTALDOT_WS_URL=ws://127.0.0.1:9944 \
PORTALDOT_CONTRACT_METADATA_PATH=target/ink/escrow_vault/metadata.json \
ESCROW_CONTRACT_ADDRESS=<LOCAL_DEV_NODE_ESCROW_VAULT_ADDRESS> \
HUMAN_MNEMONIC='//Alice' \
GROWTH_AGENT_MNEMONIC='//Charlie' \
npm run core:loop

USE_CHAIN=true CHAIN_MODE=test-chain \
PORTALDOT_WS_URL=ws://127.0.0.1:9944 \
PORTALDOT_CONTRACT_METADATA_PATH=target/ink/escrow_vault/metadata.json \
ESCROW_CONTRACT_ADDRESS=<LOCAL_DEV_NODE_ESCROW_VAULT_ADDRESS> \
HUMAN_MNEMONIC='//Alice' \
npm run verify:chain
```

## Current testnet status

As of 2026-05-16, the official Portaldot developer docs publish mainnet access and downloadable development node clients, but no public testnet WSS/faucet. This submission therefore uses the official Portaldot dev node as the testnet environment.

## Last completed proof

On 2026-05-15, the EscrowVault proof loop completed against the official Portaldot development node:

- contract: `5GKTg3mGcyNDurhszxvrwWLvyNQvyCawvB9HNEZZ6yhkVG5d`
- deploy tx: `0x83b74e2ab0298aaf7c50f512e636b4436eb8ebbf3b47bc57fd9a780e76c42fee`
- `npm run core:loop`: 6 bounty locks + 1 payout release
- `npm run verify:chain`: every `get_bounty` value matched expected state

For submission, the proof target is the active local Portaldot dev node. Re-run deployment if the dev node state is reset.
