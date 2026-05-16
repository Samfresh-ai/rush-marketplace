# EscrowVault Contract API

`EscrowVault` is the only on-chain contract Rush uses. It does not run the marketplace. It only holds and releases bounty escrow.

Rush keeps profiles, bounty text, proof, scores, agent listings, and UI state off-chain. The contract keeps the money movement small and auditable.

## Compatibility

The official `portaldot_dev 2.0.0` node exposes the older contracts pallet API:

```text
contracts.instantiateWithCode(endowment, gasLimit, code, data, salt)
contracts.call(dest, value, gasLimit, data)
```

Newer ink! output expects newer contracts fields such as `storageDepositLimit`, which this runtime does not expose. Rush therefore builds `EscrowVault` through the proven ink! 3.3.1-compatible path.

Known working artifact details:

- metadata: `target/ink/escrow_vault/metadata.json`
- wasm: `target/ink/escrow_vault/escrow_vault.wasm`
- bundle: `target/ink/escrow_vault/escrow_vault.contract`
- code hash: `0x76cf690b9ed4487a008b85ebf00ed422c203412acc4ac88d6ed02c2dff2751f0`

## Storage

```text
Mapping<[u8; 32], Bounty>

Bounty {
  amount: Balance
  human: AccountId
  released: bool
}
```

The key is `sha256(task.id)`, where `task.id` is the exact local task id string.

## Messages

### `lock_bounty(task_id: [u8; 32])` payable

Locks the transferred native POT for one bounty.

Rules:

- transferred value must be greater than zero
- task id must not already be locked
- caller becomes the human/client owner for that escrow record
- stored record is `{ amount, human, released: false }`

Errors:

- `ZeroBounty`
- `TaskAlreadyLocked`

Rush records the finalized lock transaction hash as `lockTxHash` only after the app verifies the locked amount on-chain.

### `release_bounty(task_id: [u8; 32], winner: AccountId)`

Releases the full locked amount to the selected winner.

Rules:

- bounty must exist
- bounty must not already be released
- caller must be the same account that locked the bounty
- winner must be a valid non-zero account
- transfer must succeed
- bounty is marked released only after transfer succeeds

Errors:

- `TaskNotFound`
- `AlreadyReleased`
- `Unauthorized`
- `ZeroWinner`
- `TransferFailed`

Rush records the finalized release transaction hash as `releaseTxHash` only after the app verifies the contract now reports zero locked for that task.

### `get_bounty(task_id: [u8; 32]) -> Balance`

Returns the currently locked amount for a task.

Rules:

- returns the locked amount while the bounty is active
- returns `0` if the task does not exist
- returns `0` after release

Rush uses this as the contract verification read for both lock and release.

## Task id hashing

The app uses ids like `task_...`. The contract requires `[u8; 32]`.

```text
chainTaskId = sha256(task.id)
```

The conversion is deterministic and reused everywhere. Random chain ids are never used.

## POT units

Rush displays POT as whole test tokens and converts to base units before contract calls.

```text
1 POT = 10^14 base units
25 POT = 25 * 10^14 base units
```

The app rejects invalid, non-finite, non-positive, or non-integer bounty amounts before trying to lock escrow.

## App-side guarantees

Before lock:

- client exists
- bounty amount is valid
- bounty type is supported
- contract call is preflighted when chain mode is enabled

Before release:

- winner entered the bounty
- winner submitted proof
- proof has been manually scored
- winner has a valid Portaldot account
- task has not already been paid

After each chain write, Rush reads the contract back before committing the local state change.

## Deployment status

- Development-node proof completed on 2026-05-15.
- Known working local contract: `5GKTg3mGcyNDurhszxvrwWLvyNQvyCawvB9HNEZZ6yhkVG5d`.
- Public Portaldot testnet WSS/faucet was not available in the docs checked on 2026-05-16.
- Current verification target is the official Portaldot dev node.
- The deploy script refuses public endpoints with development mnemonics by default and fails fast when the signer is unfunded.
