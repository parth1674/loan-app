import { IsNumber, IsOptional, IsString } from "class-validator";

export class CreateLoanRequestDto {
  @IsNumber()
  requestedAmount: number;

  @IsNumber()
  requestedRate: number;

  @IsNumber()
  termDays: number;

  @IsOptional()
  @IsString()
  purpose?: string;
}