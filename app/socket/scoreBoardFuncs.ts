import redisClient from "../config/redisClient";
import {
  Game,
  HandBid,
  HandPoint,
  HandWin,
  Round,
  ScoreBoard,
} from "../utils/interfaces.util";
import { getGameInfo, updateGameInfo } from "./gameFuncs";
import { getRoom } from "./roomFuncs";

export const updateBids = async (
  roomId: string,
  bid: { playerId: string; gameHand: number; bid: number },
) => {
  const game = await getGameInfo(roomId);
  if (!game) return;

  const room = await getRoom(roomId);
  if (!room) return;

  const gameType = room.type as "classic" | "nines";

  let handBids = game.handBids || [];

  // Check if player already has a handBid
  const existingIndex = handBids.findIndex(
    (hb: HandBid) => hb.playerId === bid.playerId,
  );

  if (existingIndex !== -1) {
    const playerBid = handBids[existingIndex];
    const existingGameHandBid = playerBid.bids.find(
      (b: { gameHand: number; handNumber: number; bid: number }) =>
        b.handNumber === game.handCount,
    );

    let updatedBids;
    if (existingGameHandBid) {
      updatedBids = playerBid.bids.map(
        (b: { gameHand: number; handNumber: number; bid: number }) =>
          b.handNumber === game.handCount ? { ...b, bid: bid.bid } : b,
      );
    } else {
      updatedBids = [
        ...playerBid.bids,
        { gameHand: bid.gameHand, handNumber: game.handCount, bid: bid.bid },
      ];
    }

    handBids[existingIndex] = {
      ...playerBid,
      bids: updatedBids,
    };
  } else {
    handBids.push({
      playerId: bid.playerId,
      bids: [
        { gameHand: bid.gameHand, handNumber: game.handCount, bid: bid.bid },
      ],
    });
  }

  const scoreBoard = (game.scoreBoard || []).map((sb: ScoreBoard) => {
    if (sb.playerId !== bid.playerId) return sb;

    const seg = getSegmentForHand(game.handCount, gameType);
    if (seg) {
      const roundKey = seg.key;
      (sb as any)[roundKey] = ((sb as any)[roundKey] as Round[]).map(
        (r: Round) => {
          if (r.handNumber === game.handCount) {
            return { ...r, bid: bid.bid };
          }
          return r;
        },
      );
    }

    return sb;
  });

  const updatedGame = { ...game, handBids, scoreBoard };

  await redisClient.hset("games", roomId, JSON.stringify(updatedGame));
  return updatedGame;
};

export const updateWins = async (
  roomId: string,
  win: { playerId: string; gameHand: number; win: number },
) => {
  const game = await getGameInfo(roomId);
  if (!game || !game.players) return;

  let handWins: HandWin[] = game.handWins || [];

  // First hand init — if handWins is empty, initialize all player entries
  if (handWins.length === 0) {
    handWins = game.players.map((player: string) => ({
      playerId: player,
      wins: [
        {
          gameHand: win.gameHand,
          handNumber: game.handCount,
          win: player === win.playerId ? win.win : 0,
        },
      ],
    }));
  } else {
    // handWins already initialized — just update or append current gameHand
    handWins = handWins.map((hw) => {
      if (hw.playerId === win.playerId) {
        const existingGameHand = hw.wins.find(
          (w) => w.handNumber === game.handCount,
        );
        let updatedWins;
        if (existingGameHand) {
          // Update existing gameHand win
          updatedWins = hw.wins.map((w) =>
            w.handNumber === game.handCount
              ? { ...w, handNumber: game.handCount, win: win.win }
              : w,
          );
        } else {
          // Add new win entry
          updatedWins = [
            ...hw.wins,
            {
              gameHand: win.gameHand,
              handNumber: game.handCount,
              win: win.win,
            },
          ];
        }
        return { ...hw, wins: updatedWins };
      } else {
        // Ensure other players also have an entry for this gameHand with win: 0
        const hasGameHand = hw.wins.some(
          (w) => w.handNumber === game.handCount,
        );
        if (!hasGameHand) {
          return {
            ...hw,
            wins: [
              ...hw.wins,
              { gameHand: win.gameHand, handNumber: game.handCount, win: 0 },
            ],
          };
        }
        return hw;
      }
    });
  }

  const updatedGame = { ...game, handWins };
  await redisClient.hset("games", roomId, JSON.stringify(updatedGame));
  return updatedGame;
};

