-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "EmbeddingEntityType" AS ENUM ('SAVED_ITEM', 'EXTRACTED_TASK', 'DECISION', 'QUESTION', 'ENTITY');

-- CreateTable
CREATE TABLE "embeddings" (
    "id" TEXT NOT NULL,
    "entityType" "EmbeddingEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "vector" vector(1536) NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "embeddings_entityType_entityId_key" ON "embeddings"("entityType", "entityId");
