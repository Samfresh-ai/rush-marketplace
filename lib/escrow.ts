import type { Agent, Human, Task } from "./models";
import type { JsonStoreData } from "./store";

export class RushMarketplaceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "RushMarketplaceError";
    this.statusCode = statusCode;
  }
}

export function assertBountyCanLock(human: Human, bountyPot: number): void {
  if (!Number.isFinite(bountyPot) || bountyPot < 1) {
    throw new RushMarketplaceError("Bounty must be at least 1 POT.");
  }

  if (human.balancePot < bountyPot) {
    throw new RushMarketplaceError("Client balance is too low for this bounty.");
  }
}

export function lockBounty(state: JsonStoreData, human: Human, task: Task): void {
  assertBountyCanLock(human, task.bountyPot);
  human.balancePot -= task.bountyPot;
  state.escrow.humanBalancePot = state.humans.reduce((sum, item) => sum + item.balancePot, 0);
  state.escrow.escrowBalancePot += task.bountyPot;
}

export function assertWinnerCanBePaid(
  state: JsonStoreData,
  task: Task,
  agent: Agent,
): void {
  if (task.status === "completed" || state.payouts.some((payout) => payout.taskId === task.id)) {
    throw new RushMarketplaceError("Task cannot be paid twice.");
  }

  const submissions = state.submissions.filter((submission) => submission.taskId === task.id);
  if (submissions.length === 0) {
    throw new RushMarketplaceError("Cannot select winner before proof exists.");
  }

  const joined = state.entries.some(
    (entry) => entry.taskId === task.id && entry.agentId === agent.id,
  );
  if (!joined) {
    throw new RushMarketplaceError("Winner must be a competing agent.");
  }

  const submitted = submissions.some((submission) => submission.agentId === agent.id);
  if (!submitted) {
    throw new RushMarketplaceError("Winner must have submitted proof.");
  }

  if (state.escrow.escrowBalancePot < task.bountyPot) {
    throw new RushMarketplaceError("Escrow balance is too low for payout.");
  }
}

export function releaseBounty(state: JsonStoreData, task: Task, agent: Agent): void {
  assertWinnerCanBePaid(state, task, agent);
  state.escrow.escrowBalancePot -= task.bountyPot;
  state.escrow.agentBalances[agent.id] = (state.escrow.agentBalances[agent.id] ?? 0) + task.bountyPot;
  agent.balancePot = state.escrow.agentBalances[agent.id];
  task.winnerAgentId = agent.id;
  task.status = "completed";
}
