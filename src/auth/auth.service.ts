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
    // 1) Email already hai kya?
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    // 2) Password hash
    const hashed = await bcrypt.hash(dto.password, 10);

    // 3) DOB ko safe tarike se convert karo
    let dobValue: Date | null = null;
    if (dto.dob) {
      const parsed = new Date(dto.dob);
      if (isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid DOB format');
      }
      dobValue = parsed;
    }

    // 4) Annual income ko safe tarike se number me convert karo
    let annualIncomeNumber: number | null = null;
    if (dto.annualIncome && dto.annualIncome !== '') {
      const n = Number(dto.annualIncome);
      if (Number.isNaN(n)) {
        throw new BadRequestException('Annual income must be a number');
      }
      annualIncomeNumber = n;
    }

    // 5) Base data (yeh hamesha hona hi chahiye)
    const data: any = {
      email: dto.email,
      passwordHash: hashed,
      fullname: `${dto.firstName || ''} ${dto.lastName || ''}`.trim() || dto.email,
      role: 'CLIENT',
      status: 'PENDING',
    };

    // 6) Optional strings: agar aaye hain to hi set karo
    if (dto.firstName) data.firstName = dto.firstName;
    if (dto.lastName) data.lastName = dto.lastName;
    if (dto.fatherName) data.fatherName = dto.fatherName;
    if (dto.contact) data.contact = dto.contact;
    if (dto.altContact) data.altContact = dto.altContact;
    if (dto.profession) data.profession = dto.profession;
    if (dto.communicationAddress) data.communicationAddress = dto.communicationAddress;
    if (dto.permanentAddress) data.permanentAddress = dto.permanentAddress;
    if (dto.aadhaarNumber) data.aadhaarNumber = dto.aadhaarNumber;
    if (dto.panNumber) data.panNumber = dto.panNumber;
    if (dto.photoUrl) data.photoUrl = dto.photoUrl;
    if (dto.aadhaarUrl) data.aadhaarUrl = dto.aadhaarUrl;
    if (dto.panUrl) data.panUrl = dto.panUrl;
    if (dto.accountHolderName) data.accountHolderName = dto.accountHolderName;
    if (dto.accountNumber) data.accountNumber = dto.accountNumber;
    if (dto.ifsc) data.ifsc = dto.ifsc;
    if (dto.bankName) data.bankName = dto.bankName;
    if (dto.branch) data.branch = dto.branch;
    if (dto.city) data.city = dto.city;
    if (dto.state) data.state = dto.state;
    if (dto.chequeUrl) data.chequeUrl = dto.chequeUrl;

    // 7) Optional date/number fields
    if (dobValue) data.dob = dobValue;
    if (annualIncomeNumber !== null) data.annualIncome = annualIncomeNumber;

    // 8) User create
    const user = await this.prisma.user.create({ data });

    return {
      message: 'Registered successfully. Wait for admin approval.',
      user,
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

    const baseUrl = process.env.FILE_BASE_URL || "";

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