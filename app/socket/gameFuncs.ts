import redisClient from "../config/redisClient";
import { randomUUID } from "crypto";
import {
  HandBid,
  Card,
  Game,
  PlayedCard,
  Rank,
  Strength,
  Suit,
  HandWin,
  PlayingCard,
  HandPoint,
} from "../utils/interfaces.util";
import { getRoom } from "./roomFuncs";

const createDeck = (): Card[] => {
  const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
  const ranks: Rank[] = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  let deck: Card[] = [];

  const getStrength = (rank: Rank): Strength => {
    if (rank === "6") return 1;
    if (rank === "7") return 2;
    if (rank === "8") return 3;
    if (rank === "9") return 4;
    if (rank === "10") return 5;
    if (rank === "J") return 6;
    if (rank === "Q") return 7;
    if (rank === "K") return 8;
    if (rank === "A") return 9;
    return 1;
  };

  for (let suit of suits) {
    for (let rank of ranks) {
      deck.push({ suit, rank, strength: getStrength(rank), id: randomUUID() });
    }
  }

  deck = deck.filter(
    (card) =>
      !("rank" in card) ||
      !(
        (card.rank === "6" && card.suit === "clubs") ||
        (card.rank === "6" && card.suit === "spades")
      )
  );

  deck.push(
    { joker: true, strength: 10, id: randomUUID(), color: "black" },
    { joker: true, strength: 10, id: randomUUID(), color: "red" }
  );

  return deck;
};

const shuffle = (deck: Card[]): Card[] => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = deck[i];
    deck[i] = deck[j];
    deck[j] = temp;
  }
  return deck;
};

export const dealCards = (
  playerIds: string[],
  cardsPerPlayer: number
): Record<string, Card[]> => {
  let deck = shuffle(createDeck());
  const hands: Record<string, Card[]> = {};

  for (let playerId of playerIds) {
    hands[playerId] = deck.splice(0, cardsPerPlayer);
  }

  return hands;
};

export const determineDealer = (
  playerIds: string[]
): { dealerId: string; revealSequence: { playerId: string; card: Card }[] } => {
  const deck = shuffle(createDeck());
  const sequence: { playerId: string; card: Card }[] = [];
  let currentPlayerIndex = 0;
  let dealerId: string | null = null;

  const usedCardIds = new Set<string>();

  while (deck.length > 0) {
    const playerId = playerIds[currentPlayerIndex];
    const card = deck.shift();
    if (!card || usedCardIds.has(card.id)) continue;

    usedCardIds.add(card.id);

    const clonedCard = { ...card, id: randomUUID() };
    sequence.push({ playerId, card: clonedCard });

    if ("rank" in card && card.rank === "A") {
      dealerId = playerId;
      break;
    }

    currentPlayerIndex = (currentPlayerIndex + 1) % playerIds.length;
  }

  return {
    dealerId: dealerId || playerIds[0],
    revealSequence: sequence,
  };
};

export const getGameInfo = async (roomId: string) => {
  const game = await redisClient.hget("games", roomId);
  return game ? JSON.parse(game) : null;
};

export const createGameInfo = async (roomId: string) => {
  const existingGameInfo = await getGameInfo(roomId);
  if (existingGameInfo) return existingGameInfo;

  const initialGameInfo = {
    id: randomUUID(),
    roomId,
    status: "dealing",
    dealerId: null,
    currentHand: null,
    trumpCard: null,
    hands: null,
  };
  await redisClient.hset("games", roomId, JSON.stringify(initialGameInfo));
  return initialGameInfo;
};

