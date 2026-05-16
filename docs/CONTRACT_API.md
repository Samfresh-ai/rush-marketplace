# EscrowVault Contract API

`EscrowVault` is the only on-chain contract used by Rush marketplace escrow. It stores bounty escrow state only.

## Portaldot compatibility note

The official `portaldot_dev 2.0.0` node exposes the older contracts pallet API:

```text
contracts.instantiateWithCode(endowment, gasLimit, code, data, salt)
contracts.call(dest, value, gasLimit, data)
```

So this repo builds `EscrowVault` with the runtime-compatible ink! 3.3.1 artifact path, not the newer ink! metadata path that expects `storageDepositLimit`.

Current artifact paths:

- metadata: `target/ink/escrow_vault/metadata.json`
- wasm: `target/ink/escrow_vault/escrow_vault.wasm`
- bundle: `target/ink/escrow_vault/escrow_vault.contract`
- known working code hash: `0x76cf690b9ed4487a008b85ebf00ed422c203412acc4ac88d6ed02c2dff2751f0`

## Storage

```text
Mapping<[u8; 32], Bounty>

Bounty {
  amount: Balance
  human: AccountId
  released: bool
}
```

## Messages

### `lock_bounty(task_id: [u8; 32])` payable

Locks the transferred native POT for one task.

Rules:

- `transferred_value` must be greater than 0.
- `task_id` must not already be locked.
- Stores `{ amount, human, released: false }`.
- The app records the finalized extrinsic hash.

Errors:

- `ZeroBounty`
- `TaskAlreadyLocked`

### `release_bounty(task_id: [u8; 32], winner: AccountId)`

Releases the full locked amount to the winner.

Rules:

- Task must exist.
- Bounty must not already be released.
- Caller must be the original account that locked the bounty.
- Winner must not be the zero/default account.
- Transfer must succeed.
- The bounty is marked released only after the transfer succeeds.
- The app records the finalized extrinsic hash.

Errors:

- `TaskNotFound`
- `AlreadyReleased`
- `Unauthorized`
- `ZeroWinner`
- `TransferFailed`

### `get_bounty(task_id: [u8; 32]) -> Balance`

Returns the currently locked amount.

Rules:

- Returns locked amount if task exists and is not released.
- Returns `0` if task is missing.
- Returns `0` after release.

## Task ID hashing

The app uses task ids like `task_...`. The contract requires `[u8; 32]`.

```text
chainTaskId = sha256(task.id)
```

- Input is the exact task id string.
- Output is exactly 32 bytes.
- Display form is `0x`-prefixed hex.
- The same conversion is used for lock and release.
- Random chain ids are never used.

## POT unit conversion

Rush marketplace uses 14 POT decimals.

```text
1 POT = 10^14 base units
50 POT = 50 * 10^14 base units
```

The app rejects non-integer or invalid POT amounts before chain calls and sends base-unit integer strings to the contract transaction layer.

## Deployment status

- Development-node proof completed on 2026-05-15.
- Official public Portaldot testnet WSS/faucet was not available in the docs checked on 2026-05-16.
- Submission verification uses the official Portaldot dev node as the testnet environment.
- The deployment script fails fast if the signer is unfunded or a development mnemonic is used against a public endpoint.
