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
const blobStoreName = process.env.RUSH_BLOB_STORE_NAME?.trim() || "rush-marketplace";
const blobStateKey = process.env.RUSH_BLOB_STATE_KEY?.trim() || "state";

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

function shouldUseNetlifyBlobs(): boolean {
  const backend = process.env.RUSH_STORE_BACKEND?.trim();
  if (backend) {
    return backend === "netlify-blobs";
  }

  return process.env.NETLIFY === "true";
}

async function readBlobState(): Promise<JsonStoreData | null> {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore(blobStoreName);
  return (await store.get(blobStateKey, {
    consistency: "strong",
    type: "json",
  })) as JsonStoreData | null;
}

async function writeBlobState(state: JsonStoreData): Promise<void> {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore(blobStoreName);
  await store.setJSON(blobStateKey, state);
}

async function readFileState(): Promise<JsonStoreData> {
  await ensureStore();

  try {
    const raw = await readFile(storePath, "utf8");
    return JSON.parse(raw) as JsonStoreData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }

    const state = initialState();
    await writeFileState(state);
    return state;
  }
}

async function writeFileState(state: JsonStoreData): Promise<void> {
  await ensureStore();
  await writeFile(storePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function readState(): Promise<JsonStoreData> {
  if (shouldUseNetlifyBlobs()) {
    const existingState = await readBlobState();
    if (existingState) {
      return existingState;
    }
    const state = initialState();
    await writeState(state);
    return state;
  }

  return readFileState();
}

export async function writeState(state: JsonStoreData): Promise<void> {
  if (shouldUseNetlifyBlobs()) {
    await writeBlobState(state);
    return;
  }

  await writeFileState(state);
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
