import { Server } from "socket.io";
import {
  dealCards,
  dealRemainingToNine,
  determineDealer,
  getGameInfo,
  getRoundCount,
  getTrumpCard,
  setLastPlayedCards,
  setPlayRoundCount,
  updateGameInfo,
} from "./gameFuncs";
import { destroyRoom, getRoom, getRooms } from "./roomFuncs";
import { startServerTimer } from "./timer";
import { getHandNumber } from "../utils/helper";
import { Card, Game, HandWin, PlayedCard } from "../utils/interfaces.util";
import {
  calculateAndUpdatePoints,
  calculateTotalScores,
  updateScoreBoardWins,
  updateWins,
} from "./scoreBoardFuncs";

export const dealerRevealControllers: Record<
  string,
  {
    sequence: { playerId: string; card: any }[];
    currentIndex: number;
    timeout?: NodeJS.Timeout;
    isActive: boolean;
    isInitialSequence?: boolean;
  }
> = {};

const gameFlowLocks: Record<string, boolean> = {};

export const handleDetermineDealer = async (roomId: string, io: Server) => {
  const existing = dealerRevealControllers[roomId];
  if (existing && (existing.isActive || existing.timeout)) return;

  const room = await getRoom(roomId);
  if (!room) return;

  const allPlayers = room.users
    .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id))
    .map((user: { id: string }) => user.id);

  if (allPlayers.length === 0) return;

  const { revealSequence } = determineDealer(allPlayers);

  dealerRevealControllers[roomId] = {
    sequence: revealSequence,
    currentIndex: 0,
    isActive: false,
    isInitialSequence: true,
  };
  io.to(roomId).emit("dealerRevealPrepare");
  startDealerReveal(roomId, io);
};

export const handleStartRound = async (
  roomId: string,
  round: number,
  io: Server,
) => {
  const room = await getRoom(roomId);
  if (!room) return;

  const gameInfo = await getGameInfo(roomId);
  if (!gameInfo || !gameInfo.dealerId) return;

  const players = room.users
    .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id))
    .map((user: { id: string }) => user.id);

  const dealerIndex = players.indexOf(gameInfo.dealerId);
  const nextPlayerId = players[(dealerIndex + 1) % players.length];

  const cardsPerPlayer = round === 9 ? 3 : round;
  const hands = dealCards(players, cardsPerPlayer);

  const newHands: { hand: Card[]; playerId: string }[] = [];

  for (const playerId of players) {
    io.to(roomId).emit("dealCards", {
      hand: hands[playerId],
      playerId,
      round: cardsPerPlayer,
    });

    newHands.push({
      hand: hands[playerId],
      playerId,
    });
  }

  await updateGameInfo(roomId, {
    hands: newHands,
    currentHand: round,
    players,
    currentPlayerId: nextPlayerId,
    status: "dealing",
  });

  const updated = await getGameInfo(roomId);
  if (updated) io.to(roomId).emit("getGameInfo", updated);
};

export const completeNineDealing = async (roomId: string, io: Server) => {
  const gi = await getGameInfo(roomId);
  if (!gi || gi.currentHand !== 9 || !gi.hands) return;

  const alreadyFull = gi.hands.every(
    (h: { hand: Card[] }) => h.hand.length >= 9,
  );
  if (alreadyFull) return;

  const updatedHands = await dealRemainingToNine(roomId);
  if (!updatedHands) return;

  await updateGameInfo(roomId, {
    hands: updatedHands,
    status: "dealing",
  });

  for (const h of updatedHands) {
    const previousCount =
      gi.hands.find(
        (hand: { playerId: string }) => hand.playerId === h.playerId,
      )?.hand.length || 0;
    const newCardsCount = h.hand.length - previousCount;

    io.to(roomId).emit("dealCards", {
      hand: h.hand,
      playerId: h.playerId,
      round: newCardsCount,
    });
  }

  const updated = await getGameInfo(roomId);
  if (updated) io.to(roomId).emit("getGameInfo", updated);
};

