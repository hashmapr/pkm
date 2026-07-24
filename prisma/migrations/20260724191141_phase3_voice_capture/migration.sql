-- CreateTable
CREATE TABLE "audio_attachments" (
    "id" TEXT NOT NULL,
    "savedItemId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "duration" INTEGER,
    "transcript" TEXT,
    "transcriptionStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audio_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audio_attachments_savedItemId_key" ON "audio_attachments"("savedItemId");

-- AddForeignKey
ALTER TABLE "audio_attachments" ADD CONSTRAINT "audio_attachments_savedItemId_fkey" FOREIGN KEY ("savedItemId") REFERENCES "saved_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
