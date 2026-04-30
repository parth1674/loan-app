import { Module } from "@nestjs/common";
import { LoanRequestService } from "./loan-request.service";
import { LoanRequestController } from "./loan-request.controller";
import { PrismaService } from "../prisma/prisma.service";

@Module({
  providers: [LoanRequestService, PrismaService],
  controllers: [LoanRequestController],
})
export class LoanRequestModule {}