export const determineRoundWinner = async (
  roomId: string,
  playedCards: PlayedCard[],
): Promise<PlayedCard | null> => {
  if (!playedCards || playedCards.length !== 4) return null;

  const game = await getGameInfo(roomId);
  if (!game || !game.trumpCard) return null;

  const isRealSuit = (
    s: any,
  ): s is "hearts" | "diamonds" | "clubs" | "spades" =>
    s === "hearts" || s === "diamonds" || s === "clubs" || s === "spades";

  const trumpSuit = isRealSuit(game.trumpCard.suit)
    ? game.trumpCard.suit
    : null;

  const withIndex = playedCards.map((pc, idx) => ({ ...pc, playOrder: idx }));

  const lead = withIndex[0];

  if (lead.card.joker && lead.card.type === "need") {
    const requestedSuit = lead.card.requestedSuit;

    // If any subsequent "need" joker was played, the LAST one wins
    const subsequentNeed = withIndex.filter(
      (pc) => pc.playOrder > 0 && pc.card.joker && pc.card.type === "need",
    );
    if (subsequentNeed.length > 0) {
      const lastNeed = subsequentNeed.reduce((a, b) =>
        a.playOrder > b.playOrder ? a : b,
      );
      const { playOrder, ...winner } = lastNeed;
      return winner;
    }

    if (trumpSuit && requestedSuit === trumpSuit) {
      const { playOrder, ...winner } = lead;
      return winner;
    } else {
      // Requested non-trump: if any trump was played, highest trump wins; else leader wins
      const trumpsPlayed = trumpSuit
        ? withIndex.filter((pc) => !pc.card.joker && pc.card.suit === trumpSuit)
        : [];
      if (trumpsPlayed.length > 0) {
        const highestTrump = trumpsPlayed.reduce((h, c) =>
          (c.card.strength || 0) > (h.card.strength || 0) ? c : h,
        );
        const { playOrder, ...winner } = highestTrump;
        return winner;
      }
      const { playOrder, ...winner } = lead;
      return winner;
    }
  }

  // Subsequent "need" jokers (not leading) – the LAST one wins
  const subsequentNeedJokers = withIndex.filter(
    (pc) => pc.card.joker && pc.card.type === "need" && pc.playOrder > 0,
  );
  if (subsequentNeedJokers.length > 0) {
    const lastNeedJoker = subsequentNeedJokers.reduce((a, b) =>
      a.playOrder > b.playOrder ? a : b,
    );
    const { playOrder, ...winner } = lastNeedJoker;
    return winner;
  }

  // Determine the lead suit (joker lead uses requestedSuit)
  let leadSuit: string | null | undefined = lead.card.suit;
  if (lead.card.joker) {
    leadSuit = lead.card.requestedSuit;
  }

  // Filter out "pass" jokers; also if a "takes" joker led, it cannot win
  let contenders = withIndex.filter(
    (pc) => !(pc.card.joker && pc.card.type === "pass"),
  );
  if (lead.card.joker && lead.card.type === "takes") {
    contenders = contenders.filter((pc) => pc.playOrder !== 0);
  }

  // Any trumps among contenders?
  const trumps = trumpSuit
    ? contenders.filter((pc) => pc.card.suit === trumpSuit)
    : [];
  if (trumps.length > 0) {
    const highestTrump = trumps.reduce((h, c) =>
      (c.card.strength || 0) > (h.card.strength || 0) ? c : h,
    );
    const { playOrder, ...winner } = highestTrump;
    return winner;
  }

  // Otherwise highest of lead suit
  const leadSuitCards = contenders.filter((pc) => pc.card.suit === leadSuit);
  if (leadSuitCards.length > 0) {
    const highestLead = leadSuitCards.reduce((h, c) =>
      (c.card.strength || 0) > (h.card.strength || 0) ? c : h,
    );
    const { playOrder, ...winner } = highestLead;
    return winner;
  }

  // Fallback: leader wins
  const { playOrder, ...winner } = lead;
  return winner;
};

