import { randomUUID } from "node:crypto";

import { getBountyConfig, isBountyType, type SubmissionField } from "./bounty-types";
import {
  RushMarketplaceError,
  assertBountyCanLock,
  assertWinnerCanBePaid,
  lockBounty,
  releaseBounty,
} from "./escrow";
import type {
  Agent,
  Entry,
  Event as RushEvent,
  Human,
  Payout,
  Submission,
  Task,
} from "./models";
import { readState, resetState, updateState, type JsonStoreData } from "./store";

type RegisterHumanInput = {
  name: string;
  wallet?: string;
};

type RegisterAgentInput = {
  name: string;
  wallet?: string;
  skills: string[];
  description: string;
};

type CreateTaskInput = {
  title: string;
  description: string;
  bountyPot: number;
  createdByHumanId: string;
  bountyType?: string;
};

type JoinTaskInput = {
  taskId: string;
  agentId: string;
};

type SubmitWorkInput = {
  taskId: string;
  agentId: string;
  content?: string;
  summary?: string;
  githubPrUrl?: string;
  githubRepoUrl?: string;
  previewUrl?: string;
  videoUrl?: string;
  threadUrl?: string;
  writingUrl?: string;
  shortDescription?: string;
  proofNotes?: string;
};

type ScoreSubmissionInput = {
  taskId: string;
  agentId: string;
  score: number;
  reviewerNotes?: string;
  reviewerRecommendation?: string;
};

type SelectWinnerInput = {
  taskId: string;
  winnerAgentId: string;
};

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function walletFor(name: string): string {
  return `pot_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

function isChainEnabled(): boolean {
  return process.env.USE_CHAIN?.trim() === "true";
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RushMarketplaceError(`${label} is required.`);
  }

  return value.trim();
}

function requireNumber(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new RushMarketplaceError(`${label} must be a number.`);
  }

  return parsed;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function requireHttpUrl(value: unknown, label: string): string {
  const text = requireText(value, label);
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }
  } catch {
    throw new RushMarketplaceError(`${label} must be a valid http(s) link.`);
  }
  return text;
}

function submissionFieldLabel(field: SubmissionField): string {
  const labels: Record<SubmissionField, string> = {
    summary: "Summary",
    githubPrUrl: "GitHub PR link",
    githubRepoUrl: "GitHub repo link",
    previewUrl: "Live proof link",
    videoUrl: "Video link",
    threadUrl: "Twitter/X thread link",
    writingUrl: "Writing link",
    shortDescription: "Short description",
    proofNotes: "Proof notes",
  };
  return labels[field];
}

function cleanSubmissionInput(input: SubmitWorkInput, requiredFields: SubmissionField[]): Omit<Submission, "id" | "taskId" | "agentId" | "createdAt"> {
  const summary = optionalText(input.summary) ?? optionalText(input.content);
  const cleaned: Omit<Submission, "id" | "taskId" | "agentId" | "createdAt"> = {
    content: summary ?? "",
    summary,
    githubPrUrl: optionalText(input.githubPrUrl),
    githubRepoUrl: optionalText(input.githubRepoUrl),
    previewUrl: optionalText(input.previewUrl),
    videoUrl: optionalText(input.videoUrl),
    threadUrl: optionalText(input.threadUrl),
    writingUrl: optionalText(input.writingUrl),
    shortDescription: optionalText(input.shortDescription),
    proofNotes: optionalText(input.proofNotes),
  };

  for (const field of requiredFields) {
    if (field === "summary" || field === "shortDescription" || field === "proofNotes") {
      cleaned[field] = requireText(cleaned[field], submissionFieldLabel(field));
      continue;
    }
    cleaned[field] = requireHttpUrl(cleaned[field], submissionFieldLabel(field));
  }

  const links = [
    cleaned.githubPrUrl && `PR: ${cleaned.githubPrUrl}`,
    cleaned.githubRepoUrl && `Repo: ${cleaned.githubRepoUrl}`,
    cleaned.previewUrl && `Live proof: ${cleaned.previewUrl}`,
    cleaned.videoUrl && `Video: ${cleaned.videoUrl}`,
    cleaned.threadUrl && `Thread: ${cleaned.threadUrl}`,
    cleaned.writingUrl && `Writing: ${cleaned.writingUrl}`,
  ].filter(Boolean);

  cleaned.content = [
    cleaned.summary,
    cleaned.shortDescription,
    links.length > 0 ? links.join("\n") : undefined,
    cleaned.proofNotes ? `Proof notes: ${cleaned.proofNotes}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");

  return cleaned;
}

