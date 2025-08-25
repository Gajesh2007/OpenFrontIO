import { GameServer } from "../GameServer";
import { Logger } from "winston";

// Minimal ABI for the WagerPot contract
const WAGER_POT_ABI = [
  {
    type: "function",
    name: "createWager",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_gameId", type: "string" },
      { name: "_buyInAmount", type: "uint256" },
      { name: "_players", type: "address[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "reportWinner",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_gameId", type: "string" },
      { name: "_winner", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelWager",
    stateMutability: "nonpayable",
    inputs: [{ name: "_gameId", type: "string" }],
    outputs: [],
  },
];

function getEnv(key: string, fallback?: string): string | undefined {
  const v = process.env[key] ?? fallback;
  if (v === undefined || v === "") return undefined;
  return v;
}

async function getClient(log: Logger) {
  const rpcUrl = getEnv("ETH_RPC_URL");
  const pk = getEnv("WAGER_OWNER_PRIVATE_KEY");
  if (!rpcUrl || !pk) {
    log.warn(
      "wager: missing ETH_RPC_URL or WAGER_OWNER_PRIVATE_KEY; skipping onchain calls",
    );
    return null;
  }
  try {
    const viem = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const transport = viem.http(rpcUrl);
    const account = privateKeyToAccount(pk as `0x${string}`);
    const publicClient = viem.createPublicClient({ transport });
    const walletClient = viem.createWalletClient({ account, transport });
    return { viem, publicClient, walletClient };
  } catch (e) {
    log.error("wager: failed to initialize viem", e as Error);
    return null;
  }
}

async function getContract(log: Logger, game: GameServer) {
  const cli = await getClient(log);
  if (!cli) return null;
  const address = game.wager?.contractAddress ?? getEnv("WAGER_CONTRACT_ADDRESS");
  if (!address) {
    log.warn("wager: missing WAGER_CONTRACT_ADDRESS; skipping onchain calls");
    return null;
  }
  const { viem, walletClient } = cli;
  return {
    write: async (fn: string, args: unknown[]) =>
      walletClient.writeContract({
        address: address as `0x${string}`,
        abi: WAGER_POT_ABI as any,
        functionName: fn as any,
        args: args as any,
        chain: null,
      }),
    wait: async (hash: `0x${string}`) =>
      cli.publicClient.waitForTransactionReceipt({ hash }),
  } as const;
}

export async function tryCreateWager(game: GameServer, log: Logger): Promise<void> {
  try {
    if (!game.wager?.enabled) return;
    const buyInWei = game.wager.buyInWei;
    const players = game.wager.players ?? [];
    if (!buyInWei || players.length < 2) {
      log.warn("wager: missing buyInWei or players; skipping createWager", {
        buyInWei,
        numPlayers: players.length,
      });
      return;
    }

    const contract = await getContract(log, game);
    if (!contract) return;

    const hash = await contract.write("createWager", [game.id, BigInt(buyInWei), players]);
    await contract.wait(hash);
    log.info("wager: createWager broadcasted", { gameID: game.id, buyInWei, players });
  } catch (e) {
    log.error("wager: createWager failed", e as Error);
  }
}

export async function tryPayoutWager(game: GameServer, log: Logger): Promise<void> {
  try {
    if (!game.wager?.enabled) return;
    if (!game.winner?.winner) return;
    if (!game["gameStartInfo"]) return; // defensive (access private via index)

    const w = game.winner.winner;
    if (!Array.isArray(w) || w.length < 2) return;
    const isPlayer = w[0] === "player";
    if (!isPlayer) {
      log.warn("wager: non-player winners not supported for payout");
      return;
    }
    const winnerClientID: string = w[1] as string;

    const players = (game as any).gameStartInfo.players as Array<{ clientID: string }>;
    const addrList = game.wager.players ?? [];
    if (addrList.length !== players.length) {
      log.warn("wager: players/addresses length mismatch; cannot map winner to address", {
        numClients: players.length,
        numAddresses: addrList.length,
      });
      return;
    }
    const index = players.findIndex((p) => p.clientID === winnerClientID);
    if (index < 0) {
      log.warn("wager: could not find winner client in players list");
      return;
    }
    const winnerAddress = addrList[index];
    const contract = await getContract(log, game);
    if (!contract) return;
    const hash = await contract.write("reportWinner", [game.id, winnerAddress]);
    await contract.wait(hash);
    log.info("wager: payout reportWinner broadcasted", {
      gameID: game.id,
      winnerClientID,
      winnerAddress,
    });
  } catch (e) {
    log.error("wager: reportWinner failed", e as Error);
  }
}

export async function tryCancelWager(game: GameServer, log: Logger): Promise<void> {
  try {
    if (!game.wager?.enabled) return;
    const contract = await getContract(log, game);
    if (!contract) return;
    const hash = await contract.write("cancelWager", [game.id]);
    await contract.wait(hash);
    log.info("wager: cancelWager broadcasted", { gameID: game.id });
  } catch (e) {
    log.error("wager: cancelWager failed", e as Error);
  }
}


