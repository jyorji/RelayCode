-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "allowAutocomplete" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allowLanguageChange" BOOLEAN NOT NULL DEFAULT true;