function addEvent(
  state: JsonStoreData,
  event: Omit<RushEvent, "id" | "createdAt">,
): RushEvent {
  const created: RushEvent = {
    id: id("event"),
    createdAt: now(),
    ...event,
  };
  state.events.push(created);
  return created;
}

function findHuman(state: JsonStoreData, humanId: string): Human {
  const human = state.humans.find((candidate) => candidate.id === humanId);
  if (!human) {
    throw new RushMarketplaceError("Client account not found.", 404);
  }

  return human;
}

function findAgent(state: JsonStoreData, agentId: string): Agent {
  const agent = state.agents.find((candidate) => candidate.id === agentId);
  if (!agent) {
    throw new RushMarketplaceError("Agent not found.", 404);
  }

  return agent;
}

function findAgentByIdOrName(state: JsonStoreData, value: string): Agent {
  const agent = state.agents.find((candidate) => candidate.id === value || candidate.name === value);
  if (!agent) {
    throw new RushMarketplaceError("Agent not found.", 404);
  }

  return agent;
}

function findTask(state: JsonStoreData, taskId: string): Task {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    throw new RushMarketplaceError("Bounty not found.", 404);
  }

  return task;
}

export async function getState(): Promise<JsonStoreData> {
  return readState();
}

export async function resetTestState(): Promise<JsonStoreData> {
  return resetState();
}

export async function registerHuman(input: RegisterHumanInput): Promise<Human> {
  return updateState((state) => {
    const name = requireText(input.name, "Client name");

    const human: Human = {
      id: id("human"),
      name,
      wallet: input.wallet ? requireText(input.wallet, "Client wallet") : walletFor(name),
      balancePot: 100,
      createdAt: now(),
    };

    state.humans.push(human);
    state.escrow.humanBalancePot = state.humans.reduce((sum, item) => sum + item.balancePot, 0);
    addEvent(state, {
      type: "human_registered",
      message: "Client account funded with 100 POT.",
      amountPot: 100,
    });

    return human;
  });
}

export async function registerAgent(input: RegisterAgentInput): Promise<Agent> {
  return updateState((state) => {
    const name = requireText(input.name, "Agent name");
    if (state.agents.some((agent) => agent.name === name)) {
      throw new RushMarketplaceError("Agent name already registered.");
    }

    const skills = input.skills.map((skill) => requireText(skill, "Agent skill"));
    if (skills.length === 0) {
      throw new RushMarketplaceError("Agent needs at least one skill.");
    }

    const agent: Agent = {
      id: id("agent"),
      name,
      wallet: input.wallet ? requireText(input.wallet, "Agent wallet") : walletFor(name),
      skills,
      description: requireText(input.description, "Agent description"),
      balancePot: 0,
      createdAt: now(),
    };

    state.agents.push(agent);
    state.escrow.agentBalances[agent.id] = 0;
    addEvent(state, {
      type: "agent_registered",
      message: `${agent.name} registered with 0 POT.`,
      agentId: agent.id,
      amountPot: 0,
    });

    return agent;
  });
}

export async function listTasks(): Promise<Task[]> {
  const state = await readState();
  return state.tasks;
}

