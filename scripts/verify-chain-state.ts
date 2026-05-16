import { disconnectPortaldotApi, getBountyOnChain, isChainEnabled, potToBaseUnits } from "../lib/chain";
import { getState } from "../lib/core";

async function main(): Promise<void> {
  if (!isChainEnabled()) {
    throw new Error("USE_CHAIN=true is required for chain state verification.");
  }

  const state = await getState();
  const rows = [];
  for (const task of state.tasks) {
    if (!task.lockTxHash || !task.chainTaskId) {
      throw new Error(`Task ${task.title} is missing lockTxHash or chainTaskId.`);
    }

    const payout = state.payouts.find((candidate) => candidate.taskId === task.id);
    const expected = payout ? 0n : potToBaseUnits(task.bountyPot);
    const actual = await getBountyOnChain(task.id);
    const matches = actual === expected;
    rows.push({
      title: task.title,
      status: task.status,
      bountyPot: task.bountyPot,
      chainTaskId: task.chainTaskId,
      lockTxHash: task.lockTxHash,
      releaseTxHash: payout?.releaseTxHash,
      expectedBaseUnits: expected.toString(),
      onChainBaseUnits: actual.toString(),
      matches,
    });

    if (!matches) {
      throw new Error(
        `On-chain escrow mismatch for ${task.title}: expected ${expected.toString()}, got ${actual.toString()}.`,
      );
    }
  }

  const paidPayouts = state.payouts.filter((payout) => payout.releaseTxHash);
  if (paidPayouts.length !== state.payouts.length) {
    throw new Error("Every payout must have a releaseTxHash in USE_CHAIN=true mode.");
  }

  console.log(JSON.stringify(rows, null, 2));
}

main()
  .then(async () => {
    await disconnectPortaldotApi();
  })
  .catch(async (error: unknown) => {
    await disconnectPortaldotApi();
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