export const handleEndRound = async (
  roomId: string,
  gameInfo: Game,
  io: Server,
) => {
  io.to(roomId).emit("getGameInfo", gameInfo);
  const winnerCard = await determineRoundWinner(
    roomId,
    gameInfo.playedCards as PlayedCard[],
  );
  if (!winnerCard) {
    console.error(
      `[playCard] determineRoundWinner returned null, skipping round end`,
    );
    return;
  }

  io.to(roomId).emit("roundWinner", winnerCard);

  const winCount =
    gameInfo.handWins
      ?.find((hw: HandWin) => hw.playerId === winnerCard.playerId)
      ?.wins.find(
        (w: { handNumber: number }) => w.handNumber === gameInfo.handCount,
      )?.win || 0;

  await updateWins(roomId, {
    playerId: winnerCard.playerId,
    win: winCount + 1,
    gameHand: gameInfo.currentHand as number,
  });
  await setLastPlayedCards(roomId, gameInfo.playedCards as PlayedCard[]);
  await updateGameInfo(roomId, {
    currentPlayerId: winnerCard.playerId,
    playedCards: null,
  });

  const roundCount = await getRoundCount(roomId);
  if (roundCount === undefined) return;
  await setPlayRoundCount(roomId, roundCount + 1);

  const latestGameInfo = await getGameInfo(roomId);
  if (!latestGameInfo) return;
  io.to(roomId).emit("getGameInfo", latestGameInfo);

  const latestRoundCount = await getRoundCount(roomId);
  if (!latestRoundCount) return;

  if (latestRoundCount === latestGameInfo.currentHand) {
    await calculateAndUpdatePoints(roomId);
    await updateScoreBoardWins(roomId);
    const scoreGi = await getGameInfo(roomId);
    if (scoreGi) io.to(roomId).emit("getGameInfo", scoreGi);

    setTimeout(async () => {
      const nextDealer =
        latestGameInfo.players[
          (latestGameInfo.players.indexOf(latestGameInfo.dealerId as string) +
            1) %
            latestGameInfo.players.length
        ];
      const nextDealerIndex = latestGameInfo.players.findIndex(
        (p: string) => p === nextDealer,
      );
      const nextPlayer =
        latestGameInfo.players[
          (nextDealerIndex + 1) % latestGameInfo.players.length
        ];

      await updateGameInfo(roomId, {
        handCount: !latestGameInfo.handCount ? 1 : latestGameInfo.handCount + 1,
        status: "waiting",
        trumpCard: null,
        dealerId: nextDealer,
        currentPlayerId: nextPlayer,
        hands: null,
        lastPlayedCards: null,
        handBids: null,
        handWins: null,
      });
      await setPlayRoundCount(roomId, 0);

      const finalGameInfo = await getGameInfo(roomId);
      if (!finalGameInfo) return;
      io.to(roomId).emit("getGameInfo", finalGameInfo);
      setTimeout(() => handleGameState(roomId, io), 0);
    }, 1500);
  } else {
    await startServerTimer(roomId, winnerCard.playerId, io, "playing");
  }
};

