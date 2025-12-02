import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) { }

  // ==========================
  // REGISTER USER
  // ==========================
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: hashed,
        fullname: `${dto.firstName} ${dto.lastName || ""}`.trim(),
        firstName: dto.firstName,

        lastName: dto.lastName,
        fatherName: dto.fatherName,
        contact: dto.contact,
        altContact: dto.altContact,

        dob: new Date(dto.dob),
        profession: dto.profession,
        annualIncome: Number(dto.annualIncome),
        communicationAddress: dto.communicationAddress,
        permanentAddress: dto.permanentAddress,
        aadhaarNumber: dto.aadhaarNumber,
        panNumber: dto.panNumber,
        photoUrl: dto.photoUrl,
        aadhaarUrl: dto.aadhaarUrl,
        panUrl: dto.panUrl,
        accountHolderName: dto.accountHolderName,
        accountNumber: dto.accountNumber,
        ifsc: dto.ifsc,
        bankName: dto.bankName,
        branch: dto.branch,
        city: dto.city,
        state: dto.state,
        chequeUrl: dto.chequeUrl,

        role: "CLIENT",
        status: "PENDING",
      }

    });

    return {
      message: 'Registered successfully. Wait for admin approval.',
      user
    };
  }

  // ==========================
  // LOGIN USER
  // ==========================
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      console.log("Login DTO:", dto);
      console.log("User Found:", user);
      console.log("Hash in DB:", (user as any)?.passwordHash);

      throw new BadRequestException('Invalid email or password');
    }

    const match = await bcrypt.compare(dto.password, user.passwordHash);
    if (!match) {
      throw new BadRequestException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new BadRequestException('Account not approved by admin yet');
    }

    const token = await this.jwt.signAsync({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      message: 'Login successful',
      token,
      user,
    };
  }

  // ==========================
  // ADMIN — APPROVE USER
  // =========================

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) throw new BadRequestException('User not found');

    return user;
  }

  async approveUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new BadRequestException('User not found');

    return this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  // ===================================================
  // CHANGE STATUS
  // ===================================================
  async changeStatus(id: string, status: string) {
    return this.prisma.user.update({
      where: { id },
      data: { status },
    });
  }

  async getUsers(status?: string, role?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (role) where.role = role;

    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async registerComplete(body: any, files: any) {
    // Optional: debug ke liye ek baar body / files log kar sakte ho
    // console.log("REGISTER COMPLETE BODY:", body);
    // console.log("REGISTER COMPLETE FILES:", files);

    // ✅ 1) DOB ko Date banाओ
    let dobValue: Date | null = null;
    if (body.dob) {
      // frontend se "2002-06-12" aa raha hai → Date object me convert
      dobValue = new Date(body.dob);
      if (isNaN(dobValue.getTime())) {
        throw new BadRequestException("Invalid DOB format");
      }
    }

    // ✅ 2) Annual Income ko number me convert
    const annualIncomeNumber = body.annualIncome
      ? Number(body.annualIncome)
      : 0;

    const baseUrl = "http://localhost:3000/uploads/";

    return await this.prisma.user.create({
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        fullname: `${body.firstName} ${body.lastName || ""}`.trim(),
        email: body.email,
        passwordHash: await bcrypt.hash(body.password, 10),
        contact: body.contact,
        altContact: body.altContact || "",

        fatherName: body.fatherName,
        dob: dobValue,
        profession: body.profession,
        annualIncome: annualIncomeNumber,
        communicationAddress: body.communicationAddress,
        permanentAddress: body.permanentAddress,

        aadhaarNumber: body.aadhaarNumber,
        panNumber: body.panNumber,

        // ⭐ FIXED — full file URLs and correct syntax
        aadhaarUrl: files?.aadhaar?.[0]
          ? baseUrl + files.aadhaar[0].filename
          : null,

        panUrl: files?.pan?.[0]
          ? baseUrl + files.pan[0].filename
          : null,

        photoUrl: files?.photo?.[0]
          ? baseUrl + files.photo[0].filename
          : null,

        chequeUrl: files?.cheque?.[0]
          ? baseUrl + files.cheque[0].filename
          : null,

        accountHolderName: body.accountHolderName,
        accountNumber: body.accountNumber,
        ifsc: body.ifsc,
        bankName: body.bankName,
        branch: body.branch,
        city: body.city,
        state: body.state,

        role: "CLIENT",
        status: "PENDING",
      }
    });

  }




}