export const updateGameInfo = async (
  roomId: string,
  gameData: Partial<{
    status: string;
    dealerId: string | null;
    players: string[] | null;
    currentPlayerId: string | null;
    currentHand: number | null;
    handCount: number | null;
    playedCards: PlayedCard[] | null;
    trumpCard: Card | null;
    hands: { hand: Card[]; playerId: string }[] | null;
  }>
) => {
  const game = await getGameInfo(roomId);
  if (!game) return;

  const updatedGame = {
    ...game,
    ...gameData,
  };

  await redisClient.hset("games", roomId, JSON.stringify(updatedGame));
  return updatedGame;
};

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
      (b: { gameHand: number; bid: number }) => b.gameHand === bid.gameHand
    );

    let updatedBids;
    if (existingGameHandBid) {
      updatedBids = playerBid.bids.map((b: { gameHand: number; bid: number }) =>
        b.gameHand === bid.gameHand ? { ...b, bid: bid.bid } : b
      );
    } else {
      updatedBids = [
        ...playerBid.bids,
        { gameHand: bid.gameHand, bid: bid.bid },
      ];
    }

    handBids[existingIndex] = {
      ...playerBid,
      bids: updatedBids,
    };
  } else {
    // Player doesn't exist in handBids yet — create it
    handBids.push({
      playerId: bid.playerId,
      bids: [{ gameHand: bid.gameHand, bid: bid.bid }],
    });
  }

  const updatedGame = { ...game, handBids };

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
          win: player === win.playerId ? win.win : 0,
        },
      ],
    }));
  } else {
    // handWins already initialized — just update or append current gameHand
    handWins = handWins.map((hw) => {
      if (hw.playerId === win.playerId) {
        const existingGameHand = hw.wins.find(
          (w) => w.gameHand === win.gameHand
        );
        let updatedWins;
        if (existingGameHand) {
          // Update existing gameHand win
          updatedWins = hw.wins.map((w) =>
            w.gameHand === win.gameHand ? { ...w, win: win.win } : w
          );
        } else {
          // Add new win entry
          updatedWins = [...hw.wins, { gameHand: win.gameHand, win: win.win }];
        }
        return { ...hw, wins: updatedWins };
      } else {
        // Ensure other players also have an entry for this gameHand with win: 0
        const hasGameHand = hw.wins.some((w) => w.gameHand === win.gameHand);
        if (!hasGameHand) {
          return {
            ...hw,
            wins: [...hw.wins, { gameHand: win.gameHand, win: 0 }],
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

export const setPlayedCards = async (
  roomId: string,
  playerId: string,
  playedCard: Card
) => {
  const game = await getGameInfo(roomId);
  if (!game) return;

  const updatedGameInfo = {
    ...game,
    playedCards: [...(game.playedCards || []), { playerId, card: playedCard }],
  };

  await redisClient.hset("games", roomId, JSON.stringify(updatedGameInfo));
};

export const clearPlayedCards = async (roomId: string) => {
  const game = await getGameInfo(roomId);
  if (!game) return;

  await redisClient.hset(
    "games",
    roomId,
    JSON.stringify({ ...game, playedCards: [] } as Game)
  );
};

export const removeGameInfo = async (roomId: string) => {
  await redisClient.hdel("games", roomId);
};

export const removeCardFromHand = async (
  roomId: string,
  playerId: string,
  card: Card
) => {
  const game = await getGameInfo(roomId);
  if (!game) return;

  const updatedGameInfo = {
    ...game,
    hands: game.hands?.map((hand: { playerId: string; hand: Card[] }) => {
      if (hand.playerId !== playerId) return hand;

      return {
        ...hand,
        hand: hand.hand.filter((c) => c.id !== card.id),
      };
    }),
  };

  await redisClient.hset("games", roomId, JSON.stringify(updatedGameInfo));
};

export const getTrumpCard = async (roomId: string) => {
  const gameInfo = await getGameInfo(roomId);
  if (!gameInfo || !gameInfo.hands) return null;

  let deck = createDeck();

  const dealtCards = gameInfo.hands.flatMap(
    (hand: { hand: Card; playerId: string }) => hand.hand
  );

  deck = deck.filter(
    (card: any) =>
      !dealtCards.some(
        (dealtCard: any) =>
          (dealtCard.joker && card.joker) ||
          (dealtCard.suit === card.suit && dealtCard.rank === card.rank)
      )
  );

  if (deck.length === 0) {
    console.log("No cards left in the deck");
    return null;
  }

  deck = shuffle(deck);
  const trumpCard: any = deck.pop();

  if (!trumpCard) return null;

  await updateGameInfo(roomId, { trumpCard });

  return trumpCard;
};

export const chooseTrumpCard = async (
  roomId: string,
  trumpCard: PlayingCard
) => {
  const gameInfo = await getGameInfo(roomId);
  if (!gameInfo) return;

  const updatedGameInfo = {
    ...gameInfo,
    trumpCard,
  };

  await redisClient.hset("games", roomId, JSON.stringify(updatedGameInfo));
  return updatedGameInfo;
};

export const getRoundCount = async (roomId: string) => {
  const roundCount = await redisClient.hget("roundCount", roomId);
  return roundCount ? JSON.parse(roundCount) : null;
};

export const setPlayRoundCount = async (roomId: string, count: number) => {
  const gameInfo = await getGameInfo(roomId);
  if (!gameInfo || count > gameInfo.currentHand) return;

  const newData = {
    roomId,
    count,
  };

  await redisClient.hset("roundCount", roomId, JSON.stringify(newData));
  return newData;
};

export const removeRoundCount = async (roomId: string) => {
  await redisClient.hdel("roundCount", roomId);
};

export const calculateAndUpdatePoints = async (roomId: string) => {
  const game = await getGameInfo(roomId);
  if (!game || !game.players || !game.handBids || !game.handWins) return;

  const room = await getRoom(roomId);
  if (!room) return;

  const { hisht } = room;

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
      (hb: HandBid) => hb.playerId === playerId
    );
    const bid =
      playerBid?.bids.find(
        (b: { gameHand: number; bid: number }) =>
          b.gameHand === game.currentHand
      )?.bid || 0;

    const playerWin = game.handWins.find(
      (hw: HandWin) => hw.playerId === playerId
    );
    const win =
      playerWin?.wins.find(
        (w: { gameHand: number; win: number }) =>
          w.gameHand === game.currentHand
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
      const difference = Math.abs(win - bid);
      points = difference * 10;
    }

    const playerPointsIndex = handPoints.findIndex(
      (hp) => hp.playerId === playerId
    );

    if (playerPointsIndex !== -1) {
      const existingPointIndex = handPoints[playerPointsIndex].points.findIndex(
        (p) => p.gameHand === game.currentHand
      );

      if (existingPointIndex !== -1) {
        handPoints[playerPointsIndex].points[existingPointIndex].point = points;
      } else {
        handPoints[playerPointsIndex].points.push({
          gameHand: game.currentHand,
          point: points,
        });
      }
    } else {
      handPoints.push({
        playerId,
        points: [{ gameHand: game.currentHand, point: points }],
      });
    }
  }

  const updatedGame = { ...game, handPoints };
  await redisClient.hset("games", roomId, JSON.stringify(updatedGame));
  return updatedGame;
};
