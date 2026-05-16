# EscrowVault

`EscrowVault` is the Portaldot escrow contract used by Rush Marketplace.

It has one job: hold native POT for a bounty and release it to the selected agent after the client approves payout. Everything else stays in Rush app state.

## What belongs in the contract

- locked bounty amount
- original client account
- released/not released state
- payout transfer to the winner

## What does not belong in the contract

- client profiles
- agent profiles or agent listings
- Gmail return access
- bounty descriptions
- proof links
- scores and review notes
- UI or activity feed state

That split keeps the contract small and makes escrow verification straightforward.

## Runtime compatibility

The official `portaldot_dev 2.0.0` binary uses the older contracts pallet API and does not expose newer `storageDepositLimit` transaction fields.

This contract is pinned to the ink! 3.3.1-compatible path because that artifact deployed and executed correctly on the Portaldot dev node. Newer ink! output failed on this runtime with `system.ExtrinsicFailed / Other` during earlier deployment tests.

## Build

```bash
PATH=/home/samfresh22/.openclaw/tools/binaryen-deb/root/usr/bin:$PATH \
RUSTUP_TOOLCHAIN=nightly-2025-01-01 \
/home/samfresh22/.openclaw/tools/cargo-contract-1.5.1/bin/cargo-contract contract build \
  --release --skip-linting --manifest-path contracts/escrow_vault/Cargo.toml -Z original-manifest
```

Expected artifacts:

- `target/ink/escrow_vault/escrow_vault.wasm`
- `target/ink/escrow_vault/metadata.json`
- `target/ink/escrow_vault/escrow_vault.contract`

## Deploy

For the local Portaldot dev node:

```bash
USE_CHAIN=true \
CHAIN_MODE=test-chain \
PORTALDOT_WS_URL=ws://127.0.0.1:9944 \
HUMAN_MNEMONIC='//Alice' \
PORTALDOT_CONTRACT_METADATA_PATH=target/ink/escrow_vault/metadata.json \
npm run deploy:escrow
```

The deploy script checks signer balance before deployment. It also refuses development mnemonics on public endpoints unless explicitly overridden.

## Current verified contract

Development-node proof completed on 2026-05-15:

```text
Contract:  5GKTg3mGcyNDurhszxvrwWLvyNQvyCawvB9HNEZZ6yhkVG5d
Deploy tx: 0x83b74e2ab0298aaf7c50f512e636b4436eb8ebbf3b47bc57fd9a780e76c42fee
Code hash: 0x76cf690b9ed4487a008b85ebf00ed422c203412acc4ac88d6ed02c2dff2751f0
```

If the dev node is reset, this address will no longer be valid. Redeploy and update `ESCROW_CONTRACT_ADDRESS`.

## Public testnet status

A public Portaldot testnet endpoint and faucet were not available in the official docs checked on 2026-05-16. Until one is available, Rush uses the official dev node as the test-chain target.
