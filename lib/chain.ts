import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { ApiPromise, WsProvider } from "@polkadot/api";
import { Abi } from "@polkadot/api-contract";
import { Keyring } from "@polkadot/keyring";
import { BN, compactStripLength, hexToU8a, u8aToHex } from "@polkadot/util";
import { cryptoWaitReady, decodeAddress, encodeAddress } from "@polkadot/util-crypto";

import { RushMarketplaceError } from "./escrow";
import type { Agent } from "./models";

type ChainTxResult = {
  txHash: string;
  chainTaskId: string;
};

type ChainMessage = "lock_bounty" | "release_bounty" | "get_bounty";
type ContractsTxName = "call" | "instantiateWithCode";
type ChainSigner = ReturnType<Keyring["addFromUri"]>;
type ContractTx = {
  hash?: { toHex?: () => string };
  signAndSend: (
    signer: ChainSigner,
    callback: (result: {
      dispatchError?: unknown;
      events: Array<{ event: unknown }>;
      status: { isFinalized?: boolean; type?: string; toString?: () => string };
      txHash?: { toHex: () => string };
    }) => void,
  ) => Promise<() => void>;
};

let apiPromise: Promise<ApiPromise> | null = null;
let abiPromise: Promise<Abi> | null = null;
let portaldotProvider: WsProvider | null = null;

function requireServer(): void {
  if (typeof window !== "undefined") {
    throw new RushMarketplaceError("Portaldot chain helpers are server-only.", 500);
  }
}

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function requiredEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new RushMarketplaceError(`USE_CHAIN=true but ${name} is missing.`);
  }
  return value;
}

