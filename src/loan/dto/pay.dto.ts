// src/loan/dto/pay.dto.ts
import { IsNumber, IsOptional, IsEnum } from 'class-validator';
import { PaymentType } from '@prisma/client';

export class PayDto {
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsEnum(PaymentType)
  type?: PaymentType;
}