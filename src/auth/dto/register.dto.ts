import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
  IsNumberString,
  MinLength
} from 'class-validator';

export class RegisterDto {
  // Basic account fields
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsNotEmpty()
  firstName: string;

  @IsOptional()
  lastName?: string;

  // Contact
  @IsNotEmpty()
  contact: string;

  @IsOptional()
  altContact?: string;

  // Family
  @IsNotEmpty()
  fatherName: string;

  // Personal Details
  @IsDateString()
  dob: string;

  @IsNotEmpty()
  profession: string;

  @IsNotEmpty()
  annualIncome: string;

  // Address
  @IsNotEmpty()
  communicationAddress: string;

  @IsNotEmpty()
  permanentAddress: string;

  // KYC
  @IsNumberString()
  aadhaarNumber: string;

  @IsNotEmpty()
  panNumber: string;

  @IsOptional()
  aadhaarUrl?: string; // file upload later

  @IsOptional()
  panUrl?: string;

  @IsOptional()
  photoUrl?: string;

  @IsOptional()
  chequeUrl?: string;

  // Bank details
  @IsNotEmpty()
  accountHolderName: string;

  @IsNotEmpty()
  accountNumber: string;

  @IsNotEmpty()
  ifsc: string;

  @IsOptional()
  bankName?: string;

  @IsOptional()
  branch?: string;

  @IsOptional()
  city?: string;

  @IsOptional()
  state?: string;
}
