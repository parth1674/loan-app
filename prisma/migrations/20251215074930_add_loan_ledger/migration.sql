-- CreateTable
CREATE TABLE "LoanLedger" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "principalAmount" DOUBLE PRECISION NOT NULL,
    "interestAmount" DOUBLE PRECISION NOT NULL,
    "paymentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outstandingAfter" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanPayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoanLedger_loanId_idx" ON "LoanLedger"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanLedger_loanId_date_key" ON "LoanLedger"("loanId", "date");

-- CreateIndex
CREATE INDEX "LoanPayment_loanId_idx" ON "LoanPayment"("loanId");

-- AddForeignKey
ALTER TABLE "LoanLedger" ADD CONSTRAINT "LoanLedger_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
