-- CreateTable
CREATE TABLE "GameBall" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "GameBall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameBall_gameId_key" ON "GameBall"("gameId");

-- AddForeignKey
ALTER TABLE "GameBall" ADD CONSTRAINT "GameBall_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameBall" ADD CONSTRAINT "GameBall_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
