import { Difficulty, GameMapType, GameMode, GameType } from "../core/game/Game";
import { GameConfig, GameID } from "../core/Schemas";
import { GamePhase, GameServer } from "./GameServer";
import { Client } from "./Client";
import { Logger } from "winston";
import { ServerConfig } from "../core/configuration/Config";
import { tryCreateWager, tryPayoutWager, tryCancelWager } from "./wager/WagerService";

export class GameManager {
  private games: Map<GameID, GameServer> = new Map();

  constructor(
    private readonly config: ServerConfig,
    private readonly log: Logger,
  ) {
    setInterval(() => this.tick(), 1000);
  }

  public game(id: GameID): GameServer | null {
    return this.games.get(id) ?? null;
  }

  addClient(client: Client, gameID: GameID, lastTurn: number): boolean {
    const game = this.games.get(gameID);
    if (game) {
      game.addClient(client, lastTurn);
      return true;
    }
    return false;
  }

  createGame(
    id: GameID,
    gameConfig: GameConfig | undefined,
    creatorClientID?: string,
  ) {
    const game = new GameServer(
      id,
      this.log,
      Date.now(),
      this.config,
      {
        bots: 400,
        difficulty: Difficulty.Medium,
        disableNPCs: false,
        disabledUnits: [],
        donateGold: false,
        donateTroops: false,
        gameMap: GameMapType.World,
        gameMode: GameMode.FFA,
        gameType: GameType.Private,
        infiniteGold: false,
        infiniteTroops: false,
        instantBuild: false,
        ...gameConfig,
      },
      creatorClientID,
    );
    this.games.set(id, game);
    return game;
  }

  activeGames(): number {
    return this.games.size;
  }

  activeClients(): number {
    let totalClients = 0;
    this.games.forEach((game: GameServer) => {
      totalClients += game.activeClients.length;
    });
    return totalClients;
  }

  tick() {
    const active = new Map<GameID, GameServer>();
    for (const [id, game] of this.games) {
      const phase = game.phase();
      if (phase === GamePhase.Active) {
        if (!game.hasStarted()) {
          // Prestart tells clients to start loading the game.
          game.prestart();
          // Start game on delay to allow time for clients to connect.
          setTimeout(() => {
            try {
              game.start();
              // Attempt to create wager on-chain if configured
              void tryCreateWager(game, this.log);
            } catch (error) {
              this.log.error(`error starting game ${id}: ${error}`);
            }
          }, 2000);
        }
      }

      if (phase === GamePhase.Finished) {
        try {
          game.end();
          // If concluded with a winner, attempt payout
          if (game.winner !== null) {
            void tryPayoutWager(game, this.log);
          } else {
            // If ended without a winner, cancel wager
            void tryCancelWager(game, this.log);
          }
        } catch (error) {
          this.log.error(`error ending game ${id}: ${error}`);
        }
      } else {
        active.set(id, game);
      }
    }
    this.games = active;
  }
}
