"use client";

import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react";

import {
  BOUNTY_TYPE_OPTIONS,
  getBountyConfig,
  type BountyType,
  type SubmissionField,
} from "@/lib/bounty-types";
import type {
  Agent,
  Entry,
  Event as RushEvent,
  Human,
  Submission,
  Task,
} from "@/lib/models";
import type { JsonStoreData } from "@/lib/store";

type ApiInit = Omit<RequestInit, "body"> & {
  body?: Record<string, unknown>;
};

type Session = {
  role: "human" | "agent";
  id: string;
  name: string;
};

type Notice = {
  tone: "success" | "error" | "info";
  text: string;
};

type RegistrationRole = "human" | "agent" | null;

type HumanDraft = {
  name: string;
  wallet: string;
};

type AgentDraft = {
  name: string;
  wallet: string;
  skills: string;
  description: string;
};

type TaskDraft = {
  title: string;
  description: string;
  bountyPot: string;
  bountyType: BountyType;
};

type SubmissionDraft = Partial<Record<SubmissionField, string>>;
type SubmissionDrafts = Record<string, SubmissionDraft>;
type BountyTypeFilter = BountyType | "all";
type ExpandedSubmissions = Record<string, boolean>;
type ActiveSection =
  | "dashboard"
  | "profile"
  | "create"
  | "tasks"
  | "submissions"
  | "payouts"
  | "analytics"
  | "activity"
  | "agents"
  | "settings";

const sessionKey = "rush-marketplace_session";
const activeSections: ActiveSection[] = [
  "dashboard",
  "profile",
  "create",
  "tasks",
  "submissions",
  "payouts",
  "analytics",
  "activity",
  "agents",
  "settings",
];

const defaultHumanDraft: HumanDraft = {
  name: "",
  wallet: "",
};

const defaultAgentDraft: AgentDraft = {
  name: "",
  wallet: "",
  skills: "",
  description: "",
};

const defaultTaskDraft: TaskDraft = {
  title: "48h Rush Hackathon Build",
  description:
    "Build a working proof that shows post → compete → submit → score → payout.",
  bountyPot: "10",
  bountyType: "hackathon",
};

async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function roleLabel(role: "human" | "agent"): string {
  return role === "human" ? "Client" : "Agent";
}

function truncateWallet(wallet: string): string {
  if (wallet.length <= 18) {
    return wallet;
  }

  return `${wallet.slice(0, 9)}...${wallet.slice(-6)}`;
}

function relativeTime(iso: string): string {
  const seconds = Math.max(
    1,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000),
  );
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatAgent(agentId: string | undefined, agents: Agent[]): string {
  if (!agentId) {
    return "None";
  }

  return agents.find((agent) => agent.id === agentId)?.name ?? agentId;
}

function statusLabel(status: string): string {
  if (status === "reviewed" || status === "in_review") {
    return "In Review";
  }

  if (status === "completed") {
    return "Completed";
  }

  if (status === "cancelled") {
    return "Cancelled";
  }

  if (status === "open") {
    return "Open";
  }

  return status
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function statusClass(status: string): string {
  if (status === "completed") {
    return "border-[#14532d]/35 bg-[#14532d]/10 text-[#14532d]";
  }

  if (status === "open") {
    return "border-[#14532d]/35 bg-[#14532d]/10 text-[#14532d]";
  }

  if (status === "reviewed" || status === "in_review") {
    return "border-[#f59e0b]/30 bg-[#f59e0b]/10 text-[#fbbf24]";
  }

  if (status === "cancelled") {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }

  return "border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#ddd6fe]";
}

function eventIcon(type: string): string {
  const icons: Record<string, string> = {
    task_created: "task",
    task_posted: "task",
    bounty_locked: "lock",
    escrow_locked: "lock",
    agent_joined: "agent",
    submission_received: "submission",
    reviewer_scored: "review",
    winner_selected: "winner",
    payout_released: "payout",
    human_registered: "identity",
    agent_registered: "identity",
  };

  return icons[type] ?? "event";
}

function EventGlyph({ type }: { type: string }) {
  const label = eventIcon(type);
  const common = {
    "aria-hidden": true,
    className: "h-5 w-5",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  if (label === "lock") {
    return (
      <svg {...common}>
        <rect height="10" rx="2" width="14" x="5" y="11" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        <path d="M12 15v2" />
      </svg>
    );
  }

  if (label === "agent" || label === "identity") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      </svg>
    );
  }

  if (label === "review") {
    return (
      <svg {...common}>
        <circle cx="10.5" cy="10.5" r="5.5" />
        <path d="m15 15 4.5 4.5" />
      </svg>
    );
  }

  if (label === "winner") {
    return (
      <svg {...common}>
        <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
        <path d="M8 6H5a3 3 0 0 0 3 3" />
        <path d="M16 6h3a3 3 0 0 1-3 3" />
        <path d="M12 12v4" />
        <path d="M9 20h6" />
        <path d="M10 16h4" />
      </svg>
    );
  }

  if (label === "payout") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v10" />
        <path d="M9 10.5c0-1.4 1.3-2.3 3-2.3s3 .9 3 2.3-1.2 2-3 2-3 .6-3 2 1.3 2.3 3 2.3 3-.9 3-2.3" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect height="16" rx="2" width="12" x="6" y="4" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </svg>
  );
}

function eventTone(type: string): "success" | "warning" | "info" {
  if (type === "payout_released" || type === "winner_selected") {
    return "success";
  }

  if (type === "bounty_locked" || type === "escrow_locked") {
    return "warning";
  }

  return "info";
}

function eventToneClass(type: string): string {
  const tone = eventTone(type);
  if (tone === "success") {
    return "border-[#14532d]/35 bg-[#14532d]/10 text-[#14532d]";
  }

  if (tone === "warning") {
    return "border-[#f59e0b]/35 bg-[#f59e0b]/10 text-[#fbbf24]";
  }

  return "border-[#7c3aed]/35 bg-[#7c3aed]/10 text-[#ddd6fe]";
}

function eventReference(id: string): string {
  const compact = id.replace(/[^a-zA-Z0-9]/g, "");
  if (compact.length <= 8) {
    return compact || id;
  }

  return `${compact.slice(0, 5)}...${compact.slice(-4)}`;
}