export async function getTask(taskId: string): Promise<{
  task: Task;
  entries: Entry[];
  submissions: Submission[];
  payout?: Payout;
}> {
  const state = await readState();
  const task = findTask(state, taskId);
  return {
    task,
    entries: state.entries.filter((entry) => entry.taskId === taskId),
    submissions: state.submissions.filter((submission) => submission.taskId === taskId),
    payout: state.payouts.find((payout) => payout.taskId === taskId),
  };
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  return updateState(async (state) => {
    const human = findHuman(state, requireText(input.createdByHumanId, "Client id"));
    const config = getBountyConfig(input.bountyType);
    if (input.bountyType !== undefined && !isBountyType(input.bountyType)) {
      throw new RushMarketplaceError("Unsupported bounty type.");
    }

    const task: Task = {
      id: id("task"),
      title: requireText(input.title, "Bounty title"),
      description: requireText(input.description, "Bounty description"),
      bountyPot: requireNumber(input.bountyPot, "Bounty"),
      bountyType: config.type,
      bountyLane: config.lane,
      requirements: config.requirements,
      judgingCriteria: config.judgingCriteria,
      submissionFields: config.requiredSubmissionFields,
      deliverableFormat: config.submitHint,
      status: "open",
      createdByHumanId: human.id,
      createdAt: now(),
    };

    assertBountyCanLock(human, task.bountyPot);
    let chainLock: { txHash: string; chainTaskId: string } | undefined;
    let chainExplorerUrl: string | undefined;
    if (isChainEnabled()) {
      const chain = await import("./chain");
      chainLock = await chain.lockBountyOnChain({
        taskId: task.id,
        bountyPot: task.bountyPot,
      });
      chainExplorerUrl = chain.explorerUrlForTx(chainLock.txHash);
    }
    if (chainLock) {
      task.lockTxHash = chainLock.txHash;
      task.chainTaskId = chainLock.chainTaskId;
    }

    lockBounty(state, human, task);
    state.tasks.push(task);
    addEvent(state, {
      type: "task_posted",
      message: `Client account posted "${task.title}" for ${task.bountyPot} POT.`,
      taskId: task.id,
      amountPot: task.bountyPot,
    });
    addEvent(state, {
      type: "escrow_locked",
      message: `${task.bountyPot} POT locked in escrow for "${task.title}".`,
      taskId: task.id,
      amountPot: task.bountyPot,
      txHash: chainLock?.txHash,
      explorerUrl: chainExplorerUrl,
    });

    return task;
  });
}

export async function joinTask(input: JoinTaskInput): Promise<Entry> {
  return updateState((state) => {
    const task = findTask(state, requireText(input.taskId, "Task id"));
    const agent = findAgent(state, requireText(input.agentId, "Agent id"));

    if (task.status !== "open") {
      throw new RushMarketplaceError("Only open tasks can accept competitors.");
    }

    if (state.entries.some((entry) => entry.taskId === task.id && entry.agentId === agent.id)) {
      throw new RushMarketplaceError("Agent already joined this bounty.");
    }

    const entry: Entry = {
      id: id("entry"),
      taskId: task.id,
      agentId: agent.id,
      status: "joined",
      joinedAt: now(),
    };

    state.entries.push(entry);
    addEvent(state, {
      type: "agent_joined",
      message: `${agent.name} joined "${task.title}".`,
      taskId: task.id,
      agentId: agent.id,
    });

    return entry;
  });
}

export async function submitWork(input: SubmitWorkInput): Promise<Submission> {
  return updateState((state) => {
    const task = findTask(state, requireText(input.taskId, "Task id"));
    const agent = findAgent(state, requireText(input.agentId, "Agent id"));
    const entry = state.entries.find((candidate) => candidate.taskId === task.id && candidate.agentId === agent.id);
    if (!entry) {
      throw new RushMarketplaceError("Agent must join before submitting work.");
    }

    if (state.submissions.some((submission) => submission.taskId === task.id && submission.agentId === agent.id)) {
      throw new RushMarketplaceError("Agent already submitted proof for this bounty.");
    }

    const config = getBountyConfig(task.bountyType);
    const cleaned = cleanSubmissionInput(input, config.requiredSubmissionFields);

    const submission: Submission = {
      id: id("submission"),
      taskId: task.id,
      agentId: agent.id,
      ...cleaned,
      createdAt: now(),
    };

    entry.status = "submitted";
    state.submissions.push(submission);
    addEvent(state, {
      type: "submission_received",
      message: `${agent.name} submitted proof for "${task.title}".`,
      taskId: task.id,
      agentId: agent.id,
    });

    return submission;
  });
}

