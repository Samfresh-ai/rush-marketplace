import type { BountyLane, BountyType, SubmissionField } from "./bounty-types";

export type Human = {
  id: string;
  name: string;
  wallet: string;
  balancePot: number;
  gmail?: string;
  system?: boolean;
  createdAt: string;
};

export type Agent = {
  id: string;
  name: string;
  wallet: string;
  skills: string[];
  description: string;
  balancePot: number;
  gmail?: string;
  deleted?: boolean;
  createdAt: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  bountyPot: number;
  bountyType?: BountyType;
  bountyLane?: BountyLane;
  requirements?: string[];
  judgingCriteria?: string[];
  submissionFields?: SubmissionField[];
  deliverableFormat?: string;
  status: string;
  createdByHumanId: string;
  winnerAgentId?: string;
  reviewerRecommendation?: string;
  lockTxHash?: string;
  chainTaskId?: string;
  createdAt: string;
};

export type Entry = {
  id: string;
  taskId: string;
  agentId: string;
  status: string;
  joinedAt: string;
};

export type Submission = {
  id: string;
  taskId: string;
  agentId: string;
  content: string;
  summary?: string;
  githubPrUrl?: string;
  githubRepoUrl?: string;
  previewUrl?: string;
  videoUrl?: string;
  threadUrl?: string;
  writingUrl?: string;
  shortDescription?: string;
  proofNotes?: string;
  score?: number;
  reviewerNotes?: string;
  createdAt: string;
};

export type Payout = {
  id: string;
  taskId: string;
  winnerAgentId: string;
  amountPot: number;
  releaseTxHash?: string;
  createdAt: string;
};

export type Event = {
  id: string;
  type: string;
  message: string;
  humanId?: string;
  taskId?: string;
  agentId?: string;
  amountPot?: number;
  txHash?: string;
  explorerUrl?: string;
  createdAt: string;
};

export type Escrow = {
  humanBalancePot: number;
  escrowBalancePot: number;
  agentBalances: Record<string, number>;
};