function compactHash(hash: string): string {
  if (hash.length <= 18) {
    return hash;
  }

  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function submissionStatus(task: Task, submission: Submission): string {
  if (task.status === "completed") {
    return task.winnerAgentId === submission.agentId ? "Won" : "Lost";
  }

  return submission.score === undefined
    ? "Awaiting score"
    : `Scored ${submission.score}/100`;
}

function paymentStatus(task: Task, payouts: JsonStoreData["payouts"]): {
  label: string;
  detail: string;
  tone: "locked" | "review" | "paid";
} {
  const payout = payouts.find((item) => item.taskId === task.id);
  if (payout) {
    return {
      label: "Paid",
      detail: `${payout.amountPot} POT released to the selected agent.`,
      tone: "paid",
    };
  }

  if (task.status === "reviewed" || task.reviewerRecommendation) {
    return {
      label: "Review complete",
      detail: `${task.bountyPot} POT remains locked until winner release.`,
      tone: "review",
    };
  }

  return {
    label: "Escrow locked",
    detail: `${task.bountyPot} POT is reserved for this bounty.`,
    tone: "locked",
  };
}

function paymentToneClass(tone: "locked" | "review" | "paid"): string {
  if (tone === "paid") {
    return "border-[#14532d]/35 bg-[#14532d]/10 text-[#14532d]";
  }

  if (tone === "review") {
    return "border-[#f59e0b]/30 bg-[#f59e0b]/10 text-[#d97706]";
  }

  return "border-[#7c3aed]/25 bg-[#ede5ff] text-[#5b21b6]";
}

function reviewerScore(agent: Agent | undefined, content: string): number {
  if (agent?.name === "CopyAgent") {
    return 86;
  }

  if (agent?.name === "GrowthAgent") {
    return 94;
  }

  if (agent?.name === "TechAgent") {
    return 81;
  }

  const lengthBonus = Math.min(14, Math.floor(content.length / 24));
  const skillBonus = agent?.skills.some((skill) =>
    /growth|position|copy/i.test(skill),
  )
    ? 8
    : 4;
  return Math.min(96, 72 + lengthBonus + skillBonus);
}

function reviewerNotes(agent: Agent | undefined, score: number): string {
  if (agent?.name === "GrowthAgent") {
    return "Best fit for the product promise.";
  }

  if (agent?.name === "CopyAgent") {
    return "Clear and direct.";
  }

  if (agent?.name === "TechAgent") {
    return "Accurate but too technical.";
  }

  return score >= 90
    ? "Strongest proof for the bounty."
    : "Useful proof with room to sharpen.";
}

function bountyTypeLabel(task: Task): string {
  return getBountyConfig(task.bountyType).label;
}

function bountyTag(task: Task): string {
  return getBountyConfig(task.bountyType).tag;
}

function bountyLane(task: Task): string {
  return getBountyConfig(task.bountyType).lane === "dev" ? "Dev" : "Creator";
}

function fieldLabel(field: SubmissionField): string {
  const labels: Record<SubmissionField, string> = {
    summary: "Summary",
    githubPrUrl: "GitHub PR link",
    githubRepoUrl: "GitHub repo link",
    previewUrl: "Live proof link",
    videoUrl: "YouTube / Loom link",
    threadUrl: "Twitter/X thread link",
    writingUrl: "Blog / docs link",
    shortDescription: "Short description",
    proofNotes: "Proof notes",
  };
  return labels[field];
}

function fieldPlaceholder(field: SubmissionField, task: Task): string {
  const labels: Record<SubmissionField, string> = {
    summary: `What did you submit for "${task.title}"?`,
    githubPrUrl: "https://github.com/org/repo/pull/123",
    githubRepoUrl: "https://github.com/org/repo",
    previewUrl: "https://preview.example.com or https://loom.com/share/...",
    videoUrl: "https://youtube.com/watch?v=... or https://loom.com/share/...",
    threadUrl: "https://x.com/you/status/...",
    writingUrl: "https://your-blog.example.com/post or docs link",
    shortDescription: "What works, what to click first, and what is unfinished.",
    proofNotes: "Tests, screenshots, constraints, or review notes.",
  };
  return labels[field];
}

function submissionLinks(submission: Submission): Array<{ label: string; href: string }> {
  return [
    submission.githubPrUrl && { label: "GitHub PR", href: submission.githubPrUrl },
    submission.githubRepoUrl && { label: "Repo", href: submission.githubRepoUrl },
    submission.previewUrl && { label: "Live proof", href: submission.previewUrl },
    submission.videoUrl && { label: "Video", href: submission.videoUrl },
    submission.threadUrl && { label: "Thread", href: submission.threadUrl },
    submission.writingUrl && { label: "Writing", href: submission.writingUrl },
  ].filter(Boolean) as Array<{ label: string; href: string }>;
}

function generateSubmission(task: Task, agent: Agent): SubmissionDraft {
  const config = getBountyConfig(task.bountyType);
  const base: SubmissionDraft = {
    summary: `${agent.name} proof for ${config.label}: ${task.description}`,
    proofNotes: "I checked the brief, matched the required format, and listed any gaps clearly.",
  };

  if (config.type === "pr_bounty") {
    base.githubPrUrl = "https://github.com/your-org/your-repo/pull/123";
  }
  if (config.type === "hackathon" || config.type === "build_contest") {
    base.githubRepoUrl = "https://github.com/your-org/your-proof-build";
    base.previewUrl = "https://your-preview.example.com";
    base.shortDescription = "Working proof, proof path, and known limits.";
  }
  if (config.type === "video_contest") {
    base.videoUrl = "https://www.loom.com/share/your-video";
  }
  if (config.type === "thread_contest") {
    base.threadUrl = "https://x.com/you/status/123";
  }
  if (config.type === "writing_bounty") {
    base.writingUrl = "https://your-docs.example.com/bounty-proof";
  }

  return base;
}

function canGenerateWithAi(): boolean {
  return process.env.NEXT_PUBLIC_RUSH_HAS_ANTHROPIC_KEY === "true";
}

function hashSection(): ActiveSection | null {
  const value = window.location.hash.replace(/^#/, "");
  return activeSections.includes(value as ActiveSection)
    ? (value as ActiveSection)
    : null;
}

export function RushMarketplaceApp() {
  const [state, setState] = useState<JsonStoreData | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [registrationRole, setRegistrationRole] =
    useState<RegistrationRole>(null);
  const [activeSection, setActiveSection] =
    useState<ActiveSection>("dashboard");
  const [sectionHistory, setSectionHistory] = useState<ActiveSection[]>([]);
  const [bountyTypeFilter, setBountyTypeFilter] =
    useState<BountyTypeFilter>("all");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [humanDraft, setHumanDraft] = useState<HumanDraft>(defaultHumanDraft);
  const [agentDraft, setAgentDraft] = useState<AgentDraft>(defaultAgentDraft);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(defaultTaskDraft);
  const [gmailDraft, setGmailDraft] = useState("");
  const [submissionDrafts, setSubmissionDrafts] = useState<SubmissionDrafts>(
    {},
  );
  const [expandedSubmissions, setExpandedSubmissions] =
    useState<ExpandedSubmissions>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState("");
  const [feedFlash, setFeedFlash] = useState(false);
  const lastEventCount = useRef<number | null>(null);
  const selectedTaskIdRef = useRef("");

  function selectTaskId(taskId: string) {
    selectedTaskIdRef.current = taskId;
    setSelectedTaskId(taskId);
  }

  function replaceSection(section: ActiveSection) {
    setSectionHistory([]);
    setActiveSection(section);
  }

  function navigateToSection(section: ActiveSection) {
    if (section === activeSection) {
      return;
    }

    setSectionHistory((history) => [...history, activeSection].slice(-12));
    setActiveSection(section);
  }

  function goBackState() {
    const previousSection = sectionHistory[sectionHistory.length - 1];

    if (previousSection) {
      setSectionHistory((history) => history.slice(0, -1));
      setActiveSection(previousSection);
      return;
    }

    if (activeSection !== "dashboard") {
      setActiveSection("dashboard");
      return;
    }

    showLanding();
  }

  async function refresh(): Promise<JsonStoreData> {
    const next = await api<JsonStoreData>("/api/state");
    setState(next);

    if (
      lastEventCount.current !== null &&
      next.events.length > lastEventCount.current
    ) {
      setFeedFlash(true);
      window.setTimeout(() => setFeedFlash(false), 900);
    }
    lastEventCount.current = next.events.length;

    const currentSelectedTaskId = selectedTaskIdRef.current;
    const selectedTaskStillExists = next.tasks.some(
      (task) => task.id === currentSelectedTaskId,
    );

    if (
      (!currentSelectedTaskId || !selectedTaskStillExists) &&
      next.tasks.length > 0
    ) {
      selectTaskId(next.tasks[0].id);
    }

    return next;
  }

  useEffect(() => {
    const saved = window.localStorage.getItem(sessionKey);
    if (saved) {
      try {
        setSession(JSON.parse(saved) as Session);
      } catch {
        window.localStorage.removeItem(sessionKey);
      }
    }

    const syncHashSection = () => {
      const section = hashSection();
      if (section) {
        setActiveSection(section);
      }
    };

    syncHashSection();
    window.addEventListener("hashchange", syncHashSection);

    refresh().catch((error) =>
      setNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not load the test-chain state.",
      }),
    );
    const interval = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 3000);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("hashchange", syncHashSection);
    };
    // The refresh function intentionally reads current component state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!state || !session || busy) {
      return;
    }

    const exists =
      session.role === "human"
        ? state.humans.some((human) => human.id === session.id && !human.system)
        : state.agents.some((agent) => agent.id === session.id && !agent.deleted);

    if (!exists) {
      window.localStorage.removeItem(sessionKey);
      setSession(null);
      setRegistrationRole(null);
    }
  }, [state, session, busy]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const humans = (state?.humans ?? []).filter((item) => !item.system);
  const agents = (state?.agents ?? []).filter((item) => !item.deleted);
  const tasks = state?.tasks ?? [];
  const entries = state?.entries ?? [];
  const submissions = state?.submissions ?? [];
  const events = state?.events ?? [];
  const payouts = state?.payouts ?? [];
  const escrowBalancePot = state?.escrow.escrowBalancePot ?? 0;
  const human =
    session?.role === "human"
      ? humans.find((item) => item.id === session.id)
      : humans[0];
  const agent =
    session?.role === "agent"
      ? agents.find((item) => item.id === session.id)
      : undefined;
  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId) ?? tasks[0];
  const showAiButton = canGenerateWithAi();

  useEffect(() => {
    const activeGmail = session?.role === "human" ? human?.gmail : agent?.gmail;
    setGmailDraft(activeGmail ?? "");
  }, [agent?.gmail, human?.gmail, session?.id, session?.role]);

  function persistSession(nextSession: Session) {
    window.localStorage.setItem(sessionKey, JSON.stringify(nextSession));
    setSession(nextSession);
  }

  function showLanding() {
    window.localStorage.removeItem(sessionKey);
    setSession(null);
    setRegistrationRole(null);
    replaceSection("dashboard");
    setNotice(null);
  }

  function leaveRegistration() {
    setRegistrationRole(null);
    setNotice(null);
  }

  async function runAction(
    action: () => Promise<void>,
    success: string,
    busyLabel: string,
  ) {
    try {
      setBusy(busyLabel);
      setNotice(null);
      await action();
      await refresh();
      setNotice({ tone: "success", text: success });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The action could not be completed.",
      });
    } finally {
      setBusy("");
    }
  }

  async function submitHumanRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(
      async () => {
        const created = await api<Human>("/api/humans/register", {
          method: "POST",
          body: {
            name: humanDraft.name,
            wallet: humanDraft.wallet,
          },
        });
        persistSession({ role: "human", id: created.id, name: created.name });
        setRegistrationRole(null);
        replaceSection("dashboard");
      },
      `${humanDraft.name} funded with 100 POT.`,
      "Creating client account",
    );
  }

  async function submitAgentRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(
      async () => {
        const created = await api<Agent>("/api/agents/register", {
          method: "POST",
          body: {
            name: agentDraft.name,
            wallet: agentDraft.wallet,
            skills: agentDraft.skills
              .split(",")
              .map((skill) => skill.trim())
              .filter(Boolean),
            description: agentDraft.description,
          },
        });
        persistSession({ role: "agent", id: created.id, name: created.name });
        setRegistrationRole(null);
        replaceSection("dashboard");
      },
      `${agentDraft.name} registered with 0 POT.`,
      "Registering agent",
    );
  }

  async function postTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!human) {
      setNotice({
        tone: "info",
        text: "Create a client account before posting a bounty.",
      });
      return;
    }

    await runAction(
      async () => {
        const task = await api<Task>("/api/tasks", {
          method: "POST",
          body: {
            createdByHumanId: human.id,
            title: taskDraft.title,
            description: taskDraft.description,
            bountyPot: Number(taskDraft.bountyPot),
            bountyType: taskDraft.bountyType,
          },
        });
        selectTaskId(task.id);
        navigateToSection("tasks");
      },
      "Bounty posted. POT is now locked in escrow.",
      "Posting task",
    );
  }

  async function compete(task: Task) {
    if (!agent) {
      setRegistrationRole("agent");
      return;
    }

    await runAction(
      async () => {
        await api(`/api/tasks/${task.id}/join`, {
          method: "POST",
          body: { agentId: agent.id },
        });
        selectTaskId(task.id);
      },
      `${agent.name} entered the bounty. Proof form is ready.`,
      "Joining competition",
    );
  }

  async function submitWork(task: Task) {
    if (!agent) {
      setRegistrationRole("agent");
      return;
    }

    await runAction(
      async () => {
        await api(`/api/tasks/${task.id}/submit`, {
          method: "POST",
          body: {
            agentId: agent.id,
            ...(submissionDrafts[task.id] ?? {}),
          },
        });
      },
      `${agent.name} submitted proof.`,
      "Submitting proof",
    );
  }

  async function scoreAllSubmissions(task: Task) {
    const taskSubmissions = submissions.filter(
      (submission) => submission.taskId === task.id,
    );
    if (taskSubmissions.length === 0) {
      setNotice({
        tone: "info",
        text: "No proof has been submitted for this bounty yet.",
      });
      return;
    }

    const scored = taskSubmissions.map((submission) => {
      const submissionAgent = agents.find(
        (item) => item.id === submission.agentId,
      );
      const score = reviewerScore(submissionAgent, submission.content);
      return {
        agentId: submission.agentId,
        notes: reviewerNotes(submissionAgent, score),
        score,
      };
    });
    const recommended = scored.reduce((best, item) =>
      item.score > best.score ? item : best,
    );

    await runAction(
      async () => {
        for (const item of scored) {
          await api(`/api/tasks/${task.id}/score`, {
            method: "POST",
            body: {
              agentId: item.agentId,
              score: item.score,
              reviewerNotes: item.notes,
              reviewerRecommendation:
                item.agentId === recommended.agentId
                  ? recommended.agentId
                  : undefined,
            },
          });
        }
      },
      `${formatAgent(recommended.agentId, agents)} recommended by reviewer.`,
      "Scoring proof",
    );
  }

  async function selectWinner(task: Task, agentId: string) {
    await runAction(
      async () => {
        await api(`/api/tasks/${task.id}/winner`, {
          method: "POST",
          body: { winnerAgentId: agentId },
        });
      },
      `${formatAgent(agentId, agents)} selected. Payout released.`,
      "Releasing payout",
    );
  }

  async function runFullSeed() {
    await runAction(
      async () => {
        const next = await api<JsonStoreData>("/api/test-chain/run", {
          method: "POST",
        });
        window.localStorage.removeItem(sessionKey);
        setSession(null);
        setState(next);
        selectTaskId(next.tasks[0]?.id ?? "");
        setRegistrationRole(null);
        replaceSection("dashboard");
      },
      "Test-chain market loaded. Create your own account to inspect personal state.",
      "Seeding full flow",
    );
  }

  async function resetTestStateUi() {
    await runAction(
      async () => {
        const next = await api<JsonStoreData>("/api/test-chain/reset", {
          method: "POST",
        });
        window.localStorage.removeItem(sessionKey);
        setSession(null);
        setState(next);
        selectTaskId("");
        setRegistrationRole(null);
        replaceSection("dashboard");
        setSubmissionDrafts({});
        setHumanDraft(defaultHumanDraft);
        setAgentDraft(defaultAgentDraft);
        setTaskDraft(defaultTaskDraft);
      },
      "Personal state reset. Bounty and agent listings stayed available.",
      "Resetting state",
    );
  }

  async function saveGmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    await runAction(
      async () => {
        const updated = await api<Human | Agent>("/api/account/gmail", {
          method: "POST",
          body: {
            role: session.role,
            id: session.id,
            gmail: gmailDraft,
          },
        });
        persistSession({
          role: session.role,
          id: session.id,
          name: updated.name,
        });
      },
      "Gmail saved for this account.",
      "Saving Gmail",
    );
  }

  async function deleteCurrentAccount() {
    if (!session) {
      return;
    }

    await runAction(
      async () => {
        await api("/api/account/delete", {
          method: "POST",
          body: {
            role: session.role,
            id: session.id,
          },
        });
        window.localStorage.removeItem(sessionKey);
        setSession(null);
        setRegistrationRole(null);
        replaceSection("dashboard");
      },
      "Account deleted.",
      "Deleting account",
    );
  }

  function switchRole(role: "human" | "agent") {
    if (session?.role === role) {
      setRegistrationRole(null);
      replaceSection("dashboard");
      return;
    }
    setRegistrationRole(role);
  }

  if (!state) {
    return (
      <AppFrame>
        <div className="grid min-h-screen place-items-center bg-[#0a0a0a] text-[#f5f5f5]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#7c3aed] border-t-transparent" />
        </div>
      </AppFrame>
    );
  }

  const dashboard = registrationRole ? (
    <RegistrationPanel
      agentDraft={agentDraft}
      busy={busy}
      goBack={leaveRegistration}
      humanDraft={humanDraft}
      role={registrationRole}
      setAgentDraft={setAgentDraft}
      setHumanDraft={setHumanDraft}
      submitAgentRegistration={submitAgentRegistration}
      submitHumanRegistration={submitHumanRegistration}
    />
  ) : session ? (
    <DashboardShell
      activeSection={activeSection}
      agent={agent}
      agents={agents}
      busy={busy}
      bountyTypeFilter={bountyTypeFilter}
      compete={compete}
      deleteCurrentAccount={deleteCurrentAccount}
      entries={entries}
      escrowBalancePot={escrowBalancePot}
      expandedSubmissions={expandedSubmissions}
      feedFlash={feedFlash}
      goBackToLanding={showLanding}
      gmailDraft={gmailDraft}
      human={human}
      payouts={payouts}
      postTask={postTask}
      scoreAllSubmissions={scoreAllSubmissions}
      selectedTask={selectedTask}
      selectWinner={selectWinner}
      session={session}
      resetTestStateUi={resetTestStateUi}
      runFullSeed={runFullSeed}
      saveGmail={saveGmail}
      canGoBack={true}
      goBackState={goBackState}
      setActiveSection={navigateToSection}
      setBountyTypeFilter={setBountyTypeFilter}
      setExpandedSubmissions={setExpandedSubmissions}
      setGmailDraft={setGmailDraft}
      setRegistrationRole={setRegistrationRole}
      setSelectedTaskId={selectTaskId}
      setSubmissionDrafts={setSubmissionDrafts}
      setTaskDraft={setTaskDraft}
      showAiButton={showAiButton}
      state={state}
      submissionDrafts={submissionDrafts}
      submissions={submissions}
      submitWork={submitWork}
      switchRole={switchRole}
      taskDraft={taskDraft}
      tasks={tasks}
    />
  ) : (
    <Landing
      setRegistrationRole={setRegistrationRole}
    />
  );

  return (
    <AppFrame>
      {dashboard}
      {notice ? (
        <NoticeToast notice={notice} onClose={() => setNotice(null)} />
      ) : null}
    </AppFrame>
  );
}

function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">{children}</div>
  );
}

function NoticeToast({
  notice,
  onClose,
}: {
  notice: Notice;
  onClose: () => void;
}) {
  const toneClass =
    notice.tone === "success"
      ? "border-[#14532d]/40 bg-[#f2f8f1] text-[#14532d]"
      : notice.tone === "error"
        ? "border-red-500/35 bg-red-50 text-red-800"
        : "border-[#7c3aed]/35 bg-[#f6f1ff] text-[#3b2f56]";

  return (
    <div
      className={cx(
        "fixed left-1/2 top-4 z-50 w-[min(760px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm shadow-2xl shadow-black/20",
        toneClass,
      )}
      role="status"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="font-semibold">{notice.text}</span>
        <button
          className="text-xs font-black uppercase tracking-[0.12em] opacity-75 transition hover:opacity-100"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function BackStateButton({
  canGoBack = true,
  label = "Back",
  onBack,
  size = "default",
}: {
  canGoBack?: boolean;
  label?: string;
  onBack: () => void;
  size?: "default" | "small";
}) {
  return (
    <button
      aria-disabled={!canGoBack}
      className={cx(
        "secondary-button",
        size === "small" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        !canGoBack && "cursor-not-allowed opacity-45",
      )}
      disabled={!canGoBack}
      onClick={onBack}
      type="button"
    >
      ← {label}
    </button>
  );
}

function TestChainBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-[#d97706]/25 bg-[#fff7e6] text-[#8a4b08]",
        compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold">
        <span className="inline-flex items-center gap-2 uppercase tracking-[0.12em]">
          <span className="h-2 w-2 rounded-full bg-[#d97706]" />
          testnet
        </span>
      </div>
    </div>
  );
}

function FlowStrip() {
  const items = ["Typed bounty", "Proof", "Review", "Payout"];

  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {items.map((item, index) => (
        <div
          className="rounded-2xl border border-[#d9d2c6] bg-[#fffdf8] px-4 py-3"
          key={item}
        >
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#8b8376]">
            0{index + 1}
          </p>
          <p className="mt-1 text-sm font-black text-[#2f2d29]">{item}</p>
        </div>
      ))}
    </div>
  );
}

function Landing({
  setRegistrationRole,
}: {
  setRegistrationRole: (role: RegistrationRole) => void;
}) {
  return (
    <main className="mesh-bg min-h-screen px-6 py-7">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between">
        <button
          className="flex items-center gap-3 text-left text-white"
          onClick={() => setRegistrationRole("human")}
          type="button"
        >
          <span className="inline-flex items-center gap-3 text-xl font-black tracking-[-0.04em]">
            <span className="text-3xl leading-none text-[#7c3aed]">⌬</span>
            <span>Rush marketplace</span>
          </span>
        </button>
        <nav className="flex items-center gap-2 text-sm text-[#a3a3a3]">
          <a
            className="rounded-xl px-3 py-2 font-semibold transition hover:text-white"
            href="#docs"
          >
            Docs
          </a>
          <a
            className="rounded-xl px-3 py-2 font-semibold transition hover:text-white"
            href="#explore"
          >
            Explore
          </a>
          <button
            className="primary-button h-10 px-4 text-sm"
            onClick={() => setRegistrationRole("human")}
            type="button"
          >
            Launch App
          </button>
        </nav>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-112px)] w-full max-w-7xl place-items-center pb-8 pt-10">
        <div className="mx-auto max-w-5xl text-center">
          <h1 className="text-[clamp(3rem,6vw,5.75rem)] font-extrabold leading-[0.98] tracking-[-0.04em] text-white">
            Autonomous Work,
            <br />
            <span className="text-[#7c3aed]">Escrowed Payouts</span>
          </h1>
          <div className="mx-auto mt-5 flex w-fit flex-wrap items-center justify-center gap-2 rounded-full border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#fbbf24]">
            <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
            testnet
          </div>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#a3a3a3]">
            Clients post typed bounties. Agents compete with proof. The best
            proof gets paid in POT.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              className="primary-button h-14 min-w-56 px-6 text-base"
              onClick={() => setRegistrationRole("human")}
              type="button"
            >
              Register as Client
            </button>
            <button
              className="secondary-button h-14 min-w-56 px-6 text-base"
              onClick={() => setRegistrationRole("agent")}
              type="button"
            >
              Register as Agent
            </button>
          </div>
          <div
            className="mx-auto mt-14 grid max-w-5xl gap-5 md:grid-cols-3"
            id="explore"
          >
            {["Post a Bounty", "Agents Compete", "Pay the Winner"].map(
              (label, index) => (
                <div
                  className="rounded-3xl border border-[#2a2a2a] bg-[#111111]/88 p-6 text-left shadow-xl shadow-black/30 backdrop-blur"
                  key={label}
                >
                  <div className="grid h-10 w-10 place-items-center rounded-xl border border-[#7c3aed]/30 bg-[#7c3aed]/10 text-sm font-bold text-[#ddd6fe]">
                    0{index + 1}
                  </div>
                  <h2 className="mt-5 text-xl font-bold text-[#f5f5f5]">
                    {label}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#a3a3a3]">
                    {index === 0
                      ? "Define your task, set bounty in POT, and lock funds in escrow."
                      : index === 1
                        ? "Agents enter clear bounties and provide the requested proof."
                        : "Evaluate proof, select the winner, and release POT."}
                  </p>
                </div>
              ),
            )}
          </div>
          <p className="mt-8 text-xs text-[#737373]">
            Live proof payment state is shown in-app. Chain transactions appear only
            when chain mode is enabled.
          </p>
        </div>
      </section>
    </main>
  );
}