export const createScoreBoard = async (roomId: string) => {
  const game = await getGameInfo(roomId);
  if (!game) return;

  const room = await getRoom(roomId);
  if (!room) return;

  const gameType = room.type as "classic" | "nines";

  let idCounter = 1;

  const scoreBoard = game.players.map((playerId: string) => {
    let handNumberCounter = 1;

    const createRound = (gameHands: number[]) => {
      return gameHands.map((gameHand) => ({
        id: idCounter++,
        gameHand,
        handNumber: handNumberCounter++,
        bid: null,
        points: {
          value: 0,
          isCut: false,
          isBonus: false,
        },
      }));
    };

    if (gameType === "nines") {
      return {
        playerId,
        roundOne: createRound([9, 9, 9, 9]),
        roundSumOne: null,
        roundTwo: createRound([9, 9, 9, 9]),
        roundSumTwo: null,
        roundThree: createRound([9, 9, 9, 9]),
        roundSumThree: null,
        roundFour: createRound([9, 9, 9, 9]),
        roundSumFour: null,
      };
    } else {
      return {
        playerId,
        roundOne: createRound([1, 2, 3, 4, 5, 6, 7, 8]),
        roundSumOne: null,
        roundTwo: createRound([9, 9, 9, 9]),
        roundSumTwo: null,
        roundThree: createRound([8, 7, 6, 5, 4, 3, 2, 1]),
        roundSumThree: null,
        roundFour: createRound([9, 9, 9, 9]),
        roundSumFour: null,
      };
    }
  });

  const updatedGame = { ...game, scoreBoard };
  await redisClient.hset("games", roomId, JSON.stringify(updatedGame));
  return updatedGame;
};

const isRoundEnded = (
  round: number,
  handCount: number,
  gameType: "classic" | "nines",
): boolean => {
  if (gameType === "nines") {
    switch (round) {
      case 1:
        return handCount === 4;
      case 2:
        return handCount === 8;
      case 3:
        return handCount === 12;
      case 4:
        return handCount === 16;
      default:
        return false;
    }
  } else {
    switch (round) {
      case 1:
        return handCount === 8;
      case 2:
        return handCount === 12;
      case 3:
        return handCount === 20;
      case 4:
        return handCount >= 24;
      default:
        return false;
    }
  }
};

const formatRoundSum = (data: {
  points: number[];
  bonus: number;
  cut: number;
}): number => {
  const sum = data.points.reduce((acc, curr) => acc + curr, 0);
  let total = sum;
  if (data.cut > 0) total -= data.cut;
  if (data.bonus > 0) total += data.bonus;
  return parseFloat((total / 100).toFixed(2));
};