export const handleGameState = async (roomId: string, io: Server) => {
  if (gameFlowLocks[roomId]) {
    setTimeout(() => handleGameState(roomId, io), 50);
    return;
  }
  gameFlowLocks[roomId] = true;

  try {
    const gameInfo = await getGameInfo(roomId);
    if (!gameInfo) return;

    switch (gameInfo.status) {
      case "dealing": {
        // if (!gameInfo.dealerId) {
        //   if (
        //     dealerRevealControllers[roomId]?.isActive ||
        //     dealerRevealControllers[roomId]?.timeout
        //   )
        //     return;
        //   await handleDetermineDealer(roomId, io);
        //   return;
        // }

        // if (!gameInfo.hands || gameInfo.hands.length === 0) {
        //   const room = await getRoom(roomId);
        //   const gameType = (room?.type as "classic" | "nines") || "classic";
        //   const round = getHandNumber(gameInfo.handCount || 1, gameType);

        //   await handleStartRound(roomId, round, io);
        //   return;
        // } else if (
        //   gameInfo.currentHand === 9 &&
        //   !gameInfo.trumpCard &&
        //   gameInfo.hands.every((h: any) => h.hand.length === 3)
        // ) {
        //   const dealerIndex = gameInfo.players.indexOf(
        //     gameInfo.dealerId as string,
        //   );
        //   const nextPlayerId =
        //     gameInfo.players[(dealerIndex + 1) % gameInfo.players.length];

        //   await updateGameInfo(roomId, {
        //     status: "choosingTrump",
        //     currentPlayerId: nextPlayerId,
        //   });
        //   io.to(roomId).emit("getGameInfo", await getGameInfo(roomId));
        //   setTimeout(() => handleGameState(roomId, io), 0);
        // }
        return;
      }

      case "choosingTrump": {
        if (!gameInfo.trumpCard && gameInfo.currentPlayerId) {
          await startServerTimer(roomId, gameInfo.currentPlayerId, io, "trump");
          return;
        }

        if (
          gameInfo.trumpCard &&
          gameInfo.currentHand === 9 &&
          Array.isArray(gameInfo.hands) &&
          gameInfo.hands.every((h: any) => h.hand.length === 3)
        ) {
          await completeNineDealing(roomId, io);
          setTimeout(() => handleGameState(roomId, io), 0);
        }
        return;
      }

      case "trump":
        if (gameInfo.currentHand === 9) break;

        if (!gameInfo.trumpCard) {
          await getTrumpCard(roomId);
        }
        const updatedGame = await getGameInfo(roomId);
        if (updatedGame.trumpCard) {
          await updateGameInfo(roomId, { status: "bid" });
          io.to(roomId).emit("getGameInfo", await getGameInfo(roomId));
          setTimeout(() => handleGameState(roomId, io), 0);
        }
        break;

      case "bid":
      case "playing":
        if (gameInfo.currentPlayerId) {
          await startServerTimer(
            roomId,
            gameInfo.currentPlayerId,
            io,
            gameInfo.status,
          );
        }
        break;

      case "waiting":
        const room = await getRoom(roomId);
        const gameType = (room?.type as "classic" | "nines") || "classic";
        const totalHands = gameType === "nines" ? 16 : 24;

        if ((gameInfo.handCount || 0) > totalHands) {
          await updateGameInfo(roomId, { status: "finished" });
          await calculateTotalScores(roomId);
          io.to(roomId).emit("getGameInfo", await getGameInfo(roomId));

          setTimeout(async () => {
            try {
              console.log(
                `[Gameflow] Auto-destroying finished room: ${roomId}`,
              );
              await destroyRoom(roomId);

              io.to(roomId).emit("roomDestroyed", { roomId });

              const updatedRooms = await getRooms();
              io.emit("getRooms", updatedRooms);

              console.log(`[GameFlow] Successfully destroyed room: ${roomId}`);
            } catch (error) {
              console.error(
                `[GameFlow] Error destroying room ${roomId}:`,
                error,
              );
            }
          }, 60000);

          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
        const nextHandNum = getHandNumber(gameInfo.handCount || 1, gameType);

        const dealerIndex = gameInfo.players.indexOf(
          gameInfo.dealerId as string,
        );
        const nextPlayerId =
          gameInfo.players[(dealerIndex + 1) % gameInfo.players.length];

        await updateGameInfo(roomId, {
          status: "dealing",
          currentHand: nextHandNum,
          currentPlayerId: nextPlayerId,
          playedCards: [],
          handBids: [],
          handWins: [],
          hands: null,
          trumpCard: null,
        });

        io.to(roomId).emit("getGameInfo", await getGameInfo(roomId));
        setTimeout(() => handleGameState(roomId, io), 0);
        break;
    }
  } finally {
    gameFlowLocks[roomId] = false;
  }
};

export const startDealerReveal = (roomId: string, io: Server) => {
  const controller = dealerRevealControllers[roomId];
  if (!controller || controller.isActive) return;

  controller.isActive = true;
  controller.currentIndex = 0;

  const cardsByPlayer: Record<string, { playerId: string; card: any }[]> = {};
  controller.sequence.forEach((item) => {
    if (!cardsByPlayer[item.playerId]) cardsByPlayer[item.playerId] = [];
    cardsByPlayer[item.playerId].push(item);
  });

  // Preserve the original play order for players (round-robin), do not sort keys
  const turnOrder: string[] = [];
  for (const s of controller.sequence) {
    if (!turnOrder.includes(s.playerId)) turnOrder.push(s.playerId);
  }

  const maxRounds = Math.max(
    ...turnOrder.map((pid) => cardsByPlayer[pid]?.length || 0),
  );

  const roundRobinSequence: { playerId: string; card: any }[] = [];
  for (let round = 0; round < maxRounds; round++) {
    for (const pid of turnOrder) {
      if (cardsByPlayer[pid] && cardsByPlayer[pid][round]) {
        roundRobinSequence.push(cardsByPlayer[pid][round]);
      }
    }
  }

  const initialDelay = controller.isInitialSequence ? 1000 : 0;

  const sendNextCard = async () => {
    if (controller.timeout) {
      clearTimeout(controller.timeout);
    }

    if (controller.currentIndex >= roundRobinSequence.length) {
      const dealerCard = roundRobinSequence.find(
        (s) => "rank" in s.card && s.card.rank === "A",
      );
      const dealerId =
        dealerCard?.playerId || roundRobinSequence[0]?.playerId || "";

      io.to(roomId).emit("dealerRevealDone", { dealerId });

      await updateGameInfo(roomId, { dealerId });

      const updatedGame = await getGameInfo(roomId);
      io.to(roomId).emit("getGameInfo", updatedGame);

      setTimeout(async () => {
        await handleGameState(roomId, io);
      }, 1500);

      delete dealerRevealControllers[roomId];
      return;
    }

    const step = roundRobinSequence[controller.currentIndex];

    io.to(roomId).emit("dealerRevealStep", {
      targetPlayerId: step.playerId,
      card: step.card,
    });

    controller.currentIndex++;

    const deley = controller.currentIndex === 1 ? 1000 : 800;
    controller.timeout = setTimeout(sendNextCard, deley);
  };

  controller.timeout = setTimeout(sendNextCard, initialDelay);
};
