import redisClient from "../config/redisClient";
import { randomUUID } from "crypto";
import { Card, Rank, Score, ScoreBoard, Suit } from "../utils/interfaces.util";

const createDeck = (): Card[] => {
  const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
  const ranks: Rank[] = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  let deck: Card[] = [];

  for (let suit of suits) {
    for (let rank of ranks) {
      deck.push({ suit, rank, id: randomUUID() });
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
    { joker: true, id: randomUUID(), color: "black" },
    { joker: true, id: randomUUID(), color: "red" }
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
    scoreBoard: null,
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
    activePlayerindex: number | null;
    activePlayerId: string | null;
    currentHand: number | null;
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

export const updateGameScoreBoard = async (
  roomId: string,
  scoreBoard: {
    playerId: string;
    playerName: string;
  }[]
) => {
  const game = await getGameInfo(roomId);
  if (!game) return;

  const updatedGame = {
    ...game,
    scoreBoard: scoreBoard.map((player) => ({
      ...player,
      scores: null,
    })),
  };

  await redisClient.hset("games", roomId, JSON.stringify(updatedGame));
  return updatedGame;
};

export const updateGameScore = async (
  roomId: string,
  playerId: string,
  score: Partial<{
    gameHand: number;
    bid: number;
    win: number;
    points: number;
  }>
) => {
  const game = await getGameInfo(roomId);
  if (!game) return;

  const updatedGame = {
    ...game,
    scoreBoard: game.scoreBoard.map((player: ScoreBoard) => {
      if (player.playerId !== playerId) return player;

      const scores = [...(player.scores || [])];
      const currentHandIndex = scores.findIndex(
        (s) => s.gameHand === score.gameHand
      );

      if (currentHandIndex >= 0) {
        // Update existing score
        scores[currentHandIndex] = {
          ...scores[currentHandIndex],
          ...score,
        };
      } else {
        // Add new score
        scores.push(score as Score);
      }

      return {
        ...player,
        scores,
      };
    }),
  };

  await redisClient.hset("games", roomId, JSON.stringify(updatedGame));
  return updatedGame;
};

export const removeGameInfo = async (roomId: string) => {
  await redisClient.hdel("games", roomId);
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
  console.log(
    "Dealt cards:",
    dealtCards.map((c: any) => `${c.suit}-${c.rank}`)
  );
  console.log("Selected trump card:", `${trumpCard.suit}-${trumpCard.rank}`);
  return trumpCard;
};
