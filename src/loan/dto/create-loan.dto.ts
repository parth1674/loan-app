// src/loan/dto/create-loan.dto.ts
import { IsNumber, IsOptional, IsPositive, Min, IsEnum, IsString } from 'class-validator';
import { PaymentFrequency } from '@prisma/client';

export class CreateLoanDto {
  @IsNumber()
  @IsPositive()
  principal: number;

  @IsNumber()
  @Min(0.0)
  annualRate: number;

  @IsNumber()
  @IsPositive()
  termDays: number;

  @IsOptional()
  @IsString()
  startDate?: string; // ISO date

  @IsOptional()
  @IsEnum(PaymentFrequency)
  paymentFrequency?: PaymentFrequency;
}
