import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLoanRequestDto } from "../loan/dto/create-loan-request.dto";
import { getNextPaymentDate } from "../loan/loan.helpers";
import { PaymentFrequency } from "@prisma/client";

@Injectable()
export class LoanRequestService {
  constructor(private prisma: PrismaService) { }

  // ==================================
  // CREATE LOAN REQUEST (CLIENT)
  // ==================================
  async createLoanRequest(
    userId: string,
    data: CreateLoanRequestDto,
  ) {
    // 🛑 Basic safety checks (optional but recommended)
    if (data.requestedAmount <= 0) {
      throw new BadRequestException("Requested amount must be greater than 0");
    }

    if (data.requestedRate <= 0) {
      throw new BadRequestException("Interest rate must be greater than 0");
    }

    if (data.termDays <= 0) {
      throw new BadRequestException("Term days must be greater than 0");
    }

    return this.prisma.loanRequest.create({
      data: {
        userId,
        requestedAmount: data.requestedAmount,
        requestedRate: data.requestedRate,
        termDays: data.termDays,
        purpose: data.purpose || null,
      },
    });
  }

  // ==================================
  // GET MY LOAN REQUESTS (CLIENT)
  // ==================================
  async getMyRequests(userId: string) {
    return this.prisma.loanRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  // ==================================
  // GET ALL LOAN REQUESTS (ADMIN)
  // ==================================
  async getAllRequests() {
    return this.prisma.loanRequest.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullname: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ==================================
  // APPROVE LOAN REQUEST (ADMIN)
  // ==================================
 
async approveRequest(requestId: string, adminNote?: string) {
  return this.prisma.$transaction(async (tx) => {
    const req = await tx.loanRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!req) throw new BadRequestException("Request not found");
    if (req.status !== "PENDING")
      throw new BadRequestException("Request already processed");

    // ===============================
    // 🔑 SYSTEM-CONTROLLED VALUES
    // ===============================
    const startDate = new Date();
    const paymentFrequency = PaymentFrequency.MONTHLY; // default for client requests

    // 🔥 IMPORTANT: next payment date calculation
    const nextPaymentDate = getNextPaymentDate(
      startDate,
      paymentFrequency
    );

    // ===============================
    // 1️⃣ CREATE ACTUAL LOAN
    // ===============================
    const loan = await tx.loan.create({
      data: {
        userId: req.userId,
        principal: req.requestedAmount,
        annualRatePct: req.requestedRate,
        termDays: req.termDays,
        startDate,
        dueDate: new Date(
          startDate.getTime() + req.termDays * 24 * 60 * 60 * 1000
        ),
        outstanding: req.requestedAmount,
        interestAccrued: 0,
        status: "ACTIVE",
        paymentFrequency,        // ✅ ADDED
        nextPaymentDate,         // ✅ ADDED
      },
    });

    // ===============================
    // 2️⃣ UPDATE REQUEST STATUS
    // ===============================
    await tx.loanRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        adminNote,
        reviewedAt: new Date(),
      },
    });

    return {
      message: "Loan approved successfully",
      loan,
    };
  });
}


  async rejectRequest(requestId: string, adminNote?: string) {
    return this.prisma.loanRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        adminNote,
        reviewedAt: new Date(),
      },
    });
  }
}