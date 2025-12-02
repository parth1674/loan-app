/*
 Warnings:
 
 - Made the column `fullname` on table `User` required. This step will fail if there are existing NULL values in that column.
 - Changed the type of `status` on the `User` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
 */
-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'CLOSED', 'OVERDUE', 'DEFAULTED');
-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('EMI', 'PREPAYMENT', 'PENALTY');
-- 1) Make fullname NOT NULL
ALTER TABLE "User"
ALTER COLUMN "fullname"
SET NOT NULL;
-- 2) Remove default on status (required for enum removal)
ALTER TABLE "User"
ALTER COLUMN "status" DROP DEFAULT;
-- 3) Convert ENUM -> TEXT safely
ALTER TABLE "User"
ALTER COLUMN "status" TYPE TEXT USING status::text;
-- 4) Drop old unused enum
DROP TYPE "UserStatus";
-- Create Loan table
CREATE TABLE "Loan" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "principal" DECIMAL(14, 2) NOT NULL,
  "annualRatePct" DECIMAL(5, 2) NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "termDays" INTEGER NOT NULL,
  "interestAccrued" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  "outstanding" DECIMAL(14, 2) NOT NULL,
  "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);
-- Create Payment table
CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "amount" DECIMAL(14, 2) NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "type" "PaymentType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
-- Add FKs
ALTER TABLE "Loan"
ADD CONSTRAINT "Loan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;