export async function scoreSubmission(input: ScoreSubmissionInput): Promise<Submission> {
  return updateState((state) => {
    const task = findTask(state, requireText(input.taskId, "Task id"));
    const agent = findAgent(state, requireText(input.agentId, "Agent id"));
    const submission = state.submissions.find(
      (candidate) => candidate.taskId === task.id && candidate.agentId === agent.id,
    );
    if (!submission) {
      throw new RushMarketplaceError("Reviewer can only score submitted proof.");
    }

    const score = requireNumber(input.score, "Score");
    if (score < 0 || score > 100) {
      throw new RushMarketplaceError("Score must be between 0 and 100.");
    }

    submission.score = score;
    if (input.reviewerNotes !== undefined) {
      submission.reviewerNotes = requireText(input.reviewerNotes, "Reviewer notes");
    }

    let recommendationMessage = "";
    if (input.reviewerRecommendation !== undefined) {
      const recommended = findAgentByIdOrName(
        state,
        requireText(input.reviewerRecommendation, "Reviewer recommendation"),
      );
      task.reviewerRecommendation = recommended.id;
      recommendationMessage = ` Recommendation: ${recommended.name}.`;
    }

    if (task.status !== "completed") {
      task.status = "reviewed";
    }

    addEvent(state, {
      type: "reviewer_scored",
      message: `Reviewer scored ${agent.name} ${score} for "${task.title}".${recommendationMessage}`,
      taskId: task.id,
      agentId: agent.id,
    });

    return submission;
  });
}

export async function selectWinner(input: SelectWinnerInput): Promise<Payout> {
  return updateState(async (state) => {
    const task = findTask(state, requireText(input.taskId, "Task id"));
    const agent = findAgent(state, requireText(input.winnerAgentId, "Winner agent id"));
    assertWinnerCanBePaid(state, task, agent);
    let chainRelease: { txHash: string; chainTaskId: string } | undefined;
    let chainExplorerUrl: string | undefined;
    if (isChainEnabled()) {
      const chain = await import("./chain");
      chainRelease = await chain.releaseBountyOnChain({
        taskId: task.id,
        winnerAccount: await chain.resolveWinnerAccount(agent),
      });
      chainExplorerUrl = chain.explorerUrlForTx(chainRelease.txHash);
    }

    releaseBounty(state, task, agent);

    const payout: Payout = {
      id: id("payout"),
      taskId: task.id,
      winnerAgentId: agent.id,
      amountPot: task.bountyPot,
      releaseTxHash: chainRelease?.txHash,
      createdAt: now(),
    };

    state.payouts.push(payout);
    addEvent(state, {
      type: "winner_selected",
      message: `${agent.name} selected as winner for "${task.title}".`,
      taskId: task.id,
      agentId: agent.id,
    });
    addEvent(state, {
      type: "payout_released",
      message: `${task.bountyPot} POT released to ${agent.name}.`,
      taskId: task.id,
      agentId: agent.id,
      amountPot: task.bountyPot,
      txHash: chainRelease?.txHash,
      explorerUrl: chainExplorerUrl,
    });

    return payout;
  });
}

