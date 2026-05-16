import { runCoreLoop } from "../lib/core";
import { disconnectPortaldotApi, isChainEnabled } from "../lib/chain";

function findBalance(state: Awaited<ReturnType<typeof runCoreLoop>>, name: string): number {
  const human = state.humans.find((candidate) => candidate.name === name);
  if (human) {
    return human.balancePot;
  }

  const agent = state.agents.find((candidate) => candidate.name === name);
  if (agent) {
    return agent.balancePot;
  }

  throw new Error(`${name} not found.`);
}

function verify(label: string, actual: number, expected: number): string {
  if (actual !== expected) {
    throw new Error(`${label} expected ${expected} POT, received ${actual} POT.`);
  }

  return `${label}: ${String(actual).padStart(5, " ")} POT  ✓`;
}

async function main() {
  console.log("1. Reset state");
  console.log("2. Register client account (100 POT)");
  console.log("3. Register reference agents: GrowthAgent, BuildHawk, ProofPilot, VideoForge, DocSmith, RepoRunner");
  console.log("4. Client account posts 6 typed test-chain bounties");
  console.log("5. Agents enter bounties, submit proof, and get reviewed");
  console.log("6. Launch Thread pays GrowthAgent while other bounties remain open/in review");

  const state = await runCoreLoop();

  const clientAccount = findBalance(state, "Client Account");
  const growthAgent = findBalance(state, "GrowthAgent");
  const escrow = state.escrow.escrowBalancePot;

  console.log("");
  console.log("PRINT AND VERIFY:");
  console.log(verify("Client      ", clientAccount, 42));
  console.log(verify("Escrow      ", escrow, 46));
  console.log(verify("GrowthAgent ", growthAgent, 12));
  console.log(`Tasks: ${state.tasks.length}`);
  console.log(`Proof records: ${state.submissions.length}`);
  console.log(`Events: ${state.events.length}`);

  if (isChainEnabled()) {
    const locked = state.tasks.filter((task) => task.lockTxHash);
    const released = state.payouts.filter((payout) => payout.releaseTxHash);
    console.log("");
    console.log("CHAIN TRANSACTIONS:");
    for (const task of locked) {
      console.log(`${task.title} chainTaskId: ${task.chainTaskId}`);
      console.log(`${task.title} lock tx: ${task.lockTxHash}`);
      const event = state.events.find((candidate) => candidate.txHash === task.lockTxHash);
      if (event?.explorerUrl) {
        console.log(`${task.title} explorer: ${event.explorerUrl}`);
      }
    }
    for (const payout of released) {
      const task = state.tasks.find((candidate) => candidate.id === payout.taskId);
      console.log(`${task?.title ?? payout.taskId} release tx: ${payout.releaseTxHash}`);
      const event = state.events.find((candidate) => candidate.txHash === payout.releaseTxHash);
      if (event?.explorerUrl) {
        console.log(`${task?.title ?? payout.taskId} explorer: ${event.explorerUrl}`);
      }
    }
  }
}

main()
  .then(async () => {
    if (isChainEnabled()) {
      await disconnectPortaldotApi();
    }
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    if (isChainEnabled()) {
      await disconnectPortaldotApi();
    }
    process.exit(1);
  });
