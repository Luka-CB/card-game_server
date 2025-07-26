import { getRooms, destroyRoom } from "./roomFuncs";
import { removeRoundCount } from "./gameFuncs";
import { Room } from "../utils/interfaces.util";

class RoomCleanupService {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly checkIntervalMs: number;
  private readonly inactivitythresholdMs: number;

  constructor(
    checkIntervalMinutes: number = 5,
    inactivitythresholdMinutes: number = 30
  ) {
    this.checkIntervalMs = checkIntervalMinutes * 60 * 1000;
    this.inactivitythresholdMs = inactivitythresholdMinutes * 60 * 1000;
  }

  start(): void {
    if (this.intervalId) {
      console.log("Room cleanup service is already running.");
      return;
    }

    console.log(
      `Starting room cleanup service - checking every ${
        this.checkIntervalMs / 60000
      } minutes for rooms inactive for more than ${
        this.inactivitythresholdMs / 60000
      } minutes.`
    );

    this.cleanup();

    this.intervalId = setInterval(() => {
      this.cleanup();
    }, this.checkIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Room cleanup service stopped.");
    }
  }

  private async cleanup(): Promise<void> {
    try {
      const rooms = await getRooms();
      if (!rooms || rooms.length === 0) {
        console.log("No rooms to cleanup.");
        return;
      }

      const now = new Date();
      const roomsToDelete: string[] = [];

      for (const room of rooms) {
        const roomWithActivity = room as Room;

        if (!roomWithActivity.lastActivityAt) {
          console.log(
            `Room ${room.id} has no lastActivityAt timestamp. Skipping cleanup.`
          );
          continue;
        }

        const lastActivityAt = new Date(roomWithActivity.lastActivityAt);
        const timeSinceActivity = now.getTime() - lastActivityAt.getTime();

        if (timeSinceActivity > this.inactivitythresholdMs) {
          console.log(
            `Room ${room.id} (${room.name}) is inactive for ${Math.round(
              timeSinceActivity / 60000
            )} minutes - marking for deletion`
          );
          roomsToDelete.push(room.id);
        }
      }

      for (const roomId of roomsToDelete) {
        await this.deleteInactiveRoom(roomId);
      }

      if (roomsToDelete.length > 0) {
        console.log(`Cleaned up ${roomsToDelete.length} inactive rooms.`);
      } else {
        console.log("No inactive rooms found during cleanup.");
      }
    } catch (error) {
      console.log("Error during room cleanup:", error);
    }
  }

  private async deleteInactiveRoom(roomId: string): Promise<void> {
    try {
      await destroyRoom(roomId);
      await removeRoundCount(roomId);
      console.log(`Successfully deleted inactive room: ${roomId}`);
    } catch (error) {
      console.log(`Error deleting inactive room ${roomId}:`, error);
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  getConfig(): {
    checkIntervalMinutes: number;
    inactivityThresholdMinutes: number;
  } {
    return {
      checkIntervalMinutes: this.checkIntervalMs / 60000,
      inactivityThresholdMinutes: this.inactivitythresholdMs / 60000,
    };
  }
}

export const roomCleanupService = new RoomCleanupService(5, 30);
export default RoomCleanupService;
