// src/loan/loan.module.ts
import { Module } from '@nestjs/common';
import { LoanService } from './loan.service';
import { LoanController } from './loan.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [LoanController],
  providers: [LoanService, PrismaService],
  exports: [LoanService],
})
export class LoanModule {}