export const calculateAndUpdatePoints = async (roomId: string) => {
  const game = await getGameInfo(roomId);
  if (!game || !game.players || !game.handBids || !game.handWins) return;

  const room = await getRoom(roomId);
  if (!room) return;

  const { hisht } = room;
  const gameType = room.type as "classic" | "nines";

  let handPoints: HandPoint[] = game.handPoints || [];

  // initialize handPoints if empty
  if (handPoints.length === 0) {
    handPoints = game.players.map((playerId: string) => ({
      playerId,
      points: [],
    }));
  }

  // calculate points for each player
  for (const playerId of game.players) {
    const playerBid = game.handBids.find(
      (hb: HandBid) => hb.playerId === playerId,
    );
    const bid =
      playerBid?.bids.find(
        (b: { gameHand: number; handNumber: number; bid: number }) =>
          b.handNumber === game.handCount,
      )?.bid || 0;

    const playerWin = game.handWins.find(
      (hw: HandWin) => hw.playerId === playerId,
    );
    const win =
      playerWin?.wins.find(
        (w: { gameHand: number; handNumber: number; win: number }) =>
          w.handNumber === game.handCount,
      )?.win || 0;

    let points = 0;

    if (bid === 0 && win === 0) {
      points = 50;
    } else if (bid > 0 && win === 0) {
      points = Number(-hisht);
    } else if (bid === win && bid === game.currentHand) {
      points = bid * 100;
    } else if (bid === win) {
      const pointMap: { [key: number]: number } = {
        1: 100,
        2: 150,
        3: 200,
        4: 250,
        5: 300,
        6: 350,
        7: 400,
        8: 450,
      };
      points = pointMap[bid] || 0;
    } else {
      points = win * 10;
    }

    const playerPointsIndex = handPoints.findIndex(
      (hp) => hp.playerId === playerId,
    );

    if (playerPointsIndex !== -1) {
      const existingPointIndex = handPoints[playerPointsIndex].points.findIndex(
        (p) => p.handNumber === game.handCount,
      );

      if (existingPointIndex !== -1) {
        handPoints[playerPointsIndex].points[existingPointIndex].point = points;
      } else {
        handPoints[playerPointsIndex].points.push({
          gameHand: game.currentHand,
          handNumber: game.handCount,
          point: points,
        });
      }
    } else {
      handPoints.push({
        playerId,
        points: [
          {
            gameHand: game.currentHand,
            handNumber: game.handCount,
            point: points,
          },
        ],
      });
    }

    game.scoreBoard = game.scoreBoard.map((sb: ScoreBoard) => {
      if (sb.playerId === playerId) {
        const seg = getSegmentForHand(game.handCount, gameType);
        if (seg) {
          const roundKey = seg.key;
          (sb as any)[roundKey] = ((sb as any)[roundKey] as Round[]).map(
            (r: Round) => {
              if (r.handNumber === game.handCount) {
                return { ...r, points: { ...r.points, value: points } };
              }
              return r;
            },
          );
        }
      }
      return sb;
    });
  }

  const calculateRoundBonus = (
    roundName: keyof ScoreBoard,
    handStart: number,
    handEnd: number,
  ) => {
    const bonusPlayers = new Set<string>();

    for (const playerId of game.players) {
      const playerScoreBoard = game.scoreBoard.find(
        (sb: ScoreBoard) => sb.playerId === playerId,
      );
      if (!playerScoreBoard) continue;

      const rounds = playerScoreBoard[roundName] as Round[];
      const playerBids = rounds.map((r: Round) => r.bid || 0);
      const playerWins = rounds.map((r: Round) => r.win || 0);

      const isLucky =
        playerBids.length === playerWins.length &&
        playerBids.every(
          (bid: number, index: number) => bid === playerWins[index],
        );

      if (isLucky) {
        bonusPlayers.add(playerId);
      }
    }

    game.scoreBoard = game.scoreBoard.map((sb: ScoreBoard) => {
      let bonus = 0;
      let cut = 0;

      if (bonusPlayers.has(sb.playerId)) {
        const points = (sb[roundName] as Round[]).map((r) => r.points.value);
        const biggestPoint = Math.max(...points);

        bonus = biggestPoint;

        const biggestPointHand = (sb[roundName] as Round[]).find(
          (r) => r.points.value === biggestPoint,
        );

        if (biggestPointHand) {
          (sb as any)[roundName] = (sb[roundName] as Round[]).map((r) => {
            if (r.id === biggestPointHand.id) {
              return {
                ...r,
                points: {
                  ...r.points,
                  isBonus: true,
                },
              };
            }
            return r;
          });
        }
      }

      if (!bonusPlayers.has(sb.playerId)) {
        const currentPlayerIndex = game.players.indexOf(sb.playerId);
        const prevPlayerIndex =
          currentPlayerIndex === 0
            ? game.players.length - 1
            : currentPlayerIndex - 1;
        const prevPlayerId = game.players[prevPlayerIndex];

        if (bonusPlayers.has(prevPlayerId)) {
          const points = (sb[roundName] as Round[]).map((r) => r.points.value);
          const biggestPoint = Math.max(...points);

          cut = biggestPoint;

          const biggestPointHand = (sb[roundName] as Round[]).find(
            (r) => r.points.value === biggestPoint,
          );
          if (biggestPointHand) {
            (sb as any)[roundName] = (sb[roundName] as Round[]).map((r) => {
              if (r.id === biggestPointHand.id) {
                return {
                  ...r,
                  points: {
                    ...r.points,
                    isCut: true,
                  },
                };
              }
              return r;
            });
          }
        }
      }

      const roundSumKey = roundName.replace(
        "round",
        "roundSum",
      ) as keyof ScoreBoard;
      (sb as any)[roundSumKey] = formatRoundSum({
        points: (sb[roundName] as Round[]).map((r) => r.points.value),
        bonus,
        cut,
      });
      return sb;
    });
  };

  if (isRoundEnded(1, game.handCount, gameType)) {
    const handEnd = gameType === "nines" ? 4 : 8;
    calculateRoundBonus("roundOne", 1, handEnd);
  } else if (isRoundEnded(2, game.handCount, gameType)) {
    const handStart = gameType === "nines" ? 5 : 9;
    const handEnd = gameType === "nines" ? 8 : 12;
    calculateRoundBonus("roundTwo", handStart, handEnd);
  } else if (isRoundEnded(3, game.handCount, gameType)) {
    const handStart = gameType === "nines" ? 9 : 13;
    const handEnd = gameType === "nines" ? 12 : 20;
    calculateRoundBonus("roundThree", handStart, handEnd);
  } else if (isRoundEnded(4, game.handCount, gameType)) {
    const handStart = gameType === "nines" ? 13 : 21;
    const handEnd = gameType === "nines" ? 16 : 24;
    calculateRoundBonus("roundFour", handStart, handEnd);
  }

  const updatedGame = { ...game, handPoints };
  await redisClient.hset("games", roomId, JSON.stringify(updatedGame));
  return updatedGame;
};

