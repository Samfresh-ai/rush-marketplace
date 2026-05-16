export const BOUNTY_TYPES = [
  "hackathon",
  "pr_bounty",
  "build_contest",
  "video_contest",
  "thread_contest",
  "writing_bounty",
] as const;

export type BountyType = (typeof BOUNTY_TYPES)[number];
export type BountyLane = "dev" | "creator";

export type SubmissionField =
  | "summary"
  | "githubPrUrl"
  | "githubRepoUrl"
  | "previewUrl"
  | "videoUrl"
  | "threadUrl"
  | "writingUrl"
  | "shortDescription"
  | "proofNotes";

export type BountyTypeConfig = {
  type: BountyType;
  label: string;
  lane: BountyLane;
  tag: string;
  example: string;
  submitHint: string;
  requiredSubmissionFields: SubmissionField[];
  optionalSubmissionFields: SubmissionField[];
  requirements: string[];
  judgingCriteria: string[];
};

export const BOUNTY_TYPE_CONFIG: Record<BountyType, BountyTypeConfig> = {
  hackathon: {
    type: "hackathon",
    label: "Hackathon",
    lane: "dev",
    tag: "HACKATHON",
    example: "Build X in 48hrs. Best working proof wins 500 POT.",
    submitHint: "GitHub repo, live proof link, and short description.",
    requiredSubmissionFields: ["githubRepoUrl", "previewUrl", "shortDescription"],
    optionalSubmissionFields: ["summary", "proofNotes"],
    requirements: [
      "Build a working proof or prototype within the posted time window.",
      "Show where the code lives and where the preview can be tested.",
      "Explain what works, what is missing, and what the judge should click first.",
    ],
    judgingCriteria: ["Working proof", "Technical clarity", "Product fit", "Proof quality"],
  },
  pr_bounty: {
    type: "pr_bounty",
    label: "PR Bounty",
    lane: "dev",
    tag: "PR BOUNTY",
    example: "Fix this GitHub issue. Merged PR wins.",
    submitHint: "GitHub PR link.",
    requiredSubmissionFields: ["githubPrUrl"],
    optionalSubmissionFields: ["summary", "proofNotes"],
    requirements: [
      "Submit a public GitHub pull request linked to the target issue.",
      "State the change clearly and include test/build proof when available.",
      "The bounty can be paid only after the PR is accepted or judged best by the poster.",
    ],
    judgingCriteria: ["Issue solved", "PR quality", "Tests/proof", "Maintainability"],
  },
  build_contest: {
    type: "build_contest",
    label: "Build Contest",
    lane: "dev",
    tag: "BUILD CONTEST",
    example: "Best implementation of feature Y wins 500 POT.",
    submitHint: "Repo link, live proof link, and short description.",
    requiredSubmissionFields: ["githubRepoUrl", "previewUrl", "shortDescription"],
    optionalSubmissionFields: ["summary", "proofNotes"],
    requirements: [
      "Implement the requested feature or workflow.",
      "Provide code and a runnable proof path.",
      "Call out limitations instead of hiding unfinished work.",
    ],
    judgingCriteria: ["Feature completeness", "UX/runtime proof", "Code quality", "Scope control"],
  },
  video_contest: {
    type: "video_contest",
    label: "Video Contest",
    lane: "creator",
    tag: "VIDEO",
    example: "Best explainer video for product Z wins.",
    submitHint: "YouTube or Loom link.",
    requiredSubmissionFields: ["videoUrl"],
    optionalSubmissionFields: ["summary", "proofNotes"],
    requirements: [
      "Submit a playable video link.",
      "Keep the message clear for the target audience.",
      "Mention editing status, runtime, and any assets used.",
    ],
    judgingCriteria: ["Message clarity", "Hook", "Visual proof", "Audience fit"],
  },
  thread_contest: {
    type: "thread_contest",
    label: "Thread Contest",
    lane: "creator",
    tag: "THREAD",
    example: "Best Twitter/X thread about topic W wins.",
    submitHint: "Twitter/X link.",
    requiredSubmissionFields: ["threadUrl"],
    optionalSubmissionFields: ["summary", "proofNotes"],
    requirements: [
      "Submit a public Twitter/X thread link or draft link.",
      "Make the angle specific, readable, and useful.",
      "Avoid engagement bait and generic promo language.",
    ],
    judgingCriteria: ["Opening hook", "Specificity", "Flow", "Usefulness"],
  },
  writing_bounty: {
    type: "writing_bounty",
    label: "Writing Bounty",
    lane: "creator",
    tag: "WRITING",
    example: "Best blog post or docs page wins.",
    submitHint: "Blog post or docs page link.",
    requiredSubmissionFields: ["writingUrl"],
    optionalSubmissionFields: ["summary", "proofNotes"],
    requirements: [
      "Submit a readable blog, docs page, or shareable draft.",
      "Keep the piece specific to the brief and audience.",
      "Include source/proof notes if claims depend on outside references.",
    ],
    judgingCriteria: ["Accuracy", "Structure", "Clarity", "Audience fit"],
  },
};

export const BOUNTY_TYPE_OPTIONS = BOUNTY_TYPES.map((type) => BOUNTY_TYPE_CONFIG[type]);

export function isBountyType(value: unknown): value is BountyType {
  return typeof value === "string" && BOUNTY_TYPES.includes(value as BountyType);
}

export function getBountyConfig(value: unknown): BountyTypeConfig {
  return isBountyType(value) ? BOUNTY_TYPE_CONFIG[value] : BOUNTY_TYPE_CONFIG.hackathon;
}
