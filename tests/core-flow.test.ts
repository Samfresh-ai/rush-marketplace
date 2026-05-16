import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import { decodeAddress } from "@polkadot/util-crypto";

import {
  createTask,
  deleteAccount,
  joinTask,
  loginWithGmail,
  registerAgent,
  registerHuman,
  resetPersonalStatePreservingMarket,
  resetTestState,
  runCoreLoop,
  scoreSubmission,
  selectWinner,
  submitWork,
  updateAccountGmail,
} from "../lib/core";
import { resolveWinnerAccount } from "../lib/chain";
import { readState, writeState } from "../lib/store";

const chainEnvKeys = ["USE_CHAIN", "CHAIN_MODE", "PORTALDOT_WS_URL", "PORTALDOT_SS58_FORMAT"] as const;

async function withLocalChainEnv<T>(callback: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>(
    chainEnvKeys.map((key) => [key, process.env[key]]),
  );
  process.env.USE_CHAIN = "true";
  process.env.CHAIN_MODE = "test-chain";
  process.env.PORTALDOT_WS_URL = "ws://127.0.0.1:9944";
  process.env.PORTALDOT_SS58_FORMAT = "42";

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function humanAndAgent() {
  await resetTestState();
  const human = await registerHuman({ name: "Client Account", gmail: `client.${randomUUID()}@gmail.com` });
  const agent = await registerAgent({
    name: "CopyAgent",
    gmail: `copy.${randomUUID()}@gmail.com`,
    skills: ["copywriting"],
    description: "Writes concise marketplace copy.",
  });
  return { human, agent };
}

describe("Rush marketplace core flow", () => {
  test("Client can register", async () => {
    await resetTestState();
    const human = await registerHuman({ name: "Client Account", gmail: `client.${randomUUID()}@gmail.com` });
    assert.equal(human.name, "Client Account");
    assert.equal(human.balancePot, 100);

    const state = await readState();
    assert.equal(state.humans.length, 1);
    assert.equal(state.escrow.humanBalancePot, 100);
  });

  test("New clients create their own account instead of reusing seeded profiles", async () => {
    await resetTestState();
    const first = await registerHuman({ name: "Client Account", gmail: `client.${randomUUID()}@gmail.com` });
    const second = await registerHuman({ name: "Fresh Builder", gmail: `fresh.${randomUUID()}@gmail.com` });

    const state = await readState();
    assert.notEqual(first.id, second.id);
    assert.equal(state.humans.length, 2);
    assert.equal(state.humans[1].name, "Fresh Builder");
    assert.equal(state.escrow.humanBalancePot, 200);
  });

  test("Account Gmail can be added and must be Gmail", async () => {
    await resetTestState();
    const human = await registerHuman({ name: "Milli", gmail: `milli.${randomUUID()}@gmail.com` });

    await assert.rejects(
      () => updateAccountGmail({ role: "human", id: human.id, gmail: "milli@example.com" }),
      /@gmail.com/,
    );

    const updated = await updateAccountGmail({
      role: "human",
      id: human.id,
      gmail: "milli@gmail.com",
    });
    assert.equal(updated.gmail, "milli@gmail.com");

    const session = await loginWithGmail({ gmail: "milli@gmail.com" });
    assert.equal(session.role, "human");
    assert.equal(session.id, human.id);
  });

  test("Same Gmail can belong to one client and one agent", async () => {
    await resetTestState();
    const gmail = `milli.${randomUUID()}@gmail.com`;
    const human = await registerHuman({ name: "Milli", gmail });
    const agent = await registerAgent({
      name: "MilliAgent",
      gmail,
      skills: ["build", "proof"],
      description: "Competes on posted bounties.",
    });

    await assert.rejects(
      () => registerHuman({ name: "Milli Two", gmail }),
      /client account/,
    );
    await assert.rejects(
      () =>
        registerAgent({
          name: "MilliAgentTwo",
          gmail,
          skills: ["qa"],
          description: "Second agent with duplicate Gmail.",
        }),
      /agent account/,
    );

    const clientSession = await loginWithGmail({ gmail, role: "human" });
    const agentSession = await loginWithGmail({ gmail, role: "agent" });
    assert.deepEqual(clientSession, { role: "human", id: human.id, name: human.name });
    assert.deepEqual(agentSession, { role: "agent", id: agent.id, name: agent.name });
    await assert.rejects(
      () => loginWithGmail({ gmail }),
      /Choose which one/,
    );
  });

  test("Deleting a client account preserves posted bounties under market owner", async () => {
    await resetTestState();
    const human = await registerHuman({ name: "Milli", gmail: `milli.${randomUUID()}@gmail.com` });
    const task = await createTask({
      createdByHumanId: human.id,
      title: "Build a payments screen",
      description: "Ship the working proof.",
      bountyPot: 25,
      bountyType: "hackathon",
    });

    await deleteAccount({ role: "human", id: human.id });
    const state = await readState();
    assert.equal(state.humans.filter((item) => !item.system).length, 0);
    assert.equal(
      state.tasks.find((candidate) => candidate.id === task.id)?.createdByHumanId,
      "human_rush_market",
    );
  });

  test("Agent can register", async () => {
    await resetTestState();
    const agent = await registerAgent({
      name: "CopyAgent",
      gmail: `copy.${randomUUID()}@gmail.com`,
      skills: ["copywriting"],
      description: "Writes concise marketplace copy.",
    });
    assert.equal(agent.name, "CopyAgent");
    assert.equal(agent.balancePot, 0);

    const state = await readState();
    assert.equal(state.agents.length, 1);
    assert.equal(state.escrow.agentBalances[agent.id], 0);
  });

  test("Test-chain agent registration uses payable chain addresses", async () => {
    await withLocalChainEnv(async () => {
      await resetTestState();
      const agent = await registerAgent({
        name: "BuildHawk",
        gmail: `buildhawk.${randomUUID()}@gmail.com`,
        skills: ["react", "github"],
        description: "Ships product fixes with proof.",
      });

      assert.doesNotThrow(() => decodeAddress(agent.wallet));
      assert.equal(await resolveWinnerAccount(agent), agent.wallet);
      await assert.doesNotReject(() => resolveWinnerAccount({ ...agent, wallet: "pot_buildhawk" }));
      await assert.rejects(
        () =>
          registerAgent({
            name: "BadWalletAgent",
            gmail: `bad.${randomUUID()}@gmail.com`,
            wallet: "pot_bad_wallet",
            skills: ["qa"],
            description: "Tests invalid wallet handling.",
          }),
        /valid Portaldot chain address/,
      );
    });
  });

  test("Client can post task and bounty locks in escrow", async () => {
    const { human } = await humanAndAgent();
    const task = await createTask({
      createdByHumanId: human.id,
      title: "Write a landing page headline for Rush",
      description: "Create a sharp headline.",
      bountyPot: 50,
      bountyType: "thread_contest",
    });

    const state = await readState();
    assert.equal(task.status, "open");
    assert.equal(state.humans[0].balancePot, 50);
    assert.equal(state.escrow.humanBalancePot, 50);
    assert.equal(state.escrow.escrowBalancePot, 50);
  });

  test("Agent can join task", async () => {
    const { human, agent } = await humanAndAgent();
    const task = await createTask({
      createdByHumanId: human.id,
      title: "Write a headline",
      description: "Create a sharp headline.",
      bountyPot: 50,
      bountyType: "thread_contest",
    });
    const entry = await joinTask({ taskId: task.id, agentId: agent.id });

    assert.equal(entry.taskId, task.id);
    assert.equal(entry.agentId, agent.id);
    assert.equal(entry.status, "joined");
  });

  test("Agent can submit work", async () => {
    const { human, agent } = await humanAndAgent();
    const task = await createTask({
      createdByHumanId: human.id,
      title: "Write a headline",
      description: "Create a sharp headline.",
      bountyPot: 50,
      bountyType: "thread_contest",
    });
    await joinTask({ taskId: task.id, agentId: agent.id });
    const submission = await submitWork({
      taskId: task.id,
      agentId: agent.id,
      summary: "Where AI agents compete for paid work.",
      threadUrl: "https://x.com/rush-marketplace/status/1",
    });

    assert.equal(submission.taskId, task.id);
    assert.equal(submission.agentId, agent.id);
    assert.equal(submission.summary, "Where AI agents compete for paid work.");
    assert.equal(submission.threadUrl, "https://x.com/rush-marketplace/status/1");
  });

  test("Submission templates enforce required fields by bounty type", async () => {
    const { human, agent } = await humanAndAgent();
    const task = await createTask({
      createdByHumanId: human.id,
      title: "Fix a wallet issue",
      description: "Open a PR that fixes the bug.",
      bountyPot: 20,
      bountyType: "pr_bounty",
    });
    await joinTask({ taskId: task.id, agentId: agent.id });

    await assert.rejects(
      () =>
        submitWork({
          taskId: task.id,
          agentId: agent.id,
          summary: "Fixed reconnect state.",
        }),
      /GitHub PR link/,
    );

    const submission = await submitWork({
      taskId: task.id,
      agentId: agent.id,
      githubPrUrl: "https://github.com/rush-marketplace/proof-loop/pull/44",
    });

    assert.equal(submission.githubPrUrl, "https://github.com/rush-marketplace/proof-loop/pull/44");
    assert.match(submission.content, /PR: https:\/\/github\.com\/rush-marketplace\/proof-loop\/pull\/44/);
  });

  test("Reviewer can score submissions", async () => {
    const { human, agent } = await humanAndAgent();
    const task = await createTask({
      createdByHumanId: human.id,
      title: "Write a headline",
      description: "Create a sharp headline.",
      bountyPot: 50,
      bountyType: "thread_contest",
    });
    await joinTask({ taskId: task.id, agentId: agent.id });
    await submitWork({
      taskId: task.id,
      agentId: agent.id,
      summary: "Where AI agents compete for paid work.",
      threadUrl: "https://x.com/rush-marketplace/status/1",
    });
    const scored = await scoreSubmission({
      taskId: task.id,
      agentId: agent.id,
      score: 86,
      reviewerNotes: "Clear and direct.",
      reviewerRecommendation: agent.id,
    });

    assert.equal(scored.score, 86);
    assert.equal(scored.reviewerNotes, "Clear and direct.");
    const state = await readState();
    assert.equal(state.tasks[0].reviewerRecommendation, agent.id);
    assert.equal(state.tasks[0].status, "reviewed");
  });

  test("Cannot select winner before proof exists", async () => {
    const { human, agent } = await humanAndAgent();
    const task = await createTask({
      createdByHumanId: human.id,
      title: "Write a headline",
      description: "Create a sharp headline.",
      bountyPot: 50,
      bountyType: "thread_contest",
    });
    await joinTask({ taskId: task.id, agentId: agent.id });

    await assert.rejects(
      () => selectWinner({ taskId: task.id, winnerAgentId: agent.id }),
      /proof exists/,
    );
  });

  test("Winner cannot be paid before proof is scored", async () => {
    const { human, agent } = await humanAndAgent();
    const task = await createTask({
      createdByHumanId: human.id,
      title: "Write a headline",
      description: "Create a sharp headline.",
      bountyPot: 50,
      bountyType: "thread_contest",
    });
    await joinTask({ taskId: task.id, agentId: agent.id });
    await submitWork({
      taskId: task.id,
      agentId: agent.id,
      summary: "Where AI agents compete for paid work.",
      threadUrl: "https://x.com/rush-marketplace/status/1",
    });

    await assert.rejects(
      () => selectWinner({ taskId: task.id, winnerAgentId: agent.id }),
      /Score proof/,
    );
  });

  test("Legacy null proof scores cannot release payout", async () => {
    const { human, agent } = await humanAndAgent();
    const task = await createTask({
      createdByHumanId: human.id,
      title: "Write a headline",
      description: "Create a sharp headline.",
      bountyPot: 50,
      bountyType: "thread_contest",
    });
    await joinTask({ taskId: task.id, agentId: agent.id });
    await submitWork({
      taskId: task.id,
      agentId: agent.id,
      summary: "Where AI agents compete for paid work.",
      threadUrl: "https://x.com/rush-marketplace/status/1",
    });

    const state = await readState();
    const submission = state.submissions.find(
      (candidate) => candidate.taskId === task.id && candidate.agentId === agent.id,
    );
    assert.ok(submission);
    (submission as unknown as { score: null }).score = null;
    await writeState(state);

    await assert.rejects(
      () => selectWinner({ taskId: task.id, winnerAgentId: agent.id }),
      /Score proof/,
    );
  });

  test("Winner must be a competing agent with a submission", async () => {
    await resetTestState();
    const human = await registerHuman({ name: "Client Account", gmail: `client.${randomUUID()}@gmail.com` });
    const copyAgent = await registerAgent({
      name: "CopyAgent",
      gmail: `copy.${randomUUID()}@gmail.com`,
      skills: ["copywriting"],
      description: "Writes concise marketplace copy.",
    });
    const growthAgent = await registerAgent({
      name: "GrowthAgent",
      gmail: `growth.${randomUUID()}@gmail.com`,
      skills: ["growth"],
      description: "Optimizes copy.",
    });
    const task = await createTask({
      createdByHumanId: human.id,
      title: "Write a headline",
      description: "Create a sharp headline.",
      bountyPot: 50,
      bountyType: "thread_contest",
    });
    await joinTask({ taskId: task.id, agentId: copyAgent.id });
    await submitWork({
      taskId: task.id,
      agentId: copyAgent.id,
      summary: "Where AI agents compete for paid work.",
      threadUrl: "https://x.com/rush-marketplace/status/1",
    });

    await assert.rejects(
      () => selectWinner({ taskId: task.id, winnerAgentId: growthAgent.id }),
      /competing agent/,
    );
  });

  test("Payout goes to winner only", async () => {
    const state = await runCoreLoop();
    const growthAgent = state.agents.find((agent) => agent.name === "GrowthAgent");
    const unpaidAgents = state.agents.filter((agent) => agent.name !== "GrowthAgent");

    assert.equal(state.payouts.length, 1);
    assert.equal(growthAgent?.balancePot, 12);
    assert.ok(unpaidAgents.every((agent) => agent.balancePot === 0));
  });

  test("Escrow keeps unpaid bounties locked after the paid test-chain task", async () => {
    const state = await runCoreLoop();
    assert.equal(state.escrow.escrowBalancePot, 46);
  });

  test("Task cannot be paid twice", async () => {
    const state = await runCoreLoop();
    const task = state.tasks.find((candidate) => candidate.status === "completed");
    assert.ok(task);
    const winnerAgentId = task.winnerAgentId;
    assert.ok(winnerAgentId);

    await assert.rejects(
      () => selectWinner({ taskId: task.id, winnerAgentId }),
      /paid twice/,
    );
  });

  test("Full core loop balances match reference dashboard", async () => {
    const state = await runCoreLoop();
    const balance = (name: string) =>
      state.humans.find((human) => human.name === name)?.balancePot ??
      state.agents.find((agent) => agent.name === name)?.balancePot;

    assert.equal(balance("Client Account"), 42);
    assert.equal(state.escrow.escrowBalancePot, 46);
    assert.equal(balance("GrowthAgent"), 12);
    assert.equal(state.tasks.length, 6);
    assert.equal(state.submissions.length, 12);
    assert.equal(state.payouts.length, 1);
    assert.equal(state.events.length, 57);
  });

  test("Reset for the UI keeps market listings but clears client access", async () => {
    const seeded = await runCoreLoop();
    const reset = await resetPersonalStatePreservingMarket();

    assert.equal(reset.humans.filter((human) => !human.system).length, 0);
    assert.equal(reset.humans.filter((human) => human.system).length, 1);
    assert.equal(reset.agents.length, seeded.agents.length);
    assert.equal(reset.tasks.length, seeded.tasks.length);
    assert.ok(reset.tasks.every((task) => task.createdByHumanId === "human_rush_market"));
    assert.equal(reset.entries.length, seeded.entries.length);
    assert.equal(reset.submissions.length, seeded.submissions.length);
    assert.equal(reset.payouts.length, seeded.payouts.length);
    assert.equal(reset.escrow.humanBalancePot, 0);
  });
});
