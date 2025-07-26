import redisClient from "../config/redisClient";
import {
  HandBid,
  HandPoint,
  HandWin,
  Round,
  ScoreBoard,
} from "../utils/interfaces.util";
import { getGameInfo } from "./gameFuncs";
import { getRoom } from "./roomFuncs";

export const updateBids = async (
  roomId: string,
  bid: { playerId: string; gameHand: number; bid: number }
) => {
  const game = await getGameInfo(roomId);
  if (!game) return;

  let handBids = game.handBids || [];

  // Check if player already has a handBid
  const existingIndex = handBids.findIndex(
    (hb: HandBid) => hb.playerId === bid.playerId
  );

  if (existingIndex !== -1) {
    const playerBid = handBids[existingIndex];
    const existingGameHandBid = playerBid.bids.find(
      (b: { gameHand: number; handNumber: number; bid: number }) =>
        b.handNumber === game.handCount
    );

    let updatedBids;
    if (existingGameHandBid) {
      updatedBids = playerBid.bids.map(
        (b: { gameHand: number; handNumber: number; bid: number }) =>
          b.handNumber === game.handCount ? { ...b, bid: bid.bid } : b
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

  const updatedScoreBoard = game.scoreBoard.map((sb: ScoreBoard) => {
    if (sb.playerId === bid.playerId) {
      if (game.handCount > 0 && game.handCount <= 8) {
        sb.roundOne = sb.roundOne.map((r) => {
          if (r.handNumber === game.handCount) {
            return { ...r, bid: bid.bid };
          }
          return r;
        });
      } else if (game.handCount > 8 && game.handCount <= 12) {
        sb.roundTwo = sb.roundTwo.map((r) => {
          if (r.handNumber === game.handCount) {
            return { ...r, bid: bid.bid };
          }
          return r;
        });
      } else if (game.handCount > 12 && game.handCount <= 20) {
        sb.roundThree = sb.roundThree.map((r) => {
          if (r.handNumber === game.handCount) {
            return { ...r, bid: bid.bid };
          }
          return r;
        });
      } else if (game.handCount > 20 && game.handCount <= 24) {
        sb.roundFour = sb.roundFour.map((r) => {
          if (r.handNumber === game.handCount) {
            return { ...r, bid: bid.bid };
          }
          return r;
        });
      }
      return sb;
    }
  });

  const updatedGame = { ...game, handBids, updatedScoreBoard };

  await redisClient.hset("games", roomId, JSON.stringify(updatedGame));
  return updatedGame;
};

export const updateWins = async (
  roomId: string,
  win: { playerId: string; gameHand: number; win: number }
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
          (w) => w.handNumber === game.handCount
        );
        let updatedWins;
        if (existingGameHand) {
          // Update existing gameHand win
          updatedWins = hw.wins.map((w) =>
            w.handNumber === game.handCount
              ? { ...w, handNumber: game.handCount, win: win.win }
              : w
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
          (w) => w.handNumber === game.handCount
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

const isRoundEnded = (round: number, handCount: number): boolean => {
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

  let handPoints: HandPoint[] = game.handPoints || [];
  let updatedScoreBoard = game.scoreBoard;

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
      (hb: HandBid) => hb.playerId === playerId
    );
    const bid =
      playerBid?.bids.find(
        (b: { gameHand: number; handNumber: number; bid: number }) =>
          b.handNumber === game.handCount
      )?.bid || 0;

    const playerWin = game.handWins.find(
      (hw: HandWin) => hw.playerId === playerId
    );
    const win =
      playerWin?.wins.find(
        (w: { gameHand: number; handNumber: number; win: number }) =>
          w.handNumber === game.handCount
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
      (hp) => hp.playerId === playerId
    );

    if (playerPointsIndex !== -1) {
      const existingPointIndex = handPoints[playerPointsIndex].points.findIndex(
        (p) => p.handNumber === game.handCount
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
        if (game.handCount > 0 && game.handCount <= 8) {
          sb.roundOne = sb.roundOne.map((r) => {
            if (r.handNumber === game.handCount) {
              return { ...r, points: { ...r.points, value: points } };
            }
            return r;
          });
        } else if (game.handCount > 8 && game.handCount <= 12) {
          sb.roundTwo = sb.roundTwo.map((r) => {
            if (r.handNumber === game.handCount) {
              return { ...r, points: { ...r.points, value: points } };
            }
            return r;
          });
        } else if (game.handCount > 12 && game.handCount <= 20) {
          sb.roundThree = sb.roundThree.map((r) => {
            if (r.handNumber === game.handCount) {
              return { ...r, points: { ...r.points, value: points } };
            }
            return r;
          });
        } else if (game.handCount > 20 && game.handCount <= 24) {
          sb.roundFour = sb.roundFour.map((r) => {
            if (r.handNumber === game.handCount) {
              return { ...r, points: { ...r.points, value: points } };
            }
            return r;
          });
        }
      }
      return sb;
    });

    if (isRoundEnded(1, game.handCount)) {
      const bonusPlayers = new Set<string>();

      for (const playerId of game.players) {
        const playerScoreBoard = game.scoreBoard.find(
          (sb: ScoreBoard) => sb.playerId === playerId
        );
        if (!playerScoreBoard) continue;

        const playerBids = playerScoreBoard.roundOne.map(
          (r: Round) => r.bid || 0
        );
        const playerWins =
          game.handWins
            .find((hw: HandWin) => hw.playerId === playerId)
            ?.wins.filter(
              (w: { handNumber: number; win: number }) =>
                w.handNumber >= 1 && w.handNumber <= 8
            )
            .sort(
              (a: { handNumber: number }, b: { handNumber: number }) =>
                a.handNumber - b.handNumber
            )
            .map((w: { win: number }) => w.win) || [];

        const isLucky =
          playerBids.length === playerWins.length &&
          playerBids.every(
            (bid: number, index: number) => bid === playerWins[index]
          );

        if (isLucky) {
          bonusPlayers.add(playerId);
        }
      }

      game.scoreBoard = game.scoreBoard.map((sb: ScoreBoard) => {
        let bonus = 0;
        let cut = 0;

        if (bonusPlayers.has(sb.playerId)) {
          const points = sb.roundOne.map((r) => r.points.value);
          const biggestPoint = Math.max(...points);

          bonus = biggestPoint;

          const biggestPointHand = sb.roundOne.find(
            (r) => r.points.value === biggestPoint
          );

          if (biggestPointHand) {
            sb.roundOne = sb.roundOne.map((r) => {
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
            const points = sb.roundOne.map((r) => r.points.value);
            const biggestPoint = Math.max(...points);

            cut = biggestPoint;

            const biggestPointHand = sb.roundOne.find(
              (r) => r.points.value === biggestPoint
            );
            if (biggestPointHand) {
              sb.roundOne = sb.roundOne.map((r) => {
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

        sb.roundSumOne = formatRoundSum({
          points: sb.roundOne.map((r) => r.points.value),
          bonus,
          cut,
        });

        return sb;
      });
    } else if (isRoundEnded(2, game.handCount)) {
      const bonusPlayers = new Set<string>();

      for (const playerId of game.players) {
        const playerScoreBoard = game.scoreBoard.find(
          (sb: ScoreBoard) => sb.playerId === playerId
        );
        if (!playerScoreBoard) continue;

        const playerBids = playerScoreBoard.roundTwo.map(
          (r: Round) => r.bid || 0
        );
        const playerWins =
          game.handWins
            .find((hw: HandWin) => hw.playerId === playerId)
            ?.wins.filter(
              (w: { handNumber: number; win: number }) =>
                w.handNumber >= 9 && w.handNumber <= 12
            )
            .sort(
              (a: { handNumber: number }, b: { handNumber: number }) =>
                a.handNumber - b.handNumber
            )
            .map((w: { win: number }) => w.win) || [];

        const isLucky =
          playerBids.length === playerWins.length &&
          playerBids.every(
            (bid: number, index: number) => bid === playerWins[index]
          );

        if (isLucky) {
          bonusPlayers.add(playerId);
        }
      }

      game.scoreBoard = game.scoreBoard.map((sb: ScoreBoard) => {
        let bonus = 0;
        let cut = 0;

        if (bonusPlayers.has(sb.playerId)) {
          const points = sb.roundTwo.map((r) => r.points.value);
          const biggestPoint = Math.max(...points);

          bonus = biggestPoint;

          const biggestPointHand = sb.roundTwo.find(
            (r) => r.points.value === biggestPoint
          );

          if (biggestPointHand) {
            sb.roundTwo = sb.roundTwo.map((r) => {
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
            const points = sb.roundTwo.map((r) => r.points.value);
            const biggestPoint = Math.max(...points);

            cut = biggestPoint;

            const biggestPointHand = sb.roundTwo.find(
              (r) => r.points.value === biggestPoint
            );

            if (biggestPointHand) {
              sb.roundTwo = sb.roundTwo.map((r) => {
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

        sb.roundSumTwo = formatRoundSum({
          points: sb.roundTwo.map((r) => r.points.value),
          bonus,
          cut,
        });

        return sb;
      });
    } else if (isRoundEnded(3, game.handCount)) {
      game.scoreBoard = game.scoreBoard.map((sb: ScoreBoard) => {
        return sb;
      });
    } else if (isRoundEnded(4, game.handCount)) {
      game.scoreBoard = game.scoreBoard.map((sb: ScoreBoard) => {
        return sb;
      });
    }
  }

  const updatedGame = { ...game, handPoints };
  await redisClient.hset("games", roomId, JSON.stringify(updatedGame));
  return updatedGame;
};

export const createScoreBoard = async (roomId: string) => {
  const game = await getGameInfo(roomId);
  if (!game) return;

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
  });

  const updatedGame = { ...game, scoreBoard };
  await redisClient.hset("games", roomId, JSON.stringify(updatedGame));
  return updatedGame;
};