export const calculateTotalScores = async (roomId: string) => {
  const game = await getGameInfo(roomId);
  if (!game || !game.scoreBoard) return;
  const updatedScoreBoard = game.scoreBoard.map((sb: ScoreBoard) => {
    const totalSum =
      (sb.roundSumOne || 0) +
      (sb.roundSumTwo || 0) +
      (sb.roundSumThree || 0) +
      (sb.roundSumFour || 0);
    return { ...sb, totalSum: parseFloat(totalSum.toFixed(2)) };
  });

  const updatedGame = { ...game, scoreBoard: updatedScoreBoard };
  await redisClient.hset("games", roomId, JSON.stringify(updatedGame));
  return updatedGame;
};

function getSegmentForHand(
  handCount: number,
  gameType: "classic" | "nines",
): { key: keyof ScoreBoard; index: number } | null {
  if (gameType === "nines") {
    if (handCount >= 1 && handCount <= 4)
      return { key: "roundOne", index: handCount - 1 } as any;
    if (handCount >= 5 && handCount <= 8)
      return { key: "roundTwo", index: handCount - 5 } as any;
    if (handCount >= 9 && handCount <= 12)
      return { key: "roundThree", index: handCount - 9 } as any;
    if (handCount >= 13 && handCount <= 16)
      return { key: "roundFour", index: handCount - 13 } as any;
  } else {
    if (handCount >= 1 && handCount <= 8)
      return { key: "roundOne", index: handCount - 1 } as any;
    if (handCount >= 9 && handCount <= 12)
      return { key: "roundTwo", index: handCount - 9 } as any;
    if (handCount >= 13 && handCount <= 20)
      return { key: "roundThree", index: handCount - 13 } as any;
    if (handCount >= 21 && handCount <= 24)
      return { key: "roundFour", index: handCount - 21 } as any;
  }
  return null;
}

export const updateScoreBoardWins = async (roomId: string) => {
  const gi: Game | null = await getGameInfo(roomId);
  if (!gi || !gi.scoreBoard || !gi.handWins || gi.handWins.length === 0) return;
  if (!gi.handCount) return;

  const room = await getRoom(roomId);
  if (!room) return;

  const gameType = room.type as "classic" | "nines";

  const seg = getSegmentForHand(gi.handCount, gameType);
  if (!seg) return;

  const updateScore: ScoreBoard[] = gi.scoreBoard.map((row) => {
    const playerWinsEntry = (gi.handWins as HandWin[]).find(
      (w) => w.playerId === row.playerId,
    );
    const winsForHand =
      playerWinsEntry?.wins.find((w) => w.handNumber === gi.handCount)?.win ??
      null;

    const clone: ScoreBoard = JSON.parse(JSON.stringify(row));
    const rounds = (clone as any)[seg.key] as any[];
    if (Array.isArray(rounds) && rounds[seg.index]) {
      rounds[seg.index].win = winsForHand;
    }
    return clone;
  });

  await updateGameInfo(roomId, { scoreBoard: updateScore });
};
