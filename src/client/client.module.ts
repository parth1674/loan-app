import { Module } from "@nestjs/common";
import { ClientController } from "./client.controller";
import { LoanService } from "../loan/loan.service";
import { PrismaService } from "../prisma/prisma.service";

@Module({
  controllers: [ClientController],
  providers: [LoanService, PrismaService],
})
export class ClientModule {}