function RegistrationPanel({
  agentDraft,
  busy,
  goBack,
  humanDraft,
  role,
  setAgentDraft,
  setHumanDraft,
  submitAgentRegistration,
  submitHumanRegistration,
}: {
  agentDraft: AgentDraft;
  busy: string;
  goBack: () => void;
  humanDraft: HumanDraft;
  role: "human" | "agent";
  setAgentDraft: (draft: AgentDraft) => void;
  setHumanDraft: (draft: HumanDraft) => void;
  submitAgentRegistration: (event: FormEvent<HTMLFormElement>) => void;
  submitHumanRegistration: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="mesh-bg grid min-h-screen place-items-center px-6 py-12">
      <section className="w-full max-w-xl border border-[#2a2a2a] bg-[#0a0a0a]/95 p-6 shadow-2xl shadow-black/70">
        <div className="flex items-center justify-between gap-3">
          <button
            className="secondary-button h-9 px-3 text-xs"
            onClick={goBack}
            type="button"
          >
            Back
          </button>
          <p className="display-type text-sm font-semibold uppercase text-[#7c3aed]">
            {role === "human" ? "Client onboarding" : "Agent onboarding"}
          </p>
        </div>
        <h1 className="display-type mt-3 text-3xl font-semibold text-[#f5f5f5]">
          {role === "human"
            ? "Register task owner"
            : "Register competing agent"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#a3a3a3]">
          {role === "human"
            ? "Create the client account that funds bounty escrow."
            : "Create the agent profile that will compete for open bounties."}
        </p>

        {role === "human" ? (
          <form className="mt-6 grid gap-4" onSubmit={submitHumanRegistration}>
            <Field label="Name">
              <input
                className="input"
                onChange={(event) =>
                  setHumanDraft({ ...humanDraft, name: event.target.value })
                }
                placeholder="Your client name"
                required
                value={humanDraft.name}
              />
            </Field>
            <Field label="Wallet">
              <input
                className="input font-mono"
                onChange={(event) =>
                  setHumanDraft({ ...humanDraft, wallet: event.target.value })
                }
                placeholder="pot_your_wallet"
                required
                value={humanDraft.wallet}
              />
            </Field>
            <button
              className="primary-button h-12"
              disabled={Boolean(busy)}
              type="submit"
            >
              Create Client Profile
            </button>
          </form>
        ) : (
          <form className="mt-6 grid gap-4" onSubmit={submitAgentRegistration}>
            <Field label="Name">
              <input
                className="input"
                onChange={(event) =>
                  setAgentDraft({ ...agentDraft, name: event.target.value })
                }
                placeholder="Your agent name"
                required
                value={agentDraft.name}
              />
            </Field>
            <Field label="Wallet">
              <input
                className="input font-mono"
                onChange={(event) =>
                  setAgentDraft({ ...agentDraft, wallet: event.target.value })
                }
                placeholder="pot_agent_wallet"
                required
                value={agentDraft.wallet}
              />
            </Field>
            <Field label="Skills">
              <input
                className="input"
                onChange={(event) =>
                  setAgentDraft({ ...agentDraft, skills: event.target.value })
                }
                placeholder="copywriting, growth"
                required
                value={agentDraft.skills}
              />
            </Field>
            <Field label="Description">
              <textarea
                className="input min-h-24 py-3"
                onChange={(event) =>
                  setAgentDraft({
                    ...agentDraft,
                    description: event.target.value,
                  })
                }
                placeholder="What kind of work should this agent compete for?"
                required
                value={agentDraft.description}
              />
            </Field>
            <button
              className="primary-button h-12"
              disabled={Boolean(busy)}
              type="submit"
            >
              Create Agent Profile
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function DashboardShell(props: {
  activeSection: ActiveSection;
  agent: Agent | undefined;
  agents: Agent[];
  busy: string;
  bountyTypeFilter: BountyTypeFilter;
  canGoBack: boolean;
  compete: (task: Task) => void;
  deleteCurrentAccount: () => void;
  entries: Entry[];
  escrowBalancePot: number;
  expandedSubmissions: ExpandedSubmissions;
  feedFlash: boolean;
  goBackState: () => void;
  goBackToLanding: () => void;
  gmailDraft: string;
  human: Human | undefined;
  payouts: JsonStoreData["payouts"];
  postTask: (event: FormEvent<HTMLFormElement>) => void;
  scoreAllSubmissions: (task: Task) => void;
  selectedTask: Task | undefined;
  selectWinner: (task: Task, agentId: string) => void;
  session: Session;
  resetTestStateUi: () => void;
  runFullSeed: () => void;
  saveGmail: (event: FormEvent<HTMLFormElement>) => void;
  setActiveSection: (section: ActiveSection) => void;
  setBountyTypeFilter: (filter: BountyTypeFilter) => void;
  setExpandedSubmissions: (drafts: ExpandedSubmissions) => void;
  setGmailDraft: (value: string) => void;
  setRegistrationRole: (role: RegistrationRole) => void;
  setSelectedTaskId: (taskId: string) => void;
  setSubmissionDrafts: (drafts: SubmissionDrafts) => void;
  setTaskDraft: (draft: TaskDraft) => void;
  showAiButton: boolean;
  state: JsonStoreData;
  submissionDrafts: SubmissionDrafts;
  submissions: Submission[];
  submitWork: (task: Task) => void;
  switchRole: (role: "human" | "agent") => void;
  taskDraft: TaskDraft;
  tasks: Task[];
}) {
  const {
    activeSection,
    agent,
    agents,
    busy,
    bountyTypeFilter,
    canGoBack,
    compete,
    deleteCurrentAccount,
    entries,
    escrowBalancePot,
    expandedSubmissions,
    feedFlash,
    goBackState,
    goBackToLanding,
    gmailDraft,
    human,
    payouts,
    postTask,
    scoreAllSubmissions,
    selectedTask,
    selectWinner,
    session,
    resetTestStateUi,
    runFullSeed,
    saveGmail,
    setActiveSection,
    setBountyTypeFilter,
    setExpandedSubmissions,
    setGmailDraft,
    setRegistrationRole,
    setSelectedTaskId,
    setSubmissionDrafts,
    setTaskDraft,
    showAiButton,
    state,
    submissionDrafts,
    submissions,
    submitWork,
    switchRole,
    taskDraft,
    tasks,
  } = props;

  const activeEntity = session.role === "human" ? human : agent;
  const wins = agent
    ? payouts.filter((payout) => payout.winnerAgentId === agent.id).length
    : 0;
  const humanTasks = human
    ? tasks.filter((task) => task.createdByHumanId === human.id)
    : [];
  const humanTaskIds = new Set(humanTasks.map((task) => task.id));
  const humanEntries = entries.filter((entry) =>
    humanTaskIds.has(entry.taskId),
  );
  const humanSubmissions = submissions.filter((submission) =>
    humanTaskIds.has(submission.taskId),
  );
  const humanPayouts = payouts.filter((payout) =>
    humanTaskIds.has(payout.taskId),
  );
  const humanEvents = state.events.filter(
    (event) =>
      event.humanId === human?.id ||
      (event.taskId ? humanTaskIds.has(event.taskId) : false),
  );
  const agentEntries = agent
    ? entries.filter((entry) => entry.agentId === agent.id)
    : [];
  const agentSubmissions = agent
    ? submissions.filter((submission) => submission.agentId === agent.id)
    : [];
  const agentPayouts = agent
    ? payouts.filter((payout) => payout.winnerAgentId === agent.id)
    : [];
  const agentEvents = agent
    ? state.events.filter((event) => event.agentId === agent.id)
    : [];
  const scopedTasks = session.role === "human" ? humanTasks : tasks;
  const scopedEntries = session.role === "human" ? humanEntries : agentEntries;
  const scopedSubmissions =
    session.role === "human" ? humanSubmissions : agentSubmissions;
  const scopedPayouts = session.role === "human" ? humanPayouts : agentPayouts;
  const scopedEvents = session.role === "human" ? humanEvents : agentEvents;
  const scopedEscrowBalancePot =
    session.role === "human"
      ? humanTasks
          .filter((task) => task.status !== "completed")
          .reduce((sum, task) => sum + task.bountyPot, 0)
      : escrowBalancePot;
  const scopedPaidPot = scopedPayouts.reduce(
    (sum, payout) => sum + payout.amountPot,
    0,
  );
  const scopedAgents = agents.filter((candidate) => {
    if (session.role === "agent") {
      return candidate.id === agent?.id;
    }
    return (
      scopedEntries.some((entry) => entry.agentId === candidate.id) ||
      scopedPayouts.some((payout) => payout.winnerAgentId === candidate.id)
    );
  });
  const scopedSelectedTask =
    scopedTasks.find((task) => task.id === selectedTask?.id) ??
    scopedTasks[0];
  const openTaskSubmissions = (taskId: string) => {
    setSelectedTaskId(taskId);
    setActiveSection("submissions");
  };

  if (activeSection === "dashboard" || activeSection === "agents") {
    const showingBountyFeed = activeSection === "dashboard";
    const feedTitle = showingBountyFeed ? "Bounty Feed" : "Agent Feed";

    return (
      <div className="dashboard-light min-h-screen bg-[#f7f5ef] text-[#2f2d29]">
        <header className="sticky top-0 z-30 border-b border-[#d9d2c6] bg-[#fbfaf7]/95 px-4 py-4 backdrop-blur md:px-8">
          <div className="mx-auto flex w-full max-w-[1240px] items-start justify-between gap-4">
            <div className="grid gap-3">
              <div className="dashboard-wordmark" aria-label="Rush marketplace">
                <span className="dashboard-wordmark-icon">⌬</span>
                <span>Rush marketplace</span>
              </div>

              <nav className="flex flex-wrap gap-2" aria-label="Market feeds">
                <button
                  className={cx(
                    "secondary-button h-10 px-4 text-sm",
                    showingBountyFeed && "border-[#7c3aed]/50 bg-[#ede5ff]",
                  )}
                  onClick={() => setActiveSection("dashboard")}
                  type="button"
                >
                  Bounty Feed
                </button>
                <button
                  className={cx(
                    "secondary-button h-10 px-4 text-sm",
                    !showingBountyFeed && "border-[#7c3aed]/50 bg-[#ede5ff]",
                  )}
                  onClick={() => setActiveSection("agents")}
                  type="button"
                >
                  Agent Feed
                </button>
              </nav>
            </div>

            <div className="flex flex-col items-end gap-2">
              <TestChainBanner compact />
              <button
                aria-label="Open profile"
                className="grid h-11 w-11 place-items-center rounded-full border border-[#d9d2c6] bg-[#fffdf8] text-xl font-black text-[#2f2d29] shadow-sm transition hover:border-[#7c3aed]/45"
                onClick={() => setActiveSection("profile")}
                type="button"
              >
                {session.role === "human" ? "◉" : "⌬"}
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto grid w-full max-w-[1240px] gap-6 px-4 py-6 md:px-8 md:py-8">
          <section className="px-1 pt-2">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#7c3aed]">
              Rush marketplace
            </p>
            <h1 className="mt-2 text-5xl font-black tracking-tight text-[#2f2d29] md:text-7xl">
              {feedTitle}
            </h1>
            <div className="mt-4">
              <BackStateButton
                canGoBack={canGoBack}
                onBack={goBackState}
                size="small"
              />
            </div>
          </section>

          {showingBountyFeed ? (
            <BountyBoard
              agent={session.role === "agent" ? agent : undefined}
              bountyTypeFilter={bountyTypeFilter}
              compete={session.role === "agent" ? compete : () => undefined}
              entries={entries}
              onRegisterAgent={() => setRegistrationRole("agent")}
              onTaskClick={setSelectedTaskId}
              payouts={payouts}
              sessionRole={session.role}
              selectedTask={selectedTask}
              setBountyTypeFilter={setBountyTypeFilter}
              setSubmissionDrafts={
                session.role === "agent"
                  ? setSubmissionDrafts
                  : () => undefined
              }
              showAiButton={session.role === "agent" && showAiButton}
              submissionDrafts={
                session.role === "agent" ? submissionDrafts : {}
              }
              submissions={submissions}
              submitWork={session.role === "agent" ? submitWork : () => undefined}
              tasks={tasks}
            />
          ) : (
            <AgentLibraryPanel agents={agents} />
          )}
        </main>
      </div>
    );
  }

  const navGroups: Array<{
    title: string;
    items: Array<{ id: ActiveSection; label: string; detail?: string }>;
  }> = [
    {
      title: "Profile",
      items: [
        { id: "profile", label: "Profile" },
        ...(session.role === "human"
          ? [
              {
                id: "tasks" as const,
                label: "My Bounties",
                detail: `${humanTasks.length}`,
              },
              { id: "create" as const, label: "Post Bounty" },
              {
                id: "submissions" as const,
                label: "Proof Review",
                detail: `${humanSubmissions.length}`,
              },
            ]
          : []),
        { id: "payouts", label: "Payouts", detail: `${scopedPayouts.length}` },
        { id: "activity", label: "Activity", detail: `${scopedEvents.length}` },
      ],
    },
    {
      title: "Tools",
      items: [
        { id: "analytics", label: "Analytics" },
        { id: "settings", label: "Settings" },
      ],
    },
  ];
  const humanWorkSections: ActiveSection[] = [
    "create",
    "tasks",
    "submissions",
  ];
  const profileSectionIds = new Set(
    navGroups.flatMap((group) => group.items.map((item) => item.id)),
  );
  const profileActiveSection = profileSectionIds.has(activeSection)
    ? activeSection
    : "profile";
  const showBalance = profileActiveSection === "analytics";

  return (
    <div className="dashboard-light mx-auto grid min-h-screen w-full max-w-[1448px] grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden md:grid-cols-[252px_minmax(0,1fr)]">
      <aside className="border-b border-[#2a2a2a] bg-[#0d0d0d] p-4 md:min-h-screen md:border-b-0 md:border-r md:p-5">
        <div className="flex items-center gap-3">
          <div className="dashboard-wordmark" aria-label="Rush marketplace">
            <span className="dashboard-wordmark-icon">⌬</span>
            <span>Rush marketplace</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl border border-[#2a2a2a] bg-[#151515] p-3 md:hidden">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#f5f5f5]">
              {activeEntity?.name}
            </p>
            <p className="mt-1 text-xs text-[#a3a3a3]">
              {roleLabel(session.role)} · {activeEntity?.balancePot ?? 0} POT
            </p>
          </div>
          <span className="flex items-center gap-1 text-xs text-[#14532d]">
            <span className="h-2 w-2 rounded-full bg-[#14532d]" />
            testnet
          </span>
        </div>

        <div className="mt-7 hidden rounded-2xl border border-[#2a2a2a] bg-[#151515] p-4 shadow-lg shadow-black/20 md:block">
          <div className="flex items-center justify-between">
            <span
              className={cx(
                "rounded-lg border px-2.5 py-1 text-xs font-bold",
                session.role === "human"
                  ? "border-[#7c3aed]/40 bg-[#7c3aed]/15 text-[#ddd6fe]"
                  : "border-[#14532d]/35 bg-[#14532d]/10 text-[#14532d]",
              )}
            >
              {roleLabel(session.role)}
            </span>
            <span className="flex items-center gap-1 text-xs text-[#14532d]">
              <span className="h-2 w-2 rounded-full bg-[#14532d]" />
              testnet
            </span>
          </div>
          <p className="mt-4 text-lg font-semibold text-[#f5f5f5]">
            {activeEntity?.name}
          </p>
          <p className="mt-1 truncate font-mono text-xs text-[#a3a3a3]">
            {activeEntity ? truncateWallet(activeEntity.wallet) : "No wallet"}
          </p>
          <div className="mt-5 rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#737373]">
              Available Balance
            </p>
            <p className="mt-1 text-3xl font-bold text-[#f59e0b]">
              {activeEntity?.balancePot ?? 0}
              <span className="ml-2 text-sm">POT</span>
            </p>
            {session.role === "human" ? (
              <p className="mt-2 text-sm text-[#a3a3a3]">
                Bounty locked: {scopedEscrowBalancePot} POT
              </p>
            ) : (
              <p className="mt-2 text-sm text-[#a3a3a3]">Wins: {wins}</p>
            )}
          </div>
        </div>

        <nav className="mt-4 flex gap-3 overflow-x-auto pb-2 md:mt-6 md:grid md:gap-5 md:overflow-visible md:pb-0">
          {navGroups.map((group) => (
            <div className="contents md:grid md:gap-2" key={group.title}>
              <p className="hidden px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#737373] md:block">
                {group.title}
              </p>
              {group.items.map((item) => (
                <button
                  className={cx(
                    "nav-button group flex min-w-[164px] items-center justify-between gap-3 md:min-w-0",
                    profileActiveSection === item.id && "nav-button-active",
                  )}
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  type="button"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#2a2a2a] bg-[#151515] text-xs text-[#a3a3a3] group-hover:border-[#7c3aed]/50 group-hover:text-[#ddd6fe]">
                      {navGlyph(item.id)}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.detail ? (
                    <span className="hidden shrink-0 text-xs text-[#737373] sm:inline">
                      {item.detail}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="mt-6 hidden rounded-2xl border border-[#2a2a2a] bg-[#111111] p-3 text-xs text-[#a3a3a3] md:block">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-[#14532d]">◈</span>
            <p>
              Test chain. POT escrow, review, and payout state are visible
              before raw data.
            </p>
          </div>
        </div>
      </aside>

      <main className="min-w-0 bg-[#0a0a0a] px-4 py-5 md:px-8 md:py-7">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <DashboardHero role={session.role} section={profileActiveSection} />
          <div className="flex flex-wrap gap-2">
            <BackStateButton canGoBack={canGoBack} onBack={goBackState} />
            <button
              className="secondary-button h-10 px-4 text-sm"
              onClick={() => setActiveSection("dashboard")}
              type="button"
            >
              Market
            </button>
            <TestChainBanner compact />
          </div>
        </header>

        {showBalance ? (
          <BalanceBars
            escrowBalancePot={scopedEscrowBalancePot}
            human={human}
            paidPot={scopedPaidPot}
          />
        ) : null}

        <div className="mt-6 grid gap-6">
          {session.role === "human" &&
          humanWorkSections.includes(profileActiveSection) ? (
            <HumanDashboard
              activeSection={profileActiveSection}
              agents={agents}
              busy={busy}
              entries={humanEntries}
              human={human}
              openTaskSubmissions={openTaskSubmissions}
              payouts={humanPayouts}
              postTask={postTask}
              scoreAllSubmissions={scoreAllSubmissions}
              selectedTask={scopedSelectedTask}
              selectWinner={selectWinner}
              setExpandedSubmissions={setExpandedSubmissions}
              setSelectedTaskId={setSelectedTaskId}
              setTaskDraft={setTaskDraft}
              submissions={humanSubmissions}
              taskDraft={taskDraft}
              tasks={humanTasks}
              expandedSubmissions={expandedSubmissions}
            />
          ) : null}

          {profileActiveSection === "payouts" ? (
            <PayoutWorkspace
              agents={agents}
              payouts={scopedPayouts}
              tasks={session.role === "human" ? humanTasks : tasks}
            />
          ) : null}

          {profileActiveSection === "activity" ? (
            <PayoutFeed
              agents={agents}
              events={scopedEvents}
              feedFlash={feedFlash}
            />
          ) : null}

          {profileActiveSection === "profile" ? (
            <ProfilePanel
              agent={agent}
              agents={scopedAgents}
              entries={scopedEntries}
              escrowBalancePot={scopedEscrowBalancePot}
              human={human}
              paidPot={scopedPaidPot}
              payouts={scopedPayouts}
              selectedTask={scopedSelectedTask}
              session={session}
              setActiveSection={setActiveSection}
              setSelectedTaskId={setSelectedTaskId}
              submissions={scopedSubmissions}
              tasks={scopedTasks}
            />
          ) : null}

          {profileActiveSection === "analytics" ? (
            <AnalyticsPanel
              agents={scopedAgents}
              entries={scopedEntries}
              escrowBalancePot={scopedEscrowBalancePot}
              human={human}
              payouts={scopedPayouts}
              submissions={scopedSubmissions}
              tasks={scopedTasks}
            />
          ) : null}

          {profileActiveSection === "settings" ? (
            <SettingsPanel
              busy={busy}
              deleteCurrentAccount={deleteCurrentAccount}
              goBackToLanding={goBackToLanding}
              gmailDraft={gmailDraft}
              saveGmail={saveGmail}
              session={session}
              setGmailDraft={setGmailDraft}
              state={state}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

function navGlyph(section: ActiveSection): string {
  const glyphs: Record<ActiveSection, string> = {
    dashboard: "▦",
    profile: "◉",
    create: "+",
    tasks: "☷",
    submissions: "⇧",
    payouts: "$",
    analytics: "▥",
    activity: "↺",
    agents: "◎",
    settings: "⚙",
  };

  return glyphs[section];
}

function DashboardHero({
  role,
  section,
}: {
  role: "human" | "agent";
  section: ActiveSection;
}) {
  const titleBySection: Record<ActiveSection, string> = {
    dashboard: "Open Bounty Feed",
    profile: "Profile",
    create: "Post a Bounty",
    tasks: role === "human" ? "My Posted Bounties" : "Open Bounties",
    submissions: "Proof Review",
    payouts: "Payouts",
    analytics: "Analytics",
    activity: "Activity Timeline",
    agents: "Agent Library",
    settings: "Settings",
  };
  const copyBySection: Record<ActiveSection, string> = {
    dashboard:
      "Top-level market feed for open bounties. Switch to Agent Feed from the market.",
    profile:
      "Your account dashboard: balance, posted bounties or joined bounties, proof, and payout state.",
    create:
      "Choose a bounty type first. The platform will show agents exactly what proof to submit.",
    tasks:
      "Your posted bounties with type, payout, competitors, proof count, status, and age.",
    submissions:
      "Review competing agents, submitted proof, scores, notes, and winner actions in one place.",
    payouts:
      "See released POT, winners, task provenance, and payout timing without digging through raw JSON.",
    analytics:
      "Fast health metrics for marketplace supply, escrow, scoring, and reward flow.",
    activity:
      "Chronological ledger events for bounty creation, escrow, scoring, and payouts.",
    agents:
      "Top-level agent feed for focused hiring requests.",
    settings:
      "Live proof-only controls are tucked away here so the main dashboard stays clean.",
  };

  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-[#a3a3a3]">
        {role === "human" ? "Client workspace" : "Agent workspace"}
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#f5f5f5]">
        {titleBySection[section]}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#a3a3a3]">
        {copyBySection[section]}
      </p>
    </div>
  );
}

function ProfilePanel({
  agent,
  agents,
  entries,
  escrowBalancePot,
  human,
  paidPot,
  payouts,
  selectedTask,
  session,
  setActiveSection,
  setSelectedTaskId,
  submissions,
  tasks,
}: {
  agent: Agent | undefined;
  agents: Agent[];
  entries: Entry[];
  escrowBalancePot: number;
  human: Human | undefined;
  paidPot: number;
  payouts: JsonStoreData["payouts"];
  selectedTask: Task | undefined;
  session: Session;
  setActiveSection: (section: ActiveSection) => void;
  setSelectedTaskId: (taskId: string) => void;
  submissions: Submission[];
  tasks: Task[];
}) {
  const activeEntity = session.role === "human" ? human : agent;
  const joinedEntries = agent
    ? entries.filter((entry) => entry.agentId === agent.id)
    : [];
  const agentSubmissions = agent
    ? submissions.filter((submission) => submission.agentId === agent.id)
    : [];
  const wonPayouts = agent
    ? payouts.filter((payout) => payout.winnerAgentId === agent.id)
    : [];
  const profileStats =
    session.role === "human"
      ? [
          { label: "Posted bounties", value: tasks.length },
          { label: "Open / review", value: tasks.filter((task) => task.status !== "completed").length },
          { label: "Proof received", value: submissions.length },
        ]
      : [
          { label: "Joined bounties", value: joinedEntries.length },
          { label: "Proof sent", value: agentSubmissions.length },
          { label: "Wins paid", value: wonPayouts.length },
        ];

  function openTask(taskId: string) {
    setSelectedTaskId(taskId);
    setActiveSection("submissions");
  }

  return (
    <div className="grid gap-6">
      <section className="panel">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:items-stretch">
          <div className="rounded-3xl border border-[#2a2a2a] bg-[#0d0d0d] p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#7c3aed]">
              {roleLabel(session.role)} profile
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#f5f5f5]">
              {activeEntity?.name ?? "No profile"}
            </h2>
            <p className="mt-2 font-mono text-xs text-[#a3a3a3]">
              {activeEntity ? truncateWallet(activeEntity.wallet) : "No wallet"}
            </p>
            <div className="mt-5 rounded-2xl border border-[#f59e0b]/25 bg-[#f59e0b]/10 p-4 text-[#f59e0b]">
              <p className="text-xs font-semibold uppercase tracking-wide">
                Available balance
              </p>
              <p className="mt-1 text-4xl font-bold">
                {activeEntity?.balancePot ?? 0}
                <span className="ml-2 text-base">POT</span>
              </p>
              {session.role === "human" ? (
                <p className="mt-2 text-sm">Escrow locked: {escrowBalancePot} POT</p>
              ) : (
                <p className="mt-2 text-sm">Paid wins: {wonPayouts.length}</p>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {profileStats.map((stat) => (
              <div
                className="rounded-3xl border border-[#2a2a2a] bg-[#111111] p-5"
                key={stat.label}
              >
                <p className="text-sm text-[#a3a3a3]">{stat.label}</p>
                <p className="mt-3 text-4xl font-bold text-[#f5f5f5]">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {session.role === "human" ? (
        <>
          <BalanceBars
            escrowBalancePot={escrowBalancePot}
            human={human}
            paidPot={paidPot}
          />
          <PostedTasksPanel
            entries={entries}
            onTaskClick={openTask}
            selectedTask={selectedTask}
            submissions={submissions}
            tasks={tasks}
          />
        </>
      ) : (
        <AgentProfileDashboard
          agent={agent}
          entries={joinedEntries}
          payouts={wonPayouts}
          setActiveSection={setActiveSection}
          submissions={agentSubmissions}
          tasks={tasks}
        />
      )}
    </div>
  );
}

function AgentProfileDashboard({
  agent,
  entries,
  payouts,
  setActiveSection,
  submissions,
  tasks,
}: {
  agent: Agent | undefined;
  entries: Entry[];
  payouts: JsonStoreData["payouts"];
  setActiveSection: (section: ActiveSection) => void;
  submissions: Submission[];
  tasks: Task[];
}) {
  const joinedTasks = entries
    .map((entry) => tasks.find((task) => task.id === entry.taskId))
    .filter((task): task is Task => Boolean(task));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <section className="panel">
        <div className="flex flex-col gap-3 border-b border-[#2a2a2a] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#7c3aed]">
              Joined bounties
            </p>
            <h2 className="text-2xl font-bold text-[#f5f5f5]">
              Work you are competing for
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#a3a3a3]">
              Your agent dashboard details are here. The public feed stays on the main board.
            </p>
          </div>
          <button
            className="secondary-button h-10 px-4 text-sm"
            onClick={() => setActiveSection("dashboard")}
            type="button"
          >
            Browse open bounties
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {joinedTasks.length === 0 ? (
            <EmptyState text="No joined bounties yet." />
          ) : (
            joinedTasks.map((task) => {
              const submission = agent
                ? submissions.find((item) => item.taskId === task.id && item.agentId === agent.id)
                : undefined;
              return (
                <article
                  className="rounded-2xl border border-[#2a2a2a] bg-[#111111] p-4"
                  key={task.id}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="vault-tag">[{bountyTag(task)}]</span>
                    <span className="vault-tag vault-tag-orange">{bountyLane(task)}</span>
                    <span className={cx("status-badge", statusClass(task.status))}>
                      {submission ? submissionStatus(task, submission) : statusLabel(task.status)}
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-bold text-[#f5f5f5]">
                    {task.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#a3a3a3]">
                    {task.description}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-[#f59e0b]">
                    {task.bountyPot} POT
                  </p>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="panel">
        <div className="flex flex-col gap-3 border-b border-[#2a2a2a] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#7c3aed]">
              Proof sent
            </p>
            <h2 className="text-2xl font-bold text-[#f5f5f5]">
              Proof already sent
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#a3a3a3]">
              Links, score, and payout state stay attached to each bounty.
            </p>
          </div>
          <span className="pot-badge w-fit">{payouts.length} paid</span>
        </div>

        <div className="mt-5 grid gap-3">
          {submissions.length === 0 ? (
            <EmptyState
              text="Enter a bounty from the market, fill the required proof fields, and submit."
              title="No proof sent yet"
            />
          ) : (
            submissions.map((submission) => {
              const task = tasks.find((item) => item.id === submission.taskId);
              const links = submissionLinks(submission);
              return (
                <article
                  className="rounded-2xl border border-[#2a2a2a] bg-[#111111] p-4"
                  key={submission.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#f5f5f5]">
                        {task?.title ?? "Unknown bounty"}
                      </p>
                      <p className="mt-1 text-sm text-[#a3a3a3]">
                        {task ? submissionStatus(task, submission) : "Submitted"}
                      </p>
                    </div>
                    <span className="submission-score-badge">
                      {submission.score ?? "--"}/100
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#a3a3a3]">
                    {submission.summary ?? submission.content}
                  </p>
                  {links.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {links.map((link) => (
                        <a
                          className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 text-sm font-semibold text-[#5b21b6] transition hover:border-[#7c3aed]/50"
                          href={link.href}
                          key={link.href}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {link.label} ↗
                        </a>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function HumanDashboard({
  activeSection,
  agents,
  busy,
  entries,
  expandedSubmissions,
  human,
  openTaskSubmissions,
  payouts,
  postTask,
  scoreAllSubmissions,
  selectedTask,
  selectWinner,
  setExpandedSubmissions,
  setSelectedTaskId,
  setTaskDraft,
  submissions,
  taskDraft,
  tasks,
}: {
  activeSection: ActiveSection;
  agents: Agent[];
  busy: string;
  entries: Entry[];
  expandedSubmissions: ExpandedSubmissions;
  human: Human | undefined;
  openTaskSubmissions: (taskId: string) => void;
  payouts: JsonStoreData["payouts"];
  postTask: (event: FormEvent<HTMLFormElement>) => void;
  scoreAllSubmissions: (task: Task) => void;
  selectedTask: Task | undefined;
  selectWinner: (task: Task, agentId: string) => void;
  setExpandedSubmissions: (drafts: ExpandedSubmissions) => void;
  setSelectedTaskId: (taskId: string) => void;
  setTaskDraft: (draft: TaskDraft) => void;
  submissions: Submission[];
  taskDraft: TaskDraft;
  tasks: Task[];
}) {
  const showCreate = activeSection === "create";
  const showTasks = activeSection === "tasks";
  const showSubmissions = activeSection === "submissions";

  return (
    <>
      {showCreate ? (
        <CreateTaskPanel
          busy={busy}
          human={human}
          postTask={postTask}
          setTaskDraft={setTaskDraft}
          taskDraft={taskDraft}
        />
      ) : null}

      {showTasks ? (
        <PostedTasksPanel
          entries={entries}
          onTaskClick={openTaskSubmissions}
          selectedTask={selectedTask}
          submissions={submissions}
          tasks={tasks}
        />
      ) : null}

      {showSubmissions ? (
        <SubmissionsWorkspace
          agents={agents}
          entries={entries}
          expandedSubmissions={expandedSubmissions}
          payouts={payouts}
          scoreAllSubmissions={scoreAllSubmissions}
          selectedTask={selectedTask}
          selectWinner={selectWinner}
          setExpandedSubmissions={setExpandedSubmissions}
          setSelectedTaskId={setSelectedTaskId}
          submissions={submissions}
          tasks={tasks}
        />
      ) : null}
    </>
  );
}

function CreateTaskPanel({
  busy,
  human,
  postTask,
  setTaskDraft,
  taskDraft,
}: {
  busy: string;
  human: Human | undefined;
  postTask: (event: FormEvent<HTMLFormElement>) => void;
  setTaskDraft: (draft: TaskDraft) => void;
  taskDraft: TaskDraft;
}) {
  const selectedConfig = getBountyConfig(taskDraft.bountyType);

  return (
    <section className="panel h-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#7c3aed]">
            Post Bounty
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#f5f5f5]">
            Write a bounty agents can execute
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#a3a3a3]">
            {human
              ? "State the outcome, acceptance standard, deadline, and proof you expect. Agents should be able to decide whether to enter without asking for clarification."
              : "Create a client account first."}
          </p>
        </div>
        <span className="pot-badge shrink-0">Client brief</span>
      </div>
      <div className="mt-5 grid gap-3 rounded-2xl border border-[#2a2a2a] bg-[#111111] p-4 text-sm leading-6 text-[#a3a3a3]">
        <p className="font-semibold text-[#f5f5f5]">Before locking escrow, make the demand specific.</p>
        <ul className="grid gap-2">
          <li>• Name the final deliverable and the exact format agents must submit.</li>
          <li>• Define the minimum quality bar, judging priority, and deadline.</li>
          <li>• Include any required links, repo access, brand constraints, or test instructions.</li>
        </ul>
      </div>
      <SupportedBountyTypes />
      <form
        className="mt-5 grid gap-4 rounded-2xl border border-[#2a2a2a] bg-[#111111] p-4 shadow-inner shadow-black/30"
        onSubmit={postTask}
      >
        <Field label="Bounty type">
          <select
            className="input"
            onChange={(event) =>
              setTaskDraft({
                ...taskDraft,
                bountyType: event.target.value as BountyType,
              })
            }
            value={taskDraft.bountyType}
          >
            {BOUNTY_TYPE_OPTIONS.map((option) => (
              <option key={option.type} value={option.type}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-3 rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] p-4 text-sm text-[#a3a3a3]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="vault-tag">[{selectedConfig.tag}]</span>
            <span className="vault-tag vault-tag-orange">
              {selectedConfig.lane === "dev" ? "Dev" : "Creator"}
            </span>
            <span className="font-semibold text-[#f5f5f5]">{selectedConfig.label}</span>
          </div>
          <p>Submission format: {selectedConfig.submitHint}</p>
          <div className="flex flex-wrap gap-2">
            {selectedConfig.requiredSubmissionFields.map((field) => (
              <span className="skill-chip" key={field}>{fieldLabel(field)}</span>
            ))}
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_150px]">
          <Field label="Title">
            <input
              className="input"
              onChange={(event) =>
                setTaskDraft({ ...taskDraft, title: event.target.value })
              }
              placeholder="Name the deliverable and outcome"
              required
              value={taskDraft.title}
            />
          </Field>
          <Field label="Bounty">
            <input
              className="input"
              min="1"
              onChange={(event) =>
                setTaskDraft({ ...taskDraft, bountyPot: event.target.value })
              }
              required
              type="number"
              value={taskDraft.bountyPot}
            />
          </Field>
        </div>
        <Field label="Description">
          <textarea
            className="input min-h-24 py-3"
            onChange={(event) =>
              setTaskDraft({ ...taskDraft, description: event.target.value })
            }
            placeholder="Describe the demand, acceptance bar, constraints, deadline, and the proof agents must submit."
            required
            value={taskDraft.description}
          />
        </Field>
        <button
          className="primary-button h-12 w-full"
          disabled={busy === "Posting task"}
          type="submit"
        >
          {busy === "Posting task" ? "Locking escrow..." : "Post bounty and lock escrow"}
        </button>
      </form>
    </section>
  );
}

function SupportedBountyTypes() {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d]">
      <div className="grid border-b border-[#2a2a2a] bg-[#111111] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#737373] sm:grid-cols-[170px_120px_minmax(0,1fr)]">
        <span>Supported type</span>
        <span className="hidden sm:block">Lane</span>
        <span className="hidden sm:block">Use when</span>
      </div>
      <div className="divide-y divide-[#2a2a2a]">
        {BOUNTY_TYPE_OPTIONS.map((option) => (
          <div
            className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[170px_120px_minmax(0,1fr)] sm:items-center"
            key={option.type}
          >
            <span className="font-semibold text-[#f5f5f5]">{option.label}</span>
            <span className="text-[#f59e0b]">
              {option.lane === "dev" ? "Dev" : "Creator"}
            </span>
            <span className="leading-6 text-[#a3a3a3]">{option.submitHint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentStatusCard({
  competitors,
  payouts,
  proofCount,
  task,
}: {
  competitors: number;
  payouts: JsonStoreData["payouts"];
  proofCount: number;
  task: Task;
}) {
  const status = paymentStatus(task, payouts);
  const payout = payouts.find((item) => item.taskId === task.id);
  const steps = [
    {
      label: "Bounty",
      value: `${task.bountyPot} POT`,
      detail: "Locked before agents enter",
      active: true,
    },
    {
      label: "Proof",
      value: `${proofCount}`,
      detail: proofCount === 1 ? "proof received" : "proofs received",
      active: proofCount > 0,
    },
    {
      label: "Review",
      value: task.reviewerRecommendation ? "Ready" : "Pending",
      detail: task.reviewerRecommendation
        ? "Reviewer recommendation set"
        : `${competitors} entrants to evaluate`,
      active: Boolean(task.reviewerRecommendation),
    },
    {
      label: "Payout",
      value: payout ? `${payout.amountPot} POT` : "Not released",
      detail: payout ? "Winner paid" : "Released after winner selection",
      active: Boolean(payout),
    },
  ];

  return (
    <div className="grid gap-3 rounded-2xl border border-[#d9d2c6] bg-[#fffaf0] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b8376]">
            Payment status
          </p>
          <p className="mt-1 text-lg font-black text-[#2f2d29]">
            {status.label}
          </p>
          <p className="mt-1 text-sm leading-6 text-[#6f695f]">
            {status.detail}
          </p>
        </div>
        <span
          className={cx(
            "status-badge w-fit justify-center",
            paymentToneClass(status.tone),
          )}
        >
          Test-chain POT
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {steps.map((step) => (
          <div
            className={cx(
              "rounded-xl border px-3 py-2",
              step.active
                ? "border-[#14532d]/25 bg-[#e9f1e8]"
                : "border-[#d9d2c6] bg-[#fffdf8]",
            )}
            key={step.label}
          >
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#8b8376]">
              {step.label}
            </p>
            <p className="mt-1 text-sm font-black text-[#2f2d29]">
              {step.value}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#6f695f]">
              {step.detail}
            </p>
          </div>
        ))}
      </div>
      {task.lockTxHash || payout?.releaseTxHash ? (
        <div className="grid gap-2 rounded-xl border border-[#d9d2c6] bg-[#fffdf8] p-3 text-xs leading-5 text-[#6f695f]">
          <p className="font-black uppercase tracking-[0.14em] text-[#8b8376]">
            Portaldot proof
          </p>
          {task.chainTaskId ? (
            <p>
              <span className="font-bold text-[#2f2d29]">Chain task:</span>{" "}
              <span className="font-mono" title={task.chainTaskId}>
                {compactHash(task.chainTaskId)}
              </span>
            </p>
          ) : null}
          {task.lockTxHash ? (
            <p>
              <span className="font-bold text-[#2f2d29]">Lock tx:</span>{" "}
              <span className="font-mono" title={task.lockTxHash}>
                {compactHash(task.lockTxHash)}
              </span>
            </p>
          ) : null}
          {payout?.releaseTxHash ? (
            <p>
              <span className="font-bold text-[#2f2d29]">Release tx:</span>{" "}
              <span className="font-mono" title={payout.releaseTxHash}>
                {compactHash(payout.releaseTxHash)}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PostedTasksPanel({
  entries,
  onTaskClick,
  selectedTask,
  submissions,
  tasks,
}: {
  entries: Entry[];
  onTaskClick: (taskId: string) => void;
  selectedTask: Task | undefined;
  submissions: Submission[];
  tasks: Task[];
}) {
  return (
    <section className="panel h-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#f5f5f5]">My Posted Bounties</h2>
          <p className="mt-1 text-sm text-[#a3a3a3]">
              Type, payout, competitors, proof count, status, and age stay aligned.
          </p>
        </div>
        <span className="pot-badge w-fit">{tasks.length} bounties</span>
      </div>
      <div className="mt-5 overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] shadow-inner shadow-black/30">
        {tasks.length === 0 ? (
          <div className="p-4">
            <EmptyState text="No bounties posted yet." />
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(220px,1.8fr)_104px_108px_112px_120px_96px_32px] items-center border-b border-[#2a2a2a] bg-[#111111] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#737373] lg:grid">
              <span>Bounty</span>
              <span className="text-right">Bounty</span>
              <span className="text-center">Competitors</span>
              <span className="text-center">Proof</span>
              <span className="text-center">Status</span>
              <span className="text-right">Created</span>
              <span />
            </div>
            <div className="divide-y divide-[#2a2a2a]">
              {tasks.map((task) => (
                <TaskCard
                  entries={entries}
                  key={task.id}
                  onClick={() => onTaskClick(task.id)}
                  selected={selectedTask?.id === task.id}
                  submissions={submissions}
                  task={task}
                />
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-[#2a2a2a] bg-[#f7f3ea] px-4 py-3 text-xs text-[#6f685f] sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing 1 to {tasks.length} of {tasks.length} bounties
              </span>
              <span className="inline-flex items-center gap-2">
                <button
                  className="grid h-8 w-8 place-items-center rounded-lg border border-[#2a2a2a] bg-[#151515] text-[#737373]"
                  type="button"
                >
                  ‹
                </button>
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#7c3aed]/60 bg-[#7c3aed]/15 text-[#ddd6fe]">
                  1
                </span>
                <button
                  className="grid h-8 w-8 place-items-center rounded-lg border border-[#2a2a2a] bg-[#151515] text-[#737373]"
                  type="button"
                >
                  ›
                </button>
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function BountyBoard({
  agent,
  bountyTypeFilter,
  compete,
  entries,
  onRegisterAgent,
  onTaskClick,
  payouts,
  sessionRole,
  selectedTask,
  setBountyTypeFilter,
  setSubmissionDrafts,
  showAiButton,
  submissionDrafts,
  submissions,
  submitWork,
  tasks,
}: {
  agent: Agent | undefined;
  bountyTypeFilter: BountyTypeFilter;
  compete: (task: Task) => void;
  entries: Entry[];
  onRegisterAgent?: () => void;
  onTaskClick?: (taskId: string) => void;
  payouts: JsonStoreData["payouts"];
  sessionRole: "human" | "agent";
  selectedTask?: Task;
  setBountyTypeFilter: (filter: BountyTypeFilter) => void;
  setSubmissionDrafts: (drafts: SubmissionDrafts) => void;
  showAiButton: boolean;
  submissionDrafts: SubmissionDrafts;
  submissions: Submission[];
  submitWork: (task: Task) => void;
  tasks: Task[];
}) {
  const openTasks = tasks.filter((task) => task.status === "open");
  const filteredTasks = openTasks.filter(
    (task) => bountyTypeFilter === "all" || getBountyConfig(task.bountyType).type === bountyTypeFilter,
  );
  const selectedBoardTask =
    filteredTasks.find((task) => task.id === selectedTask?.id) ??
    filteredTasks[0];
  const [modalTaskId, setModalTaskId] = useState<string | null>(null);
  const modalTask = tasks.find((task) => task.id === modalTaskId) ?? null;

  useEffect(() => {
    if (!modalTaskId) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModalTaskId(null);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [modalTaskId]);

  function openBounty(task: Task) {
    onTaskClick?.(task.id);
    setModalTaskId(task.id);
  }

  function updateDraft(taskId: string, field: SubmissionField, value: string) {
    setSubmissionDrafts({
      ...submissionDrafts,
      [taskId]: {
        ...(submissionDrafts[taskId] ?? {}),
        [field]: value,
      },
    });
  }

  function renderTaskDetail(task: Task) {
    const config = getBountyConfig(task.bountyType);
    const entry = agent
      ? entries.find((item) => item.taskId === task.id && item.agentId === agent.id)
      : undefined;
    const submission = agent
      ? submissions.find((item) => item.taskId === task.id && item.agentId === agent.id)
      : undefined;
    const draft = submissionDrafts[task.id] ?? {};
    const competitors = entries.filter((item) => item.taskId === task.id).length;
    const proofCount = submissions.filter((item) => item.taskId === task.id).length;

    return (
      <div className="grid gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="vault-tag">[{config.tag}]</span>
            <span className="pot-badge">{task.bountyPot} POT</span>
            <span className={cx("status-badge", paymentToneClass(paymentStatus(task, payouts).tone))}>
              {paymentStatus(task, payouts).label}
            </span>
          </div>
          <h3 className="mt-4 text-3xl font-black tracking-tight text-[#2f2d29]">
            {task.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-[#6f695f]">
            {task.description}
          </p>
        </div>

        <PaymentStatusCard
          competitors={competitors}
          payouts={payouts}
          proofCount={proofCount}
          task={task}
        />

        <div className="grid gap-3 rounded-2xl border border-[#d9d2c6] bg-[#f7f3ea] p-4">
          <p className="text-sm font-bold text-[#2f2d29]">
            Required proof: {config.submitHint}
          </p>
          <div className="flex flex-wrap gap-2">
            {config.requiredSubmissionFields.map((field) => (
              <span className="skill-chip" key={field}>{fieldLabel(field)}</span>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#7c3aed]">
            Proof checklist
          </p>
          <ul className="grid gap-2 text-sm leading-6 text-[#6f695f]">
            {config.requirements.map((requirement) => (
              <li className="flex gap-2" key={requirement}>
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#14532d]" />
                <span>{requirement}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-[#d9d2c6] bg-[#fffdf8] p-4 text-sm leading-6 text-[#6f695f]">
          <p className="font-bold text-[#2f2d29]">Judging criteria</p>
          <p className="mt-1">{config.judgingCriteria.join(" · ")}</p>
        </div>

        {sessionRole === "agent" ? (
          !agent ? (
            <EmptyState text="Create an agent profile to enter this bounty." />
          ) : !entry ? (
            <button className="primary-button h-11 w-full px-4" onClick={() => compete(task)} type="button">
              Enter bounty
            </button>
          ) : submission ? (
            <div className="grid gap-3 rounded-2xl border border-[#d9d2c6] bg-[#f7f3ea] p-4">
              <span className={cx("status-badge justify-center", task.winnerAgentId === agent.id ? statusClass("completed") : statusClass(task.status))}>
                {submissionStatus(task, submission)}
              </span>
              <p className="text-sm leading-6 text-[#6f695f]">Proof received. Outcome and payout state stay attached to your profile.</p>
            </div>
          ) : (
            <SubmissionTemplateForm
              draft={draft}
              onChange={(field, value) => updateDraft(task.id, field, value)}
              onGenerate={
                showAiButton
                  ? () => setSubmissionDrafts({ ...submissionDrafts, [task.id]: generateSubmission(task, agent) })
                  : undefined
              }
              onSubmit={() => submitWork(task)}
              task={task}
            />
          )
        ) : (
          <div className="grid gap-3 rounded-2xl border border-[#d9d2c6] bg-[#fffdf8] p-4">
            <p className="text-sm font-bold text-[#2f2d29]">
              Submit proof as an agent
            </p>
            <p className="text-sm leading-6 text-[#6f695f]">
              Register an agent profile, then complete the proof fields for this bounty.
            </p>
            <button
              className="primary-button h-11 w-full px-4"
              onClick={onRegisterAgent}
              type="button"
            >
              Register as agent
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="panel overflow-hidden p-0">
      <div className="border-b border-[#2a2a2a] p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#7c3aed]">
              Bounty board
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#f5f5f5]">
              Open work with Portaldot escrow
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#a3a3a3]">
              Open a card to inspect proof fields, lock status, and payment path.
            </p>
          </div>
          <span className="pot-badge w-fit">{filteredTasks.length} open</span>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className={cx("vault-filter", bountyTypeFilter === "all" && "border-[#7c3aed]/60 text-[#ddd6fe]")}
            onClick={() => setBountyTypeFilter("all")}
            type="button"
          >
            All Types
          </button>
          {BOUNTY_TYPE_OPTIONS.map((option) => (
            <button
              className={cx(
                "vault-filter",
                bountyTypeFilter === option.type && "border-[#7c3aed]/60 text-[#ddd6fe]",
              )}
              key={option.type}
              onClick={() => setBountyTypeFilter(option.type)}
              type="button"
            >
              [{option.tag}]
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 lg:p-6">
        {filteredTasks.length === 0 ? (
          <EmptyState
            action={
              <button
                className="secondary-button h-9 px-3 text-sm"
                onClick={() => setBountyTypeFilter("all")}
                type="button"
              >
                Show all bounties
              </button>
            }
            text="Try another bounty type or return to the full board."
            title="No open bounties match this filter"
          />
        ) : (
          <div className="vault-grid">
            {filteredTasks.map((task, index) => {
              const config = getBountyConfig(task.bountyType);
              const competitors = entries.filter((item) => item.taskId === task.id).length;
              const proofCount = submissions.filter((item) => item.taskId === task.id).length;
              const isSelected = selectedBoardTask?.id === task.id;
              const payStatus = paymentStatus(task, payouts);

              return (
                <article className={cx("vault-card vault-bounty-card", isSelected && "vault-bounty-card-active")} key={task.id}>
                  <button
                    className="vault-card-open"
                    onClick={() => openBounty(task)}
                    type="button"
                  >
                    <BountyArtwork index={index} task={task} />
                    <div className="vault-card-body">
                      <div className="flex flex-wrap gap-2">
                        <span className="vault-tag">[{config.tag}]</span>
                        <span className="vault-tag vault-tag-orange">{bountyLane(task)}</span>
                        <span className={cx("status-badge", paymentToneClass(payStatus.tone))}>{payStatus.label}</span>
                      </div>
                      <h3>{task.title}</h3>
                      <p>{task.description}</p>
                    </div>
                    <div className="vault-card-meta">
                      <span className="vault-price">{task.bountyPot} POT</span>
                      <span>{competitors} entrants · {proofCount} proofs</span>
                    </div>
                    <div className="vault-card-action">
                      <span className="secondary-button h-10 w-full px-3 text-sm">
                        Open bounty
                      </span>
                    </div>
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {modalTask ? (
        <BountyDetailModal onClose={() => setModalTaskId(null)}>
          {renderTaskDetail(modalTask)}
        </BountyDetailModal>
      ) : null}
    </section>
  );
}

function BountyArtwork({ index, task }: { index: number; task: Task }) {
  const config = getBountyConfig(task.bountyType);
  const glyphByType: Record<BountyType, string> = {
    pr_bounty: "PR",
    hackathon: "48H",
    build_contest: "UI",
    video_contest: "VID",
    thread_contest: "X",
    writing_bounty: "DOC",
  };

  return (
    <div
      className={cx(
        "vault-card-art vault-bounty-art",
        config.lane === "dev" ? "vault-bounty-art-dev" : "vault-bounty-art-creator",
        index % 3 === 1 && "vault-bounty-art-warm",
      )}
    >
      <span className="vault-art-title">{config.label}</span>
      <span className="vault-art-stamp">{task.bountyPot} POT ESCROW</span>
      <span className="vault-bounty-glyph">{glyphByType[config.type]}</span>
      <span
        className={cx(
          "vault-art-rail",
          config.lane === "creator" && "vault-art-rail-green",
        )}
      />
    </div>
  );
}

function BountyDetailModal({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4 py-6 backdrop-blur-sm"
      onMouseDown={onClose}
      role="presentation"
    >
      <section
        aria-label="Bounty details"
        aria-modal="true"
        className="dashboard-light w-full max-w-3xl overflow-hidden rounded-3xl border border-[#cfc7ba] bg-[#fffdf8] shadow-2xl shadow-black/30"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#d9d2c6] bg-[#fbfaf7] px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#7c3aed]">
              Rush bounty
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-[#2f2d29]">
              Escrow, proof, payout
            </h2>
          </div>
          <button
            className="secondary-button h-10 px-4 text-sm"
            onClick={onClose}
            type="button"
          >
            Back to feed
          </button>
        </div>
        <div className="max-h-[calc(100vh-168px)] overflow-y-auto p-5 lg:p-6">
          {children}
        </div>
      </section>
    </div>
  );
}

function SubmissionTemplateForm({
  draft,
  onChange,
  onGenerate,
  onSubmit,
  task,
}: {
  draft: SubmissionDraft;
  onChange: (field: SubmissionField, value: string) => void;
  onGenerate?: () => void;
  onSubmit: () => void;
  task: Task;
}) {
  const config = getBountyConfig(task.bountyType);
  const fields = [...config.requiredSubmissionFields, ...config.optionalSubmissionFields].filter(
    (field, index, all) => all.indexOf(field) === index,
  );

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[#f5f5f5]">
          Proof details — {config.label}
        </span>
        {onGenerate ? (
          <button className="secondary-button h-9 px-3 text-sm" onClick={onGenerate} type="button">
            Draft proof
          </button>
        ) : null}
      </div>
      {fields.map((field) => {
        const required = config.requiredSubmissionFields.includes(field);
        const isLong = field === "summary" || field === "shortDescription" || field === "proofNotes";
        return (
          <Field label={`${fieldLabel(field)}${required ? " *" : ""}`} key={field}>
            {isLong ? (
              <textarea
                className="input min-h-20 py-3"
                onChange={(event) => onChange(field, event.target.value)}
                placeholder={fieldPlaceholder(field, task)}
                required={required}
                value={draft[field] ?? ""}
              />
            ) : (
              <input
                className="input"
                onChange={(event) => onChange(field, event.target.value)}
                placeholder={fieldPlaceholder(field, task)}
                required={required}
                type="url"
                value={draft[field] ?? ""}
              />
            )}
          </Field>
        );
      })}
      <button className="primary-button h-11 px-4" type="submit">
        Submit proof
      </button>
    </form>
  );
}

function AgentDashboard({
  agent,
  bountyTypeFilter,
  compete,
  entries,
  payouts,
  setBountyTypeFilter,
  setSubmissionDrafts,
  showAiButton,
  submissionDrafts,
  submissions,
  submitWork,
  tasks,
}: {
  agent: Agent | undefined;
  agents: Agent[];
  bountyTypeFilter: BountyTypeFilter;
  compete: (task: Task) => void;
  entries: Entry[];
  payouts: JsonStoreData["payouts"];
  setBountyTypeFilter: (filter: BountyTypeFilter) => void;
  setSelectedTaskId: (taskId: string) => void;
  setSubmissionDrafts: (drafts: SubmissionDrafts) => void;
  showAiButton: boolean;
  submissionDrafts: SubmissionDrafts;
  submissions: Submission[];
  submitWork: (task: Task) => void;
  tasks: Task[];
}) {
  return (
    <BountyBoard
      agent={agent}
      bountyTypeFilter={bountyTypeFilter}
      compete={compete}
      entries={entries}
      payouts={payouts}
      sessionRole="agent"
      setBountyTypeFilter={setBountyTypeFilter}
      setSubmissionDrafts={setSubmissionDrafts}
      showAiButton={showAiButton}
      submissionDrafts={submissionDrafts}
      submissions={submissions}
      submitWork={submitWork}
      tasks={tasks}
    />
  );
}

function AgentLibraryPanel({ agents }: { agents: Agent[] }) {
  const [agentAction, setAgentAction] = useState<Agent | null>(null);

  return (
    <>
      <section className="panel vault-library-panel">
        <div className="flex flex-col gap-4 border-b border-[#2a2a2a] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#7c3aed]">
              Agent directory
            </p>
            <h2 className="vault-heading mt-2">Agent Directory</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#a3a3a3]">
              Choose an agent and describe the work you want handled.
            </p>
          </div>
          <div className="vault-search w-full lg:w-[420px]">
            <span>⌕</span>
            <input
              aria-label="Search agents"
              placeholder="Search by skill or delivery type..."
              readOnly
              value=""
            />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="vault-filter" type="button">
            Discipline⌄
          </button>
          <button className="vault-filter" type="button">
            Skill⌄
          </button>
          <button className="vault-filter" type="button">
            Availability⌄
          </button>
        </div>
        <div className="vault-grid mt-5">
          {agents.length === 0 ? (
            <EmptyState
              text="Create an agent profile from registration or load the test-chain seed to populate this directory."
              title="No agents listed"
            />
          ) : (
            agents.map((agent, index) => (
              <article className="vault-card" key={agent.id}>
                <div className="vault-card-art vault-agent-art">
                  <span className="vault-art-title">{agent.name}</span>
                  <span className="vault-art-stamp">AGENT PROFILE</span>
                  <span
                    className={cx(
                      "vault-art-rail",
                      index % 3 === 2 && "vault-art-rail-green",
                    )}
                  />
                </div>
                <div className="vault-card-body">
                  <div className="flex flex-wrap gap-2">
                    {agent.skills.slice(0, 2).map((skill, skillIndex) => (
                      <span
                        className={cx(
                          "vault-tag",
                          skillIndex === 1 && "vault-tag-orange",
                        )}
                        key={skill}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                  <h3>{agent.name}</h3>
                  <p>{agent.description}</p>
                </div>
                <div className="vault-card-meta">
                  <span className="vault-price">{agent.balancePot} POT</span>
                  <span>by {truncateWallet(agent.wallet)}</span>
                </div>
                <div className="vault-card-action">
                  <button
                    className="primary-button h-10 w-full px-3 text-sm"
                    onClick={() => setAgentAction(agent)}
                    type="button"
                  >
                    Hire agent
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {agentAction ? (
        <AgentActionModal
          agent={agentAction}
          onClose={() => setAgentAction(null)}
        />
      ) : null}
    </>
  );
}

function AgentActionModal({
  agent,
  onClose,
}: {
  agent: Agent;
  onClose: () => void;
}) {
  const draft = `Hiring request for ${agent.name}\n\nWhy this agent:\nWork needed:\nBudget:\nDeadline:\nExpected delivery:\nProof required:`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-8">
      <section className="w-full max-w-2xl rounded-3xl border border-[#2a2a2a] bg-[#fbfaf6] p-5 shadow-2xl shadow-black/25">
        <div className="flex items-start justify-between gap-4 border-b border-[#d8d1c5] pb-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#7c3aed]">
              Hiring request
            </p>
            <h2 className="mt-2 text-2xl font-bold text-[#2b2926]">
              Hire {agent.name}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#6f685f]">
              State the work, budget, deadline, and proof expected. Sending is
              not connected yet.
            </p>
          </div>
          <button
            className="secondary-button h-10 px-4 text-sm"
            onClick={onClose}
            type="button"
          >
            Back to agents
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {agent.skills.map((skill) => (
            <span className="vault-tag" key={skill}>
              {skill}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm leading-6 text-[#6f685f]">
          {agent.description}
        </p>

        <Field label="Why do you want to hire this agent?">
          <textarea
            className="input agent-action-draft py-3"
            defaultValue={draft}
            placeholder="Describe the work, timeline, budget, and proof you expect."
          />
        </Field>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#6f685f]">
            Request delivery is not connected yet.
          </p>
          <button
            className="secondary-button h-11 px-5"
            disabled
            type="button"
          >
            Send request
          </button>
        </div>
      </section>
    </div>
  );
}

function SubmissionsWorkspace({
  agents,
  entries,
  expandedSubmissions,
  payouts,
  scoreAllSubmissions,
  selectedTask,
  selectWinner,
  setExpandedSubmissions,
  setSelectedTaskId,
  submissions,
  tasks,
}: {
  agents: Agent[];
  entries: Entry[];
  expandedSubmissions: ExpandedSubmissions;
  payouts: JsonStoreData["payouts"];
  scoreAllSubmissions: (task: Task) => void;
  selectedTask: Task | undefined;
  selectWinner: (task: Task, agentId: string) => void;
  setExpandedSubmissions: (drafts: ExpandedSubmissions) => void;
  setSelectedTaskId: (taskId: string) => void;
  submissions: Submission[];
  tasks: Task[];
}) {
  const activeTask = selectedTask ?? tasks[0];

  return (
    <div className="grid gap-6">
      <section className="panel dashboard-grid-panel">
        <div className="flex flex-col gap-3 border-b border-[#2a2a2a] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#7c3aed]">
              Bounty review
            </p>
            <h2 className="text-2xl font-bold text-[#f5f5f5]">
              Choose a bounty to review proof
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#a3a3a3]">
              Bounties stay in one grid first. Click any bounty to load entrants, proof, scores, and winner actions below.
            </p>
          </div>
          <span className="pot-badge w-fit">
            {submissions.length} proofs
          </span>
        </div>

        <div className="submission-task-grid mt-5">
          {tasks.length === 0 ? (
            <EmptyState text="No bounties posted yet." />
          ) : (
            tasks.map((task) => {
              const competitorCount = entries.filter(
                (entry) => entry.taskId === task.id,
              ).length;
              const submissionCount = submissions.filter(
                (submission) => submission.taskId === task.id,
              ).length;
              const selected = activeTask?.id === task.id;
              const config = getBountyConfig(task.bountyType);
              return (
                <button
                  aria-pressed={selected}
                  className={cx(
                    "submission-task-card",
                    selected && "submission-task-card-active",
                  )}
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  type="button"
                >
                  <div className="submission-task-main">
                    <div className="min-w-0">
                      <p className="submission-task-title">{task.title}</p>
                      <p className="submission-task-copy">{task.description}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="vault-tag">[{config.tag}]</span>
                        <span className="vault-tag vault-tag-orange">
                          {config.lane === "dev" ? "Dev" : "Creator"}
                        </span>
                      </div>
                    </div>
                    <span
                      className={cx(
                        "status-badge shrink-0",
                        statusClass(task.status),
                      )}
                    >
                      {statusLabel(task.status)}
                    </span>
                  </div>
                  <div className="submission-task-metrics">
                    <span>
                      <strong>{task.bountyPot}</strong>
                      <small>POT</small>
                    </span>
                    <span>
                      <strong>{competitorCount}</strong>
                      <small>agents</small>
                    </span>
                    <span>
                      <strong>{submissionCount}</strong>
                      <small>proofs</small>
                    </span>
                  </div>
                  <span className="submission-task-route">
                    Open proof review →
                  </span>
                </button>
              );
            })
          )}
        </div>
      </section>

      {activeTask ? (
        <CompetitionPanel
          agents={agents}
          entries={entries}
          expandedSubmissions={expandedSubmissions}
          payouts={payouts}
          scoreAllSubmissions={scoreAllSubmissions}
          selectWinner={selectWinner}
          setExpandedSubmissions={setExpandedSubmissions}
          submissions={submissions}
          task={activeTask}
        />
      ) : null}
    </div>
  );
}

function CompetitionPanel({
  agents,
  entries,
  expandedSubmissions,
  payouts,
  scoreAllSubmissions,
  selectWinner,
  setExpandedSubmissions,
  submissions,
  task,
}: {
  agents: Agent[];
  entries: Entry[];
  expandedSubmissions: ExpandedSubmissions;
  payouts: JsonStoreData["payouts"];
  scoreAllSubmissions: (task: Task) => void;
  selectWinner: (task: Task, agentId: string) => void;
  setExpandedSubmissions: (drafts: ExpandedSubmissions) => void;
  submissions: Submission[];
  task: Task;
}) {
  const config = getBountyConfig(task.bountyType);
  const taskEntries = entries.filter((entry) => entry.taskId === task.id);
  const taskSubmissions = submissions.filter(
    (submission) => submission.taskId === task.id,
  );
  const competingAgents = taskEntries
    .map((entry) => agents.find((agent) => agent.id === entry.agentId))
    .filter((item): item is Agent => Boolean(item));
  const allScored =
    taskSubmissions.length > 0 &&
    taskSubmissions.every((submission) => submission.score !== undefined);
  const currentPaymentStatus = paymentStatus(task, payouts);

  return (
    <section className="panel submission-detail-panel">
      <div className="flex flex-col gap-4 border-b border-[#2a2a2a] pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="vault-tag">[{config.tag}]</span>
            <span className="vault-tag vault-tag-orange">
              {config.lane === "dev" ? "Dev" : "Creator"}
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-[#f5f5f5]">
              {task.title}
            </h2>
            <span className={cx("status-badge", statusClass(task.status))}>
              {statusLabel(task.status)}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#a3a3a3]">
            {task.description}
          </p>
        </div>
        <div className="rounded-2xl border border-[#f59e0b]/25 bg-[#f59e0b]/10 px-4 py-3 text-[#f59e0b]">
          <p className="text-xs font-semibold uppercase tracking-wide">
            {currentPaymentStatus.label}
          </p>
          <p className="mt-1 text-3xl font-bold">{task.bountyPot} POT</p>
          <p className="mt-1 text-xs font-semibold text-[#6f695f]">
            {currentPaymentStatus.detail}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <PaymentStatusCard
          competitors={taskEntries.length}
          payouts={payouts}
          proofCount={taskSubmissions.length}
          task={task}
        />
      </div>

      <div className="submission-review-grid mt-5">
        <div className="submission-review-group">
          <h3 className="text-sm font-bold uppercase tracking-wide text-[#a3a3a3]">
            Competitors
          </h3>
          <div className="review-card-list mt-4">
            {competingAgents.length === 0 ? (
              <EmptyState text="No agents competing yet." />
            ) : (
              competingAgents.map((agent) => (
                <div className="review-row-card" key={agent.id}>
                  <p className="font-semibold text-[#f5f5f5]">{agent.name}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {agent.skills.map((skill) => (
                      <span className="skill-chip" key={skill}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="submission-review-group">
          <h3 className="text-sm font-bold uppercase tracking-wide text-[#a3a3a3]">
            Proof
          </h3>
          <div className="review-card-list mt-4">
            {taskSubmissions.length === 0 ? (
              <EmptyState
                text="Agents must enter this bounty and submit the required proof before review starts."
                title="No proof submitted"
              />
            ) : (
              taskSubmissions.map((submission) => (
                <SubmissionCard
                  agents={agents}
                  expanded={Boolean(expandedSubmissions[submission.id])}
                  key={submission.id}
                  onToggle={() =>
                    setExpandedSubmissions({
                      ...expandedSubmissions,
                      [submission.id]: !expandedSubmissions[submission.id],
                    })
                  }
                  selectWinner={selectWinner}
                  submission={submission}
                  task={task}
                />
              ))
            )}
          </div>
        </div>

        <div className="submission-review-group">
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-[#a3a3a3]">
              Scores & Review
            </h3>
            <button
              className="secondary-button h-9 w-full px-3"
              disabled={
                taskSubmissions.length === 0 || task.status === "completed"
              }
              onClick={() => scoreAllSubmissions(task)}
              type="button"
            >
              Score proof
            </button>
          </div>
          <div className="review-card-list mt-4">
            {taskSubmissions.length === 0 ? (
              <EmptyState
                text="Scores unlock after at least one agent submits proof."
                title="Waiting for proof"
              />
            ) : (
              taskSubmissions.map((submission) => {
                const isRecommended =
                  task.reviewerRecommendation === submission.agentId;
                const isWinner = task.winnerAgentId === submission.agentId;
                return (
                  <div
                    className={cx(
                      "review-row-card",
                      isWinner
                        ? "border-[#14532d]/70 shadow-lg shadow-[0_0_30px_rgba(20,83,45,0.15)]"
                        : isRecommended
                          ? "border-[#f59e0b]/60"
                          : "border-[#2a2a2a]",
                    )}
                    key={submission.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#f5f5f5]">
                          {formatAgent(submission.agentId, agents)}
                        </p>
                        {isRecommended ? (
                          <span className="mt-2 inline-flex rounded-full border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-2 py-1 text-xs font-semibold text-[#fbbf24]">
                            Recommended
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={cx(
                          "submission-score-badge",
                          submission.score !== undefined &&
                            "submission-score-badge-scored",
                        )}
                      >
                        {submission.score ?? "--"}/100
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#a3a3a3]">
                      {submission.reviewerNotes ??
                        (allScored
                          ? "No reviewer notes."
                          : "Awaiting reviewer score.")}
                    </p>
                    {task.status === "completed" ? (
                      <p
                        className={cx(
                          "mt-3 text-sm font-semibold",
                          isWinner ? "text-[#14532d]" : "text-[#a3a3a3]",
                        )}
                      >
                        {isWinner
                          ? `Best proof paid ${task.bountyPot} POT`
                          : "Not selected"}
                      </p>
                    ) : (
                      <button
                        className={cx(
                          "mt-4 h-10 rounded-xl px-3 text-sm font-semibold",
                          isRecommended
                            ? "bg-[#f59e0b] text-black"
                            : "bg-[#7c3aed] text-white",
                        )}
                        onClick={() => selectWinner(task, submission.agentId)}
                        type="button"
                      >
                        Select as Winner
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SubmissionCard({
  agents,
  expanded,
  onToggle,
  selectWinner,
  submission,
  task,
}: {
  agents: Agent[];
  expanded: boolean;
  onToggle: () => void;
  selectWinner: (task: Task, agentId: string) => void;
  submission: Submission;
  task: Task;
}) {
  const agent = agents.find((item) => item.id === submission.agentId);
  const isRecommended = task.reviewerRecommendation === submission.agentId;
  const isWinner = task.winnerAgentId === submission.agentId;
  const links = submissionLinks(submission);
  const preview = submission.summary ?? submission.content;
  const detailBlocks = [
    submission.shortDescription && {
      label: "Description",
      value: submission.shortDescription,
    },
    submission.proofNotes && { label: "Proof notes", value: submission.proofNotes },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <article
      className={cx(
        "review-row-card",
        isWinner
          ? "border-[#14532d]/70"
          : isRecommended
            ? "border-[#f59e0b]/60"
            : "border-[#2a2a2a]",
        task.status === "completed" && !isWinner && "opacity-55",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[#f5f5f5]">
            {agent?.name ?? submission.agentId}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {agent?.skills.slice(0, 3).map((skill) => (
              <span className="skill-chip" key={skill}>
                {skill}
              </span>
            ))}
          </div>
        </div>
        {isRecommended ? (
          <span className="rounded-full border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-2 py-1 text-xs font-semibold text-[#fbbf24]">
            Recommended
          </span>
        ) : null}
      </div>
      <button
        className="submission-preview-toggle"
        onClick={onToggle}
        type="button"
      >
        <span
          className={cx(
            "whitespace-pre-line text-sm leading-6 text-[#d4d4d4]",
            !expanded && "clamp-2",
          )}
        >
          {preview}
        </span>
        <span className="submission-preview-action">
          {expanded ? "Hide details" : "View details"}
        </span>
      </button>
      {expanded ? (
        <div className="mt-4 grid gap-3">
          {links.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {links.map((link) => (
                <a
                  className="rounded-xl border border-[#2a2a2a] bg-[#111111] px-3 py-2 text-sm font-semibold text-[#5b21b6] transition hover:border-[#7c3aed]/50"
                  href={link.href}
                  key={link.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {link.label} ↗
                </a>
              ))}
            </div>
          ) : null}
          {detailBlocks.length > 0 ? (
            <div className="grid gap-2">
              {detailBlocks.map((block) => (
                <div
                  className="rounded-xl border border-[#2a2a2a] bg-[#111111] px-3 py-2 text-sm text-[#a3a3a3]"
                  key={block.label}
                >
                  <p className="font-semibold text-[#f5f5f5]">{block.label}</p>
                  <p className="mt-1 leading-6">{block.value}</p>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="rounded-xl border border-[#2a2a2a] bg-[#111111] px-3 py-2 text-sm text-[#a3a3a3]">
              {submissionStatus(task, submission)}
            </span>
            {task.status !== "completed" ? (
              <button
                className="secondary-button h-9 px-3"
                onClick={() => selectWinner(task, submission.agentId)}
                type="button"
              >
                Select as Winner
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function TaskCard({
  entries,
  onClick,
  selected,
  submissions,
  task,
}: {
  entries: Entry[];
  onClick: () => void;
  selected: boolean;
  submissions: Submission[];
  task: Task;
}) {
  const competitorCount = entries.filter(
    (entry) => entry.taskId === task.id,
  ).length;
  const submissionCount = submissions.filter(
    (submission) => submission.taskId === task.id,
  ).length;
  const config = getBountyConfig(task.bountyType);

  return (
    <button
      className={cx(
        "dashboard-task-row group grid w-full gap-3 px-4 py-4 text-left transition lg:grid-cols-[minmax(220px,1.8fr)_104px_108px_112px_120px_96px_32px] lg:items-center",
        selected
          ? "bg-[#7c3aed]/10 shadow-[inset_3px_0_0_#7c3aed]"
          : "bg-transparent hover:bg-[#151515]",
      )}
      onClick={onClick}
      type="button"
    >
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2 lg:block">
          <h3 className="truncate text-sm font-bold text-[#f5f5f5]">
            {task.title}
          </h3>
          <span
            className={cx("status-badge lg:hidden", statusClass(task.status))}
          >
            {statusLabel(task.status)}
          </span>
        </div>
        <p className="mt-1 truncate text-xs leading-5 text-[#a3a3a3]">
          {task.description}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="vault-tag">[{config.tag}]</span>
          <span className="vault-tag vault-tag-orange">
            {config.lane === "dev" ? "Dev" : "Creator"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-[#a3a3a3] lg:hidden">
          <span className="rounded-lg border border-[#2a2a2a] bg-[#111111] px-2 py-1">
            {competitorCount} competitors
          </span>
          <span className="rounded-lg border border-[#2a2a2a] bg-[#111111] px-2 py-1">
            {submissionCount} proofs
          </span>
          <span className="rounded-lg border border-[#2a2a2a] bg-[#111111] px-2 py-1 text-right">
            {relativeTime(task.createdAt)}
          </span>
        </div>
      </div>
      <span className="inline-flex items-center justify-start gap-2 text-sm font-bold text-[#f59e0b] lg:justify-end">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-[#f59e0b] text-[10px] font-black text-black">
          ₱
        </span>
        {task.bountyPot} POT
      </span>
      <span className="hidden text-center text-sm font-semibold text-[#f5f5f5] lg:block">
        {competitorCount}
      </span>
      <span className="hidden text-center text-sm font-semibold text-[#f5f5f5] lg:block">
        {submissionCount}
      </span>
      <span
        className={cx(
          "status-badge hidden justify-center lg:inline-flex",
          statusClass(task.status),
        )}
      >
        {statusLabel(task.status)}
      </span>
      <span className="hidden text-right text-sm text-[#a3a3a3] lg:block">
        {relativeTime(task.createdAt)}
      </span>
      <span className="hidden text-right text-xl text-[#a3a3a3] transition group-hover:text-[#f5f5f5] lg:block">
        ›
      </span>
    </button>
  );
}

function PayoutFeed({
  agents,
  events,
  feedFlash,
}: {
  agents: Agent[];
  events: RushEvent[];
  feedFlash: boolean;
}) {
  const orderedEvents = [...events].reverse();

  return (
    <section
      className={cx("panel overflow-hidden p-0", feedFlash && "feed-flash")}
    >
      <div className="flex flex-col gap-4 border-b border-[#2a2a2a] p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#f5f5f5]">
            Payout Feed / Activity Timeline
          </h2>
          <p className="mt-2 text-sm text-[#a3a3a3]">
            Real-time activity and payout events across tasks and bounties.
          </p>
        </div>
        <button
          className="secondary-button h-12 min-w-44 justify-between px-4"
          type="button"
        >
          <span>All Events</span>
          <span className="text-[#a3a3a3]">⌄</span>
        </button>
      </div>
      <ol className="activity-timeline p-5">
        {orderedEvents.length === 0 ? (
          <EmptyState text="No events yet." />
        ) : (
          orderedEvents.map((event, index) => (
            <li
              className="relative grid grid-cols-[74px_minmax(0,1fr)] gap-4 pb-3 last:pb-0"
              key={event.id}
            >
              <div className="relative z-10 flex justify-center">
                {index === 0 ? (
                  <span className="mt-3 h-fit rounded-lg border border-[#14532d]/35 bg-[#14532d]/10 px-3 py-2 text-[11px] font-bold text-[#14532d]">
                    NEW
                  </span>
                ) : null}
                <span className="absolute right-[-25px] top-7 h-5 w-5 rounded-full border-4 border-[#1a1a1a] bg-[#737373] shadow-[0_0_0_1px_#2a2a2a]" />
              </div>
              <article
                className={cx(
                  "grid gap-4 rounded-2xl border bg-[#111111] p-4 transition md:grid-cols-[minmax(0,1.35fr)_190px_170px_140px] md:items-center",
                  index === 0
                    ? "border-[#14532d]/70 bg-[#14532d]/10 shadow-[0_0_45px_rgba(16,185,129,0.13)]"
                    : "border-[#2a2a2a]",
                )}
              >
                <div className="flex gap-4">
                  <span
                    className={cx(
                      "grid h-14 w-14 shrink-0 place-items-center rounded-xl border text-xl",
                      eventToneClass(event.type),
                    )}
                  >
                    <EventGlyph type={event.type} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-[#f5f5f5]">
                        {event.type}
                      </span>
                      <span
                        className={cx(
                          "rounded-md border px-2 py-1 text-[10px] font-bold uppercase",
                          eventToneClass(event.type),
                        )}
                      >
                        {eventTone(event.type)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#d4d4d4]">
                      {event.message}
                    </p>
                    {event.agentId ? (
                      <p className="mt-1 text-xs text-[#737373]">
                        {formatAgent(event.agentId, agents)}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#f5f5f5]">
                    {relativeTime(event.createdAt)}
                  </p>
                  <p className="mt-1 text-xs text-[#a3a3a3]">
                    {new Date(event.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="font-mono text-xs text-[#a3a3a3]">
                  <span className="text-[#737373]">Event:</span>{" "}
                  {eventReference(event.id)}
                  {event.amountPot ? (
                    <p className="mt-1 text-[#f59e0b]">{event.amountPot} POT</p>
                  ) : null}
                  {event.txHash ? (
                    <p className="mt-1 text-[#d4d4d4]">
                      Tx: {compactHash(event.txHash)}
                    </p>
                  ) : null}
                </div>
                {event.explorerUrl ? (
                  <a
                    className="text-left text-sm font-semibold text-[#a78bfa] transition hover:text-[#ddd6fe] md:text-right"
                    href={event.explorerUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View on Portaldot Explorer ↗
                  </a>
                ) : event.txHash ? (
                  <span className="text-left font-mono text-xs text-[#a3a3a3] md:text-right">
                    Tx: {compactHash(event.txHash)}
                  </span>
                ) : (
                  <button
                    className="text-left text-sm font-semibold text-[#a78bfa] transition hover:text-[#ddd6fe] md:text-right"
                    onClick={() =>
                      window.open("/api/state", "_blank", "noopener,noreferrer")
                    }
                    type="button"
                  >
                    View State ↗
                  </button>
                )}
              </article>
            </li>
          ))
        )}
      </ol>
      <div className="border-t border-[#2a2a2a] px-6 py-4 text-center text-sm text-[#a3a3a3]">
        Auto-updates every 3 seconds
      </div>
    </section>
  );
}

function RawStatePanel({ state }: { state: JsonStoreData }) {
  return (
    <section className="panel">
      <div className="flex flex-col gap-3 border-b border-[#2a2a2a] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#f5f5f5]">Raw State JSON</h2>
          <p className="mt-1 text-sm text-[#a3a3a3]">
            Read-only test-chain state snapshot for judging.
          </p>
        </div>
        <span className="rounded-full border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1 text-xs font-semibold text-[#a3a3a3]">
          /api/state
        </span>
      </div>
      <pre className="mt-4 max-h-[460px] overflow-auto rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] p-4 font-mono text-xs leading-5 text-[#d4d4d4]">
        {JSON.stringify(state, null, 2)}
      </pre>
    </section>
  );
}

function BalanceBars({
  escrowBalancePot,
  human,
  paidPot,
}: {
  escrowBalancePot: number;
  human: Human | undefined;
  paidPot: number;
}) {
  const rows = [
    {
      label: "Client Available",
      value: human?.balancePot ?? 0,
      color: "bg-[#7c3aed]",
    },
    { label: "Escrow Locked", value: escrowBalancePot, color: "bg-[#f59e0b]" },
    { label: "Agents Paid", value: paidPot, color: "bg-[#14532d]" },
  ];
  const max = Math.max(100, ...rows.map((row) => row.value));

  return (
    <section className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        {rows.map((row) => (
          <div className="panel p-5" key={row.label}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[#a3a3a3]">
                  {row.label}
                </p>
                <p className="mt-2 text-2xl font-bold text-[#f5f5f5]">
                  {row.value}{" "}
                  <span className="text-sm text-[#f59e0b]">POT</span>
                </p>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] text-[10px] font-bold text-[#a3a3a3]">
                POT
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="panel">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#f5f5f5]">
              Balance Distribution
            </h2>
            <p className="text-sm text-[#a3a3a3]">
              Funds move from client balance to escrow, then to the winner.
            </p>
          </div>
          <span className="pot-badge">
            Total {rows.reduce((sum, row) => sum + row.value, 0)} POT
          </span>
        </div>
        <div className="mt-5 grid gap-4">
          {rows.map((row) => (
            <div
              className="grid gap-2 sm:grid-cols-[140px_1fr_86px] sm:items-center"
              key={row.label}
            >
              <span className="text-sm text-[#a3a3a3]">{row.label}</span>
              <div className="h-3 overflow-hidden rounded-full bg-[#1a1a1a]">
                <div
                  className={cx(
                    "h-full rounded-full transition-all duration-500",
                    row.color,
                  )}
                  style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }}
                />
              </div>
              <span className="text-right text-sm font-semibold text-[#f5f5f5]">
                {row.value} POT
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HumanOnlyPanel({
  switchRole,
}: {
  switchRole: (role: "human" | "agent") => void;
}) {
  return (
    <section className="panel">
      <p className="text-sm font-semibold uppercase tracking-wide text-[#f59e0b]">
        Client action
      </p>
      <h2 className="mt-2 text-2xl font-bold text-[#f5f5f5]">
        Bounty creation lives in the client workspace.
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#a3a3a3]">
        Agents can compete and submit proof. Create a client profile to post a
        bounty-backed task and lock escrow.
      </p>
      <button
        className="primary-button mt-5 h-12 px-5"
        onClick={() => switchRole("human")}
        type="button"
      >
        Create Client Profile
      </button>
    </section>
  );
}

function PayoutWorkspace({
  agents,
  payouts,
  tasks,
}: {
  agents: Agent[];
  payouts: JsonStoreData["payouts"];
  tasks: Task[];
}) {
  return (
    <div className="grid gap-6">
      <section className="panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#f5f5f5]">Payout Ledger</h2>
            <p className="mt-1 text-sm text-[#a3a3a3]">
              Released POT is grouped by winner, task, amount, and time.
            </p>
          </div>
          <span className="pot-badge w-fit">
            {payouts.reduce((sum, payout) => sum + payout.amountPot, 0)} POT
            paid
          </span>
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d]">
          {payouts.length === 0 ? (
            <div className="p-4">
              <EmptyState text="No payouts released yet." />
            </div>
          ) : (
            <>
              <div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(180px,1fr)_120px_140px] border-b border-[#2a2a2a] bg-[#111111] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#737373] md:grid">
                <span>Bounty</span>
                <span>Winner</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Released</span>
              </div>
              <div className="divide-y divide-[#2a2a2a]">
                {payouts.map((payout) => {
                  const task = tasks.find((item) => item.id === payout.taskId);
                  const agent = agents.find(
                    (item) => item.id === payout.winnerAgentId,
                  );
                  return (
                    <article
                      className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(220px,1.4fr)_minmax(180px,1fr)_120px_140px] md:items-center"
                      key={payout.id}
                    >
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-[#f5f5f5]">
                          {task?.title ?? payout.taskId}
                        </h3>
                        <p className="mt-1 font-mono text-xs text-[#737373]">
                          {payout.releaseTxHash
                            ? `release ${compactHash(payout.releaseTxHash)}`
                            : eventReference(payout.id)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-[#d4d4d4]">
                        {agent?.name ?? payout.winnerAgentId}
                      </p>
                      <p className="text-sm font-bold text-[#f59e0b] md:text-right">
                        {payout.amountPot} POT
                      </p>
                      <p className="text-sm text-[#a3a3a3] md:text-right">
                        {relativeTime(payout.createdAt)}
                      </p>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function AnalyticsPanel({
  agents,
  entries,
  escrowBalancePot,
  human,
  payouts,
  submissions,
  tasks,
}: {
  agents: Agent[];
  entries: Entry[];
  escrowBalancePot: number;
  human: Human | undefined;
  payouts: JsonStoreData["payouts"];
  submissions: Submission[];
  tasks: Task[];
}) {
  const paidPot = payouts.reduce((sum, payout) => sum + payout.amountPot, 0);
  const scoredCount = submissions.filter(
    (submission) => submission.score !== undefined,
  ).length;
  const completedCount = tasks.filter(
    (task) => task.status === "completed",
  ).length;
  const openCount = tasks.filter(
    (task) => task.status === "open" || task.status === "reviewed",
  ).length;
  const topAgents = [...agents]
    .sort((a, b) => b.balancePot - a.balancePot)
    .slice(0, 4);
  const metrics = [
    {
      label: "Open / review tasks",
      value: openCount,
      detail: `${tasks.length} total`,
    },
    {
      label: "Competitor joins",
      value: entries.length,
      detail: "agent entries",
    },
    {
      label: "Scored proof",
      value: scoredCount,
      detail: `${submissions.length} proof records`,
    },
    {
      label: "Completed payouts",
      value: completedCount,
      detail: `${paidPot} POT paid`,
    },
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div className="panel p-5" key={metric.label}>
            <p className="text-sm text-[#a3a3a3]">{metric.label}</p>
            <p className="mt-3 text-3xl font-bold text-[#f5f5f5]">
              {metric.value}
            </p>
            <p className="mt-1 text-sm text-[#737373]">{metric.detail}</p>
          </div>
        ))}
      </section>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel">
          <h2 className="text-xl font-bold text-[#f5f5f5]">Bounty Flow</h2>
          <div className="mt-5 grid gap-3">
            {tasks.length === 0 ? (
              <EmptyState text="No task data yet." />
            ) : (
              tasks.map((task) => {
                const taskEntries = entries.filter(
                  (entry) => entry.taskId === task.id,
                ).length;
                const taskSubmissions = submissions.filter(
                  (submission) => submission.taskId === task.id,
                ).length;
                return (
                  <div
                    className="grid gap-3 rounded-2xl border border-[#2a2a2a] bg-[#111111] p-4 md:grid-cols-[minmax(0,1fr)_90px_100px_110px] md:items-center"
                    key={task.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#f5f5f5]">
                        {task.title}
                      </p>
                      <p className="mt-1 truncate text-xs text-[#a3a3a3]">
                        {task.description}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-[#f59e0b] md:text-right">
                      {task.bountyPot} POT
                    </p>
                    <p className="text-sm text-[#d4d4d4] md:text-center">
                      {taskEntries} / {taskSubmissions}
                    </p>
                    <span
                      className={cx(
                        "status-badge justify-center",
                        statusClass(task.status),
                      )}
                    >
                      {statusLabel(task.status)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="panel">
          <h2 className="text-xl font-bold text-[#f5f5f5]">Agent Earnings</h2>
          <div className="mt-5 grid gap-3">
            {topAgents.map((agent) => (
              <div
                className="rounded-2xl border border-[#2a2a2a] bg-[#111111] p-4"
                key={agent.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#f5f5f5]">
                      {agent.name}
                    </p>
                    <p className="mt-1 truncate text-xs text-[#a3a3a3]">
                      {agent.skills.join(" · ")}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-[#f59e0b]">
                    {agent.balancePot} POT
                  </p>
                </div>
              </div>
            ))}
            <div className="rounded-2xl border border-[#2a2a2a] bg-[#0f0f0f] p-4 text-sm text-[#a3a3a3]">
              Client available:{" "}
              <span className="font-semibold text-[#f5f5f5]">
                {human?.balancePot ?? 0} POT
              </span>{" "}
              · Bounty locked:{" "}
              <span className="font-semibold text-[#f5f5f5]">
                {escrowBalancePot} POT
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SettingsPanel({
  busy,
  deleteCurrentAccount,
  goBackToLanding,
  gmailDraft,
  saveGmail,
  session,
  setGmailDraft,
  state,
}: {
  busy: string;
  deleteCurrentAccount: () => void;
  goBackToLanding: () => void;
  gmailDraft: string;
  saveGmail: (event: FormEvent<HTMLFormElement>) => void;
  session: Session;
  setGmailDraft: (value: string) => void;
  state: JsonStoreData;
}) {
  return (
    <div className="grid gap-6">
      <section className="panel">
        <div className="flex flex-col gap-4 border-b border-[#2a2a2a] pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#7c3aed]">
              Settings
            </p>
            <h2 className="mt-2 text-2xl font-bold text-[#f5f5f5]">
              Account controls
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#a3a3a3]">
              Manage the current account. Bounty data and proof ledgers stay
              separate from user access.
            </p>
          </div>
          <span className="rounded-xl border border-[#2a2a2a] bg-[#111111] px-3 py-2 text-sm text-[#a3a3a3]">
            Active: {session.role}
          </span>
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <div className="rounded-2xl border border-[#2a2a2a] bg-[#111111] p-4">
            <h3 className="text-lg font-bold text-[#f5f5f5]">Account access</h3>
            <p className="mt-1 text-sm text-[#a3a3a3]">
              Add a Gmail address for follow-up outside the marketplace, or
              delete the current account.
            </p>
            <form className="mt-4 grid gap-3" onSubmit={saveGmail}>
              <Field label="Gmail">
                <input
                  className="input"
                  onChange={(event) => setGmailDraft(event.target.value)}
                  placeholder="name@gmail.com"
                  required
                  type="email"
                  value={gmailDraft}
                />
              </Field>
              <button
                className="primary-button h-11 px-4"
                disabled={busy === "Saving Gmail"}
                type="submit"
              >
                {busy === "Saving Gmail" ? "Saving Gmail..." : "Add Gmail"}
              </button>
            </form>
            <div className="mt-4 grid gap-2">
              <button
                className="secondary-button h-11"
                onClick={goBackToLanding}
                type="button"
              >
                Back to Landing
              </button>
            </div>
            <div className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/10 p-4">
              <p className="text-sm font-semibold text-red-200">Delete account</p>
              <p className="mt-1 text-sm leading-6 text-red-100/80">
                This removes the current account login. Public bounty and proof
                records remain in the marketplace ledger.
              </p>
              <button
                className="mt-3 inline-flex h-11 items-center justify-center rounded-xl border border-red-500/40 bg-red-500/15 px-4 text-sm font-semibold text-red-100 transition hover:border-red-400/70 hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-55"
                disabled={busy === "Deleting account"}
                onClick={deleteCurrentAccount}
                type="button"
              >
                {busy === "Deleting account" ? "Deleting account..." : "Delete account"}
              </button>
            </div>
          </div>
          <RawStatePanel state={state} />
        </div>
      </section>
    </div>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-[#d4d4d4]">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({
  action,
  text,
  title = "Nothing here yet",
}: {
  action?: ReactNode;
  text: string;
  title?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d9d2c6] bg-[#fffaf0] p-4 text-sm text-[#6f695f]">
      <p className="font-black text-[#2f2d29]">{title}</p>
      <p className="mt-1 leading-6">{text}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
