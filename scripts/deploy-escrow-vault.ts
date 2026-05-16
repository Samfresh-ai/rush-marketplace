import { readFile } from "node:fs/promises";
import path from "node:path";

import { ApiPromise, WsProvider } from "@polkadot/api";
import { Abi } from "@polkadot/api-contract";
import { Keyring } from "@polkadot/keyring";
import { compactStripLength, u8aToHex } from "@polkadot/util";
import { cryptoWaitReady } from "@polkadot/util-crypto";

type ChainSigner = ReturnType<Keyring["addFromUri"]>;

function env(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function resolvePath(value: string): string {
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

function finalizedTxHash(result: { txHash?: { toHex: () => string } }, fallback?: string): string {
  const hash = result.txHash?.toHex() ?? fallback;
  if (!hash) {
    throw new Error("Deployment finalized but no tx hash was available.");
  }
  return hash;
}

function isPublicUrl(wsUrl: string): boolean {
  return /^wss?:\/\//i.test(wsUrl) && !/(^wss?:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/i.test(wsUrl);
}

function bigintEnvValue(value: string, label: string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`${label} must be an integer base-unit value.`);
  }
}

function formatDispatchError(api: ApiPromise, dispatchError: unknown): string {
  const error = dispatchError as { isModule?: boolean; asModule?: unknown; toString?: () => string };
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

async function main(): Promise<void> {
  const wsUrl = env("PORTALDOT_WS_URL", "ws://127.0.0.1:9944");
  const metadataPath = resolvePath(env("PORTALDOT_CONTRACT_METADATA_PATH", "target/ink/escrow_vault/metadata.json"));
  const wasmPath = resolvePath(env("PORTALDOT_CONTRACT_WASM_PATH", "target/ink/escrow_vault/escrow_vault.wasm"));
  const mnemonic = env("HUMAN_MNEMONIC", "//Alice");
  const ss58Format = Number(env("PORTALDOT_SS58_FORMAT", "42"));
  const endowment = env("ESCROW_DEPLOY_ENDOWMENT", "1000000000000000");
  const gasLimit = env("PORTALDOT_DEPLOY_GAS_LIMIT", "500000000000");
  const salt = process.env.ESCROW_DEPLOY_SALT?.trim() || u8aToHex(Buffer.from(`rush-marketplace-${Date.now()}`));

  await cryptoWaitReady();
  const provider = new WsProvider(wsUrl);
  const api = await ApiPromise.create({ provider });

  try {
    const keyring = new Keyring({ type: "sr25519", ss58Format });
    if (isPublicUrl(wsUrl) && mnemonic.startsWith("//") && process.env.PORTALDOT_ALLOW_DEV_MNEMONIC !== "true") {
      throw new Error(
        "Refusing to deploy to a public Portaldot endpoint with a development mnemonic. Set HUMAN_MNEMONIC to a funded test-chain signer.",
      );
    }

    const signer = keyring.addFromUri(mnemonic);
    const account = await api.query.system.account(signer.address);
    const free = (account as unknown as { data: { free: { toBigInt: () => bigint } } }).data.free.toBigInt();
    const requiredEndowment = bigintEnvValue(endowment, "ESCROW_DEPLOY_ENDOWMENT");
    if (free < requiredEndowment) {
      throw new Error(
        `Signer ${signer.address} is not funded enough to deploy: free=${free.toString()} base units, required endowment=${requiredEndowment.toString()} base units.`,
      );
    }

    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as Record<string, unknown>;
    const abi = new Abi(metadata, api.registry.getChainProperties());
    const constructor = abi.findConstructor("new");
    const constructorData = u8aToHex(compactStripLength(constructor.toU8a([]))[1]);
    const wasm = await readFile(wasmPath);
    const code = u8aToHex(wasm);
    const instantiateWithCode = api.tx.contracts?.instantiateWithCode as
      | ((endowment: string, gasLimit: string, code: string, data: string, salt: string) => {
          hash?: { toHex?: () => string };
          signAndSend: (
            signer: ChainSigner,
            callback: (result: {
              dispatchError?: unknown;
              events: Array<{ event: unknown }>;
              status: { isFinalized?: boolean; toString: () => string };
              txHash?: { toHex: () => string };
            }) => void,
          ) => Promise<() => void>;
        })
      | undefined;

    if (!instantiateWithCode) {
      throw new Error("Connected Portaldot node does not expose contracts.instantiateWithCode.");
    }

    console.log(JSON.stringify({
      phase: "deploy_start",
      wsUrl,
      metadataPath,
      wasmPath,
      wasmBytes: wasm.length,
      endowment,
      gasLimit,
      constructorData,
      salt,
      signer: signer.address,
    }));

    const tx = instantiateWithCode(endowment, gasLimit, code, constructorData, salt);
    const extrinsicHash = tx.hash?.toHex?.();

    const result = await new Promise<{
      txHash: string;
      contractAddress: string;
      blockHash: string;
      events: Array<{ section: string; method: string; data: string[] }>;
    }>((resolve, reject) => {
      let unsubscribe: (() => void) | undefined;
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        unsubscribe?.();
        reject(new Error("Deployment transaction did not finalize before timeout."));
      }, Number(env("PORTALDOT_TX_TIMEOUT_MS", "300000")));

      tx.signAndSend(signer, (statusResult) => {
        if (settled) return;
        const eventNames = statusResult.events.map(({ event }) => {
          const value = event as { section?: string; method?: string };
          return `${value.section ?? "unknown"}.${value.method ?? "unknown"}`;
        });
        console.log(JSON.stringify({ phase: "status", status: statusResult.status.toString(), txHash: finalizedTxHash(statusResult, extrinsicHash), events: eventNames }));

        if (!statusResult.status.isFinalized) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        unsubscribe?.();

        if (statusResult.dispatchError) {
          reject(new Error(`Deployment failed: ${formatDispatchError(api, statusResult.dispatchError)}`));
          return;
        }

        const failure = statusResult.events.find(({ event }) => api.events.system.ExtrinsicFailed.is(event as never));
        if (failure) {
          const dispatchError = (failure.event as { data: unknown[] }).data[0];
          reject(new Error(`Deployment finalized with failure event: ${formatDispatchError(api, dispatchError)}`));
          return;
        }

        const instantiated = statusResult.events.find(({ event }) => api.events.contracts.Instantiated.is(event as never));
        if (!instantiated) {
          reject(new Error("Deployment finalized without contracts.Instantiated event."));
          return;
        }

        const eventData = (instantiated.event as { data: unknown[] }).data;
        const contractAddress = (eventData[1] as { toString: () => string }).toString();
        const blockHash = statusResult.status.toString();
        const events = statusResult.events.map(({ event }) => {
          const typed = event as { section: string; method: string; data: { toString: () => string }[] };
          return {
            section: typed.section,
            method: typed.method,
            data: typed.data.map((item) => item.toString()),
          };
        });

        resolve({
          txHash: finalizedTxHash(statusResult, extrinsicHash),
          contractAddress,
          blockHash,
          events,
        });
      })
        .then((nextUnsubscribe) => {
          unsubscribe = nextUnsubscribe;
        })
        .catch((error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error);
        });
    });

    console.log(JSON.stringify({ phase: "deploy_finalized", ...result }, null, 2));
  } finally {
    await api.disconnect().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