async function withTimeout<T>(promise: Promise<T>, message: string, delayMs = 30_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new RushMarketplaceError(message, 504)), delayMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function integerEnv(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new RushMarketplaceError(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function bnEnv(name: string, fallback: string): BN {
  const raw = env(name) ?? fallback;
  if (!/^\d+$/.test(raw)) {
    throw new RushMarketplaceError(`${name} must be a non-negative integer.`);
  }
  return new BN(raw);
}

function ss58Format(): number {
  return integerEnv("PORTALDOT_SS58_FORMAT", 42);
}

export function isChainEnabled(): boolean {
  return env("USE_CHAIN") === "true";
}

export function potToBaseUnits(amountPot: number): bigint {
  if (!Number.isInteger(amountPot) || amountPot < 1) {
    throw new RushMarketplaceError("Bounty must be a positive integer POT amount before chain conversion.");
  }

  return BigInt(amountPot) * 10n ** BigInt(integerEnv("POT_DECIMALS", 14));
}

export function taskIdToChainTaskId(taskId: string): Uint8Array {
  if (!taskId) {
    throw new RushMarketplaceError("Task id is required for chain task id conversion.");
  }

  return createHash("sha256").update(taskId).digest();
}

export function taskIdToChainTaskIdHex(taskId: string): string {
  return `0x${Buffer.from(taskIdToChainTaskId(taskId)).toString("hex")}`;
}

export function explorerUrlForTx(txHash: string): string | undefined {
  const template = env("PORTALDOT_EXPLORER_TX_URL");
  if (!template) {
    return undefined;
  }

  return template.includes("{txHash}") ? template.replace("{txHash}", txHash) : `${template}${txHash}`;
}

export async function getPortaldotApi(): Promise<ApiPromise> {
  requireServer();
  if (!isChainEnabled()) {
    throw new RushMarketplaceError("Portaldot API requested while USE_CHAIN=false.", 500);
  }

  if (!apiPromise) {
    const url = requiredEnv("PORTALDOT_WS_URL");
    apiPromise = (async () => {
      const provider = new WsProvider(url, false, {}, integerEnv("PORTALDOT_RPC_TIMEOUT_MS", 60_000));
      try {
        portaldotProvider = provider;
        await provider.connect();
        await withTimeout(
          provider.isReady,
          `Chain call failed: unable to connect to Portaldot node at ${url}.`,
          integerEnv("PORTALDOT_CONNECT_TIMEOUT_MS", 30_000),
        );
        return await withTimeout(
          ApiPromise.create({ provider }),
          `Chain call failed: unable to initialize Portaldot API at ${url}.`,
          integerEnv("PORTALDOT_CONNECT_TIMEOUT_MS", 30_000),
        );
      } catch (error) {
        portaldotProvider = null;
        await provider.disconnect().catch(() => undefined);
        throw error;
      }
    })();
  }

  try {
    return await apiPromise;
  } catch (error) {
    apiPromise = null;
    portaldotProvider = null;
    throw error;
  }
}

export async function disconnectPortaldotApi(): Promise<void> {
  const api = apiPromise ? await apiPromise.catch(() => null) : null;
  await api?.disconnect().catch(() => undefined);
  await portaldotProvider?.disconnect().catch(() => undefined);
  apiPromise = null;
  abiPromise = null;
  portaldotProvider = null;
}

async function readContractMetadata(): Promise<unknown> {
  const metadataPath =
    env("PORTALDOT_CONTRACT_METADATA_PATH") ??
    "target/ink/escrow_vault/metadata.json";
  const resolved = path.isAbsolute(metadataPath)
    ? metadataPath
    : path.join(/* turbopackIgnore: true */ process.cwd(), metadataPath);

  try {
    return JSON.parse(await readFile(resolved, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RushMarketplaceError(
      `USE_CHAIN=true but contract metadata is missing or unreadable at ${resolved}: ${detail}`,
    );
  }
}

function contractAddress(): string {
  const address = requiredEnv("ESCROW_CONTRACT_ADDRESS");
  try {
    decodeAddress(address);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RushMarketplaceError(`USE_CHAIN=true but ESCROW_CONTRACT_ADDRESS is invalid: ${detail}`);
  }
  return address;
}

export async function getEscrowAbi(): Promise<Abi> {
  requireServer();
  if (!isChainEnabled()) {
    throw new RushMarketplaceError("Escrow contract ABI requested while USE_CHAIN=false.", 500);
  }

  if (!abiPromise) {
    const metadata = await readContractMetadata();
    const api = await getPortaldotApi();
    abiPromise = Promise.resolve(new Abi(metadata as Record<string, unknown>, api.registry.getChainProperties()));
  }

  return abiPromise;
}

async function signerFromMnemonic(envName: string): Promise<ReturnType<Keyring["addFromUri"]>> {
  await cryptoWaitReady();
  const keyring = new Keyring({ type: "sr25519", ss58Format: ss58Format() });
  return keyring.addFromUri(requiredEnv(envName));
}

export async function getTestChainSigner(): Promise<ReturnType<Keyring["addFromUri"]>> {
  requireServer();
  return signerFromMnemonic("HUMAN_MNEMONIC");
}

async function addressFromUri(uri: string): Promise<string> {
  await cryptoWaitReady();
  const keyring = new Keyring({ type: "sr25519", ss58Format: ss58Format() });
  const pair = keyring.addFromUri(uri);
  return pair.address;
}

function normalizeChainAddress(address: string, label = "Chain address"): string {
  try {
    return encodeAddress(decodeAddress(address), ss58Format());
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RushMarketplaceError(`${label} must be a valid Portaldot chain address: ${detail}`);
  }
}

function localTestChainEnabled(): boolean {
  const mode = env("CHAIN_MODE")?.toLowerCase();
  const url = env("PORTALDOT_WS_URL")?.toLowerCase() ?? "";
  return (
    mode === "test-chain" ||
    mode === "local-dev" ||
    mode === "dev" ||
    url.startsWith("ws://127.0.0.1") ||
    url.startsWith("ws://localhost") ||
    url.startsWith("ws://[::1]")
  );
}

function agentSlug(agentName: string): string {
  return agentName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function agentSpecificEnvName(agentName: string): string {
  const key = agentName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `RUSH_AGENT_${key}_MNEMONIC`;
}

const defaultAgentMnemonicEnvByName: Record<string, string> = {
  BuildHawk: "BUILD_HAWK_MNEMONIC",
  CopyAgent: "COPY_AGENT_MNEMONIC",
  DocSmith: "DOC_SMITH_MNEMONIC",
  GrowthAgent: "GROWTH_AGENT_MNEMONIC",
  ProofPilot: "PROOF_PILOT_MNEMONIC",
  RepoRunner: "REPO_RUNNER_MNEMONIC",
  TechAgent: "TECH_AGENT_MNEMONIC",
  VideoForge: "VIDEO_FORGE_MNEMONIC",
};

export function normalizeAgentChainAddress(address: string): string {
  return normalizeChainAddress(address, "Agent wallet");
}

export async function resolveTestChainAgentAccount(agentName: string): Promise<string | undefined> {
  requireServer();
  const exactEnvName = defaultAgentMnemonicEnvByName[agentName];
  const exactMnemonic = exactEnvName ? env(exactEnvName) : undefined;
  if (exactMnemonic) {
    return addressFromUri(exactMnemonic);
  }

  const customMnemonic = env(agentSpecificEnvName(agentName));
  if (customMnemonic) {
    return addressFromUri(customMnemonic);
  }

  if (localTestChainEnabled()) {
    return addressFromUri(`//RushMarketplace//${agentSlug(agentName) || "agent"}`);
  }

  return undefined;
}

export async function resolveWinnerAccount(agent: Agent): Promise<string> {
  requireServer();

  try {
    return normalizeChainAddress(agent.wallet, "Winner wallet");
  } catch {
    const account = await resolveTestChainAgentAccount(agent.name);
    if (account) {
      return account;
    }

    throw new RushMarketplaceError(
      "Winner does not have a valid chain address. Add a valid agent wallet or configure a test-chain recipient mnemonic.",
    );
  }
}

function contractsArgType(api: ApiPromise, txName: ContractsTxName, argName: string): string | undefined {
  const tx = api.tx.contracts?.[txName] as
    | { meta?: { args?: Array<{ name: { toString: () => string }; type: { toString: () => string } }> } }
    | undefined;
  const arg = tx?.meta?.args?.find((candidate) => candidate.name.toString() === argName);
  return arg?.type.toString();
}

function runtimeCallArgType(api: ApiPromise, argName: string): string | undefined {
  const call = api.call.contractsApi?.call as
    | { meta?: { params?: Array<{ name: { toString: () => string }; type: { toString: () => string } }> } }
    | undefined;
  const arg = call?.meta?.params?.find((candidate) => candidate.name.toString() === argName);
  return arg?.type.toString();
}

function isWeightV2(typeName: string | undefined): boolean {
  return Boolean(typeName && /WeightV2|SpWeightsWeightV2/i.test(typeName));
}

function gasLimit(api: ApiPromise, typeName: string | undefined): unknown {
  const refTime = bnEnv("PORTALDOT_GAS_REF_TIME", "1000000000000");
  if (isWeightV2(typeName)) {
    return api.registry.createType("WeightV2", {
      refTime,
      proofSize: bnEnv("PORTALDOT_GAS_PROOF_SIZE", "1000000"),
    });
  }

  return refTime;
}

function contractsCallHasStorageDepositLimit(api: ApiPromise): boolean {
  return Boolean(contractsArgType(api, "call", "storageDepositLimit"));
}

function encodeMessageData(abi: Abi, message: ChainMessage, args: unknown[]): Uint8Array {
  try {
    const encoded = abi.findMessage(message).toU8a(args);
    return compactStripLength(encoded)[1];
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RushMarketplaceError(`Contract metadata does not contain callable message ${message}: ${detail}`);
  }
}

function formatContractOutput(output: unknown): string {
  const value = output as { toHuman?: () => unknown; toString?: () => string };
  if (value?.toHuman) {
    return JSON.stringify(value.toHuman());
  }
  return value?.toString?.() ?? "Unknown contract output";
}

function formatDispatchError(api: ApiPromise, dispatchError: unknown): string {
  const error = dispatchError as {
    isModule?: boolean;
    asModule?: unknown;
    toString?: () => string;
  };

  if (error.isModule && error.asModule) {
    try {
      const decoded = api.registry.findMetaError(error.asModule as never);
      return `${decoded.section}.${decoded.name}: ${decoded.docs.join(" ")}`;
    } catch {
      return error.toString?.() ?? "Unknown module dispatch error";
    }
  }

  return error.toString?.() ?? "Unknown dispatch error";
}

function decimalLikeToHex(value: unknown): string {
  const text = (value as { toString?: () => string })?.toString?.();
  if (!text || !/^\d+$/.test(text)) {
    throw new RushMarketplaceError("Unable to encode Portaldot RPC numeric value.", 500);
  }
  return `0x${BigInt(text).toString(16).padStart(2, "0")}`;
}

function rpcGasLimit(api: ApiPromise, gas: unknown): unknown {
  if (isWeightV2(runtimeCallArgType(api, "gasLimit"))) {
    const value = gas as { refTime?: unknown; proofSize?: unknown };
    return {
      refTime: value.refTime?.toString?.() ?? bnEnv("PORTALDOT_GAS_REF_TIME", "1000000000000").toString(),
      proofSize: value.proofSize?.toString?.() ?? bnEnv("PORTALDOT_GAS_PROOF_SIZE", "1000000").toString(),
    };
  }

  return decimalLikeToHex(gas);
}

function formatRawContractError(api: ApiPromise, error: unknown): string {
  const value = error as
    | {
        Module?: { error?: number | string; index?: number | string; message?: string };
        module?: { error?: number | string; index?: number | string; message?: string };
      }
    | undefined;
  const moduleError = value?.Module ?? value?.module;

  if (moduleError?.message) {
    return moduleError.message;
  }

  if (moduleError?.index !== undefined && moduleError.error !== undefined) {
    void api;
    return `Module error index=${moduleError.index} error=${moduleError.error}`;
  }

  return formatContractOutput(error);
}

function buildContractsCall(
  api: ApiPromise,
  address: string,
  value: bigint,
  gas: unknown,
  data: Uint8Array,
): ContractTx {
  const call = api.tx.contracts?.call as ((...args: unknown[]) => ContractTx) | undefined;
  if (!call) {
    throw new RushMarketplaceError("Connected Portaldot node does not expose contracts.call.");
  }

  if (contractsCallHasStorageDepositLimit(api)) {
    return call(address, value.toString(), gas, null, u8aToHex(data));
  }

  return call(address, value.toString(), gas, u8aToHex(data));
}

async function submitContractTx(message: ChainMessage, value: bigint, args: unknown[]): Promise<string> {
  const address = contractAddress();
  const abi = await getEscrowAbi();
  const api = await getPortaldotApi();
  const signer = await getTestChainSigner();
  const data = encodeMessageData(abi, message, args);
  const gas = gasLimit(api, contractsArgType(api, "call", "gasLimit"));
  await preflightContractTx(api, abi, message, signer.address, address, value, gas, data);
  const tx = buildContractsCall(
    api,
    address,
    value,
    gas,
    data,
  );
  const extrinsicHash = (tx as { hash?: { toHex?: () => string } }).hash?.toHex?.();

  return new Promise((resolve, reject) => {
    let unsubscribe: (() => void) | undefined;
    let settled = false;
    const timeout = windowlessSetTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      unsubscribe?.();
      reject(new RushMarketplaceError("Transaction not finalized.", 504));
    }, integerEnv("PORTALDOT_TX_TIMEOUT_MS", 300_000));

    tx.signAndSend(signer, (result) => {
      if (settled || !result.status.isFinalized) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      unsubscribe?.();

      if (result.dispatchError) {
        reject(new RushMarketplaceError(`Chain call failed: ${formatDispatchError(api, result.dispatchError)}`));
        return;
      }

      const failure = result.events.find(({ event }) =>
        api.events.system.ExtrinsicFailed.is(event as never),
      );
      if (failure) {
        const dispatchError = (failure.event as { data: unknown[] }).data[0];
        reject(
          new RushMarketplaceError(
            `Transaction finalized with failure event: ${formatDispatchError(api, dispatchError)}`,
          ),
        );
        return;
      }

      const txHash = result.txHash?.toHex() ?? extrinsicHash;
      if (!txHash) {
        reject(new RushMarketplaceError("Transaction finalized but tx hash was unavailable.", 500));
        return;
      }

      resolve(txHash);
    })
      .then((nextUnsubscribe) => {
        unsubscribe = nextUnsubscribe;
      })
      .catch((error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        reject(new RushMarketplaceError(`Chain call failed: ${error instanceof Error ? error.message : String(error)}`));
      });
  });
}

function windowlessSetTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
  return setTimeout(callback, delay);
}

export async function lockBountyOnChain(input: {
  taskId: string;
  bountyPot: number;
}): Promise<ChainTxResult> {
  requireServer();
  const chainTaskId = taskIdToChainTaskIdHex(input.taskId);
  const expectedAmount = potToBaseUnits(input.bountyPot);
  const txHash = await submitContractTx("lock_bounty", expectedAmount, [
    Array.from(taskIdToChainTaskId(input.taskId)),
  ]);
  const lockedAmount = await getBountyOnChain(input.taskId);
  if (lockedAmount !== expectedAmount) {
    throw new RushMarketplaceError(
      `Chain lock verification failed: expected ${expectedAmount.toString()} base units, got ${lockedAmount.toString()}.`,
    );
  }

  return { txHash, chainTaskId };
}

export async function releaseBountyOnChain(input: {
  taskId: string;
  winnerAccount: string;
}): Promise<ChainTxResult> {
  requireServer();
  const chainTaskId = taskIdToChainTaskIdHex(input.taskId);
  const txHash = await submitContractTx("release_bounty", 0n, [
    Array.from(taskIdToChainTaskId(input.taskId)),
    input.winnerAccount,
  ]);
  const lockedAmount = await getBountyOnChain(input.taskId);
  if (lockedAmount !== 0n) {
    throw new RushMarketplaceError(
      `Chain release verification failed: expected 0 locked base units, got ${lockedAmount.toString()}.`,
    );
  }

  return { txHash, chainTaskId };
}

function unwrapContractResult(output: unknown): unknown {
  let current = output;
  for (let depth = 0; depth < 3; depth += 1) {
    const result = current as { isOk?: boolean; isErr?: boolean; asOk?: unknown; asErr?: unknown };
    if (result?.isErr) {
      throw new RushMarketplaceError(`Contract returned ${formatContractOutput(result.asErr)}`);
    }
    if (!result?.isOk) {
      return current;
    }
    current = result.asOk;
  }
  return current;
}

async function rawContractsCall(
  api: ApiPromise,
  request: {
    origin: string;
    dest: string;
    value: string;
    gasLimit: unknown;
    inputData: string;
  },
): Promise<{ debugMessage?: string; gasConsumed?: unknown; result?: unknown }> {
  const provider =
    portaldotProvider ??
    ((api as unknown as { _options?: { provider?: WsProvider } })._options?.provider);
  const send = provider?.send?.bind(provider) as
    | ((method: string, params: unknown[]) => Promise<unknown>)
    | undefined;
  if (!send) {
    throw new RushMarketplaceError("Connected Portaldot node does not expose raw RPC provider access.", 500);
  }

  return (await send("contracts_call", [request])) as {
    debugMessage?: string;
    gasConsumed?: unknown;
    result?: unknown;
  };
}

async function preflightContractTx(
  api: ApiPromise,
  abi: Abi,
  messageName: ChainMessage,
  origin: string,
  dest: string,
  value: bigint,
  gas: unknown,
  data: Uint8Array,
): Promise<void> {
  const result = await rawContractsCall(api, {
    origin,
    dest,
    value: `0x${value.toString(16).padStart(2, "0")}`,
    gasLimit: rpcGasLimit(api, gas),
    inputData: u8aToHex(data),
  });
  const contractResult = result.result as
    | { Err?: unknown; Ok?: { data?: string } }
    | undefined;

  if (contractResult?.Err) {
    throw new RushMarketplaceError(`Contract preflight failed: ${formatRawContractError(api, contractResult.Err)}`);
  }

  const outputData = contractResult?.Ok?.data;
  if (!outputData) {
    throw new RushMarketplaceError("Contract preflight did not return output data.", 500);
  }

  const message = abi.findMessage(messageName);
  const decoded = abi.registry.createTypeUnsafe(
    message.returnType?.lookupName || message.returnType?.type || "u128",
    [hexToU8a(outputData)],
  );
  unwrapContractResult(decoded);
}

export async function getBountyOnChain(taskId: string): Promise<bigint> {
  requireServer();
  const address = contractAddress();
  const abi = await getEscrowAbi();
  const api = await getPortaldotApi();
  const signer = await getTestChainSigner();
  const message = abi.findMessage("get_bounty");
  const data = encodeMessageData(abi, "get_bounty", [Array.from(taskIdToChainTaskId(taskId))]);
  const queryGas = gasLimit(api, runtimeCallArgType(api, "gasLimit"));
  const result = await rawContractsCall(api, {
    origin: signer.address,
    dest: address,
    value: "0x00",
    gasLimit: rpcGasLimit(api, queryGas),
    inputData: u8aToHex(data),
  });
  const contractResult = result.result as
    | { Err?: unknown; Ok?: { data?: string } }
    | undefined;

  if (contractResult?.Err) {
    throw new RushMarketplaceError(`Contract query failed: ${formatRawContractError(api, contractResult.Err)}`);
  }

  const outputData = contractResult?.Ok?.data;
  if (!outputData) {
    throw new RushMarketplaceError("Contract query did not return output data.", 500);
  }

  const decoded = abi.registry.createTypeUnsafe(
    message.returnType?.lookupName || message.returnType?.type || "u128",
    [hexToU8a(outputData)],
  );
  const value = unwrapContractResult(decoded);
  return BigInt((value as { toString: () => string }).toString());
}
