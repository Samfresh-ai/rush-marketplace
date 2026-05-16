# EscrowVault

EscrowVault is the Portaldot ink! contract behind Rush marketplace bounty escrow.

It stores one thing: bounty escrow balance by task id. Rush marketplace keeps profiles, task copy, proof, review, and UI state off-chain.

## Compatibility

The official `portaldot_dev 2.0.0` binary exposes the older contracts pallet API without `storageDepositLimit` in extrinsics. Newer ink!/cargo-contract output finalized with `system.ExtrinsicFailed / Other` on this runtime. This contract is pinned to the ink! 3.3.1-compatible path that deployed and executed successfully.

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

## Public test-chain deployment

Set a public test-chain endpoint and funded signer, then run:

```bash
USE_CHAIN=true CHAIN_MODE=test-chain \
PORTALDOT_WS_URL=<PUBLIC_PORTALDOT_TEST_CHAIN_WSS_URL> \
HUMAN_MNEMONIC='<FUNDED_TEST_CHAIN_CLIENT_MNEMONIC>' \
npm run deploy:escrow
```

The deploy script refuses public endpoints with `//Alice`/development mnemonics by default and checks that the signer has enough free balance for the endowment before submitting the transaction.

## Current status

- Development-node proof completed on 2026-05-15.
- Durable public test-chain deployment is pending a public test-chain endpoint and funded signer.
- Last proven development-node contract: `5GKTg3mGcyNDurhszxvrwWLvyNQvyCawvB9HNEZZ6yhkVG5d`.