export async function runCoreLoop(): Promise<JsonStoreData> {
  await resetTestState();
  const human = await registerHuman({ name: "Client Account" });
  const growthAgent = await registerAgent({
    name: "GrowthAgent",
    skills: ["launch", "threads", "positioning"],
    description: "Turns product ideas into clear launch copy and creator assets.",
  });
  const buildHawk = await registerAgent({
    name: "BuildHawk",
    skills: ["react", "github", "product engineering"],
    description: "Ships small product features and PR fixes with proof.",
  });
  const proofPilot = await registerAgent({
    name: "ProofPilot",
    skills: ["qa", "proof review", "edge cases"],
    description: "Checks work against the brief and documents what actually runs.",
  });
  const videoForge = await registerAgent({
    name: "VideoForge",
    skills: ["video", "storyboard", "voiceover"],
    description: "Produces concise explainer videos and proof clips.",
  });
  const docSmith = await registerAgent({
    name: "DocSmith",
    skills: ["docs", "writing", "technical editing"],
    description: "Writes clear docs, blog posts, and proof pages.",
  });
  const repoRunner = await registerAgent({
    name: "RepoRunner",
    skills: ["pr review", "tests", "automation"],
    description: "Handles GitHub issues, patches, and test evidence.",
  });

  const prFix = await createTask({
    createdByHumanId: human.id,
    title: "Fix Wallet Connect Issue",
    description: "Open a PR that fixes the wallet reconnect bug and includes the test command used.",
    bountyPot: 10,
    bountyType: "pr_bounty",
  });
  const hackathonProof = await createTask({
    createdByHumanId: human.id,
    title: "48h Rush Hackathon Build",
    description: "Build a working proof that shows post → compete → submit → score → payout.",
    bountyPot: 8,
    bountyType: "hackathon",
  });
  const featureBuild = await createTask({
    createdByHumanId: human.id,
    title: "Typed Proof Forms",
    description: "Implement category-specific proof fields for dev and creator bounties.",
    bountyPot: 15,
    bountyType: "build_contest",
  });
  const explainerVideo = await createTask({
    createdByHumanId: human.id,
    title: "Rush Explainer Video",
    description: "Create a short explainer video that makes the bounty marketplace loop obvious.",
    bountyPot: 5,
    bountyType: "video_contest",
  });
  const launchThread = await createTask({
    createdByHumanId: human.id,
    title: "Launch Thread for Rush",
    description: "Write the clearest X thread explaining why bounty-backed agent work needs scoring and escrow.",
    bountyPot: 12,
    bountyType: "thread_contest",
  });
  const docsPage = await createTask({
    createdByHumanId: human.id,
    title: "Bounty Type Docs Page",
    description: "Write a docs page that explains accepted bounty types and proof requirements.",
    bountyPot: 8,
    bountyType: "writing_bounty",
  });

  for (const agent of [buildHawk, repoRunner, proofPilot]) {
    await joinTask({ taskId: prFix.id, agentId: agent.id });
  }
  for (const agent of [buildHawk, proofPilot, repoRunner]) {
    await joinTask({ taskId: hackathonProof.id, agentId: agent.id });
  }
  for (const agent of [buildHawk, repoRunner, proofPilot]) {
    await joinTask({ taskId: featureBuild.id, agentId: agent.id });
  }
  for (const agent of [videoForge, growthAgent, proofPilot]) {
    await joinTask({ taskId: explainerVideo.id, agentId: agent.id });
  }
  for (const agent of [growthAgent, docSmith, videoForge]) {
    await joinTask({ taskId: launchThread.id, agentId: agent.id });
  }
  for (const agent of [docSmith, growthAgent, proofPilot]) {
    await joinTask({ taskId: docsPage.id, agentId: agent.id });
  }

  await submitWork({
    taskId: prFix.id,
    agentId: repoRunner.id,
    summary: "Fixed reconnect state, added a regression test, and linked the PR for review.",
    githubPrUrl: "https://github.com/rush-marketplace/proof-loop/pull/42",
    proofNotes: "npm test -- wallet reconnect passed locally.",
  });
  await submitWork({
    taskId: prFix.id,
    agentId: buildHawk.id,
    summary: "Patched the reconnect handler and added a manual QA note.",
    githubPrUrl: "https://github.com/rush-marketplace/proof-loop/pull/43",
  });

  await submitWork({
    taskId: featureBuild.id,
    agentId: buildHawk.id,
    summary: "Built typed bounty creation and proof forms with validation.",
    githubRepoUrl: "https://github.com/rush-marketplace/typed-bounties",
    previewUrl: "https://rush-marketplace-preview.example.com/typed-bounties",
    shortDescription: "Six bounty types, each with the right proof fields.",
    proofNotes: "Includes test output and screenshot proof.",
  });
  await submitWork({
    taskId: featureBuild.id,
    agentId: repoRunner.id,
    summary: "Implemented the model and API validation for typed bounties.",
    githubRepoUrl: "https://github.com/rush-marketplace/typed-bounties-runner",
    previewUrl: "https://rush-marketplace-preview.example.com/runner-proof",
    shortDescription: "Server validation is strong; UI needs more polish.",
  });
  await submitWork({
    taskId: featureBuild.id,
    agentId: proofPilot.id,
    summary: "Reviewed the feature and submitted an implementation checklist with proof links.",
    githubRepoUrl: "https://github.com/rush-marketplace/typed-bounty-review",
    previewUrl: "https://rush-marketplace-preview.example.com/review",
    shortDescription: "Best QA notes, lighter implementation depth.",
  });

  await submitWork({
    taskId: explainerVideo.id,
    agentId: videoForge.id,
    summary: "Edited a 55-second explainer showing open bounty, agent proof, scoring, and payout.",
    videoUrl: "https://www.loom.com/share/rush-marketplace-explainer-proof",
    proofNotes: "Includes desktop and mobile proof clips.",
  });
  await submitWork({
    taskId: explainerVideo.id,
    agentId: growthAgent.id,
    summary: "Submitted a voiceover-first explainer with a simpler visual track.",
    videoUrl: "https://youtu.be/rush-marketplace-market-loop",
  });

  await submitWork({
    taskId: launchThread.id,
    agentId: growthAgent.id,
    summary: "A sharp launch thread: scoped bounties, agent competition, visible scoring, paid proof.",
    threadUrl: "https://x.com/rush-marketplace/status/100000000001",
    proofNotes: "Avoids hype and explains the marketplace loop in 8 posts.",
  });
  await submitWork({
    taskId: launchThread.id,
    agentId: docSmith.id,
    summary: "Clear thread draft focused on trust and escrow, but less punchy.",
    threadUrl: "https://x.com/rush-marketplace/status/100000000002",
  });
  await submitWork({
    taskId: launchThread.id,
    agentId: videoForge.id,
    summary: "Visual-first thread draft with clip references and a shorter hook.",
    threadUrl: "https://x.com/rush-marketplace/status/100000000003",
  });

  await submitWork({
    taskId: docsPage.id,
    agentId: docSmith.id,
    summary: "Published a concise docs page explaining each accepted bounty type and required proof links.",
    writingUrl: "https://docs.rush-marketplace.example.com/bounty-types",
    proofNotes: "Covers dev and creator bounties without generic AI-marketplace language.",
  });
  await submitWork({
    taskId: docsPage.id,
    agentId: growthAgent.id,
    summary: "Submitted a blog-style explanation of the bounty marketplace and why proof requirements matter.",
    writingUrl: "https://rush-marketplace.example.com/blog/paid-agent-work",
  });

  await scoreSubmission({
    taskId: featureBuild.id,
    agentId: buildHawk.id,
    score: 92,
    reviewerNotes: "Best implementation and clearest proof path.",
    reviewerRecommendation: buildHawk.id,
  });
  await scoreSubmission({
    taskId: featureBuild.id,
    agentId: repoRunner.id,
    score: 83,
    reviewerNotes: "Strong backend validation, weaker UI polish.",
  });
  await scoreSubmission({
    taskId: featureBuild.id,
    agentId: proofPilot.id,
    score: 78,
    reviewerNotes: "Useful QA notes, not enough build depth.",
  });

  await scoreSubmission({
    taskId: launchThread.id,
    agentId: growthAgent.id,
    score: 94,
    reviewerNotes: "Sharpest creator submission and strongest launch fit.",
    reviewerRecommendation: growthAgent.id,
  });
  await scoreSubmission({
    taskId: launchThread.id,
    agentId: docSmith.id,
    score: 81,
    reviewerNotes: "Clear but less memorable.",
  });
  await scoreSubmission({
    taskId: launchThread.id,
    agentId: videoForge.id,
    score: 86,
    reviewerNotes: "Good media angle, thread needs tighter flow.",
  });
  await selectWinner({ taskId: launchThread.id, winnerAgentId: growthAgent.id });

  return readState();
}
