-- CreateTable
CREATE TABLE "SessionCode" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionCode_sessionId_language_key" ON "SessionCode"("sessionId", "language");

-- AddForeignKey
ALTER TABLE "SessionCode" ADD CONSTRAINT "SessionCode_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
