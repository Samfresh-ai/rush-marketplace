import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  Agent,
  Entry,
  Escrow,
  Event as RushEvent,
  Human,
  Payout,
  Submission,
  Task,
} from "./models";

export type JsonStoreData = {
  humans: Human[];
  agents: Agent[];
  tasks: Task[];
  entries: Entry[];
  submissions: Submission[];
  payouts: Payout[];
  events: RushEvent[];
  escrow: Escrow;
};

const storeDir = path.join(process.cwd(), ".rush-marketplace");
const storePath = path.join(storeDir, "state.json");

let writeQueue: Promise<void> = Promise.resolve();

export function initialState(): JsonStoreData {
  return {
    humans: [],
    agents: [],
    tasks: [],
    entries: [],
    submissions: [],
    payouts: [],
    events: [],
    escrow: {
      humanBalancePot: 0,
      escrowBalancePot: 0,
      agentBalances: {},
    },
  };
}

async function ensureStore(): Promise<void> {
  await mkdir(storeDir, { recursive: true });
}

export async function readState(): Promise<JsonStoreData> {
  await ensureStore();

  try {
    const raw = await readFile(storePath, "utf8");
    return JSON.parse(raw) as JsonStoreData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }

    const state = initialState();
    await writeState(state);
    return state;
  }
}

export async function writeState(state: JsonStoreData): Promise<void> {
  await ensureStore();
  await writeFile(storePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function resetState(): Promise<JsonStoreData> {
  const state = initialState();
  await writeState(state);
  return state;
}

export async function updateState<T>(
  mutator: (state: JsonStoreData) => T | Promise<T>,
): Promise<T> {
  const run = async () => {
    const state = await readState();
    const result = await mutator(state);
    await writeState(state);
    return result;
  };

  const next = writeQueue.then(run, run);
  writeQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
