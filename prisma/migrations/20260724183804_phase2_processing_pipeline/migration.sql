/*
  Warnings:

  - The `status` column on the `saved_items` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('PERSON', 'COMPANY', 'TECHNOLOGY', 'PROJECT', 'BOOK', 'URL', 'CONCEPT');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('OPEN', 'ANSWERED', 'DISMISSED');

-- AlterTable
ALTER TABLE "saved_items" ADD COLUMN     "keyPoints" TEXT[],
DROP COLUMN "status",
ADD COLUMN     "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING';

-- DropEnum
DROP TYPE "SavedItemStatus";

-- CreateTable
CREATE TABLE "processing_jobs" (
    "id" TEXT NOT NULL,
    "savedItemId" TEXT NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_tasks" (
    "id" TEXT NOT NULL,
    "savedItemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extracted_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_entities" (
    "id" TEXT NOT NULL,
    "savedItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extracted_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decisions" (
    "id" TEXT NOT NULL,
    "savedItemId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "reasoning" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "savedItemId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" "QuestionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processing_jobs_savedItemId_createdAt_idx" ON "processing_jobs"("savedItemId", "createdAt");

-- CreateIndex
CREATE INDEX "processing_jobs_status_idx" ON "processing_jobs"("status");

-- CreateIndex
CREATE INDEX "extracted_tasks_savedItemId_idx" ON "extracted_tasks"("savedItemId");

-- CreateIndex
CREATE INDEX "extracted_entities_savedItemId_idx" ON "extracted_entities"("savedItemId");

-- CreateIndex
CREATE INDEX "extracted_entities_name_type_idx" ON "extracted_entities"("name", "type");

-- CreateIndex
CREATE INDEX "decisions_savedItemId_idx" ON "decisions"("savedItemId");

-- CreateIndex
CREATE INDEX "questions_savedItemId_idx" ON "questions"("savedItemId");

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_savedItemId_fkey" FOREIGN KEY ("savedItemId") REFERENCES "saved_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_tasks" ADD CONSTRAINT "extracted_tasks_savedItemId_fkey" FOREIGN KEY ("savedItemId") REFERENCES "saved_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_entities" ADD CONSTRAINT "extracted_entities_savedItemId_fkey" FOREIGN KEY ("savedItemId") REFERENCES "saved_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_savedItemId_fkey" FOREIGN KEY ("savedItemId") REFERENCES "saved_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_savedItemId_fkey" FOREIGN KEY ("savedItemId") REFERENCES "saved_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
