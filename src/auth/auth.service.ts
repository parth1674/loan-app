import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import Tesseract from "tesseract.js";
import * as path from "path";
import * as fs from "fs";
import { uploadFileToSupabase } from "../common/upload-to-supabase";

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

    if (user.status === "PENDING") {
      throw new BadRequestException("Account not approved by admin yet");
    }

    if (user.status === "INACTIVE") {
      throw new BadRequestException("Your account is inactive. Please contact admin.");
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
      include: {
        loans: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!user) throw new BadRequestException("User not found");

    const flags: string[] = [];

    const totalOutstanding = user.loans.reduce(
      (sum: number, loan: any) => sum + Number(loan.outstanding || 0),
      0
    );

    const overdueLoans = user.loans.filter(
      (loan: any) => loan.status === "OVERDUE" || loan.status === "DEFAULTED"
    );

    let riskScore = 100;

    if (user.status !== "ACTIVE") {
      riskScore -= 30;
      flags.push("User account is not active");
    }

    if (!user.panVerified) {
      riskScore -= 20;
      flags.push("PAN verification failed");
    }

    if (!user.aadhaarVerified) {
      riskScore -= 20;
      flags.push("Aadhaar verification failed");
    }

    if (!user.annualIncome || Number(user.annualIncome) <= 0) {
      riskScore -= 10;
      flags.push("Annual income missing");
    }

    if (!user.profession) {
      riskScore -= 5;
      flags.push("Profession details missing");
    }

    if (overdueLoans.length > 0) {
      riskScore -= 25;
      flags.push("User has overdue/defaulted loans");
    }

    if (
      Number(user.annualIncome) > 0 &&
      totalOutstanding > Number(user.annualIncome) * 2
    ) {
      riskScore -= 20;
      flags.push("Outstanding loans are very high compared to annual income");
    }

    riskScore = Math.max(0, riskScore);

    let riskLevel = "LOW";

    if (riskScore < 50) {
      riskLevel = "HIGH";
    } else if (riskScore < 75) {
      riskLevel = "MEDIUM";
    }

    const recommendation =
      riskLevel === "LOW"
        ? "Eligible for loan"
        : riskLevel === "MEDIUM"
          ? "Manual review recommended"
          : "Not recommended for loan";

    return {
      ...user,
      riskScore,
      riskLevel,
      riskFlags: flags,
      totalOutstanding,
      overdueLoansCount: overdueLoans.length,
      recommendation,
    };
  }

  async approveUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new BadRequestException("User not found");
    }

    // ✅ KYC failed user ko approve mat hone do
    if (!user.panVerified || !user.aadhaarVerified) {
      throw new BadRequestException(
        "Cannot approve user. PAN or Aadhaar verification failed."
      );
    }

    return this.prisma.user.update({
      where: { id },
      data: { status: "ACTIVE" },
    });
  }

  async rejectUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new BadRequestException("User not found");
    }

    let kycRemark = "Rejected by admin after manual review";

    if (!user.panVerified && !user.aadhaarVerified) {
      kycRemark =
        "PAN and Aadhaar verification failed. Please upload correct documents.";
    } else if (!user.panVerified) {
      kycRemark =
        "PAN verification failed. Please upload correct PAN card.";
    } else if (!user.aadhaarVerified) {
      kycRemark =
        "Aadhaar verification failed. Please upload correct Aadhaar card.";
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        status: "KYC_REJECTED",
        kycRemark,
      },
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

  private async extractPanFromImage(imagePath: string) {
    try {
      const result = await Tesseract.recognize(imagePath, "eng");

      const text = result.data.text.toUpperCase();

      const panRegex = /[A-Z]{5}[0-9]{4}[A-Z]{1}/;

      const match = text.match(panRegex);

      return match ? match[0] : null;
    } catch (error) {
      console.log("PAN OCR Error:", error);
      return null;
    }
  }

  private async extractAadhaarFromImage(imagePath: string) {
    try {
      const result = await Tesseract.recognize(imagePath, "eng");

      const text = result.data.text;

      const aadhaarRegex = /\d{4}\s\d{4}\s\d{4}/;

      const match = text.match(aadhaarRegex);

      if (!match) return null;

      return match[0].replace(/\s/g, "");
    } catch (error) {
      console.log("AADHAAR OCR Error:", error);
      return null;
    }
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
    let panVerified = false;

    if (files?.pan?.[0]) {
      const panPath = path.join(
        process.cwd(),
        "uploads",
        files.pan[0].filename
      );

      const extractedPan =
        await this.extractPanFromImage(panPath);

      console.log("Entered PAN:", body.panNumber);
      console.log("Extracted PAN:", extractedPan);

      if (
        extractedPan &&
        extractedPan === body.panNumber.toUpperCase()
      ) {
        panVerified = true;
      }
    }
    console.log("PAN VERIFIED VALUE:", panVerified);

    let aadhaarVerified = false;

    if (files?.aadhaar?.[0]) {
      const aadhaarPath = path.join(
        process.cwd(),
        "uploads",
        files.aadhaar[0].filename
      );

      const extractedAadhaar =
        await this.extractAadhaarFromImage(aadhaarPath);

      console.log(
        "Entered Aadhaar:",
        body.aadhaarNumber
      );

      console.log(
        "Extracted Aadhaar:",
        extractedAadhaar
      );

      const enteredAadhaar = String(
        body.aadhaarNumber
      ).replace(/\s/g, "");

      if (
        extractedAadhaar &&
        extractedAadhaar === enteredAadhaar
      ) {
        aadhaarVerified = true;
      }
    }

    let aadhaarUrl: string | null = null;
    let panUrl: string | null = null;
    let photoUrl: string | null = null;
    let chequeUrl: string | null = null;

    if (files?.pan?.[0]) {
      const panPath = path.join(
        process.cwd(),
        "uploads",
        files.pan[0].filename
      );

      panUrl = await uploadFileToSupabase(
        panPath,
        "pan"
      );
    }

    if (files?.aadhaar?.[0]) {
      const aadhaarPath = path.join(
        process.cwd(),
        "uploads",
        files.aadhaar[0].filename
      );

      aadhaarUrl = await uploadFileToSupabase(
        aadhaarPath,
        "aadhaar"
      );
    }

    if (files?.photo?.[0]) {
      const photoPath = path.join(
        process.cwd(),
        "uploads",
        files.photo[0].filename
      );

      photoUrl = await uploadFileToSupabase(
        photoPath,
        "photo"
      );
    }

    if (files?.cheque?.[0]) {
      const chequePath = path.join(
        process.cwd(),
        "uploads",
        files.cheque[0].filename
      );

      chequeUrl = await uploadFileToSupabase(
        chequePath,
        "cheque"
      );
    }

    let kycRemark = "KYC verified successfully";

    if (!panVerified && !aadhaarVerified) {
      kycRemark =
        "PAN and Aadhaar verification failed";
    } else if (!panVerified) {
      kycRemark =
        "PAN verification failed";
    } else if (!aadhaarVerified) {
      kycRemark =
        "Aadhaar verification failed";
    }

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
        panVerified,
        aadhaarVerified,
        kycRemark,

        // ⭐ FIXED — full file URLs and correct syntax
        aadhaarUrl,
        panUrl,
        photoUrl,
        chequeUrl,

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

  async resubmitKyc(id: string, body: any, files: any) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new BadRequestException("User not found");
    }

    const enteredPan = String(body.panNumber || "")
      .toUpperCase()
      .trim();

    const enteredAadhaar = String(body.aadhaarNumber || "")
      .replace(/\s/g, "");

    let panVerified = false;
    let aadhaarVerified = false;

    let panUrl = user.panUrl;
    let aadhaarUrl = user.aadhaarUrl;

    // ✅ PAN OCR verification
    if (files?.pan?.[0]) {
      const panPath = path.join(
        process.cwd(),
        "uploads",
        files.pan[0].filename
      );

      const extractedPan = await this.extractPanFromImage(panPath);

      console.log("Re-submit Entered PAN:", enteredPan);
      console.log("Re-submit Extracted PAN:", extractedPan);

      if (
        extractedPan &&
        extractedPan.toUpperCase().trim() === enteredPan
      ) {
        panVerified = true;
      }

      panUrl = await uploadFileToSupabase(
        panPath,
        "pan"
      );
    }

    // ✅ Aadhaar OCR verification
    if (files?.aadhaar?.[0]) {
      const aadhaarPath = path.join(
        process.cwd(),
        "uploads",
        files.aadhaar[0].filename
      );

      const extractedAadhaar =
        await this.extractAadhaarFromImage(aadhaarPath);

      console.log("Re-submit Entered Aadhaar:", enteredAadhaar);
      console.log("Re-submit Extracted Aadhaar:", extractedAadhaar);

      if (
        extractedAadhaar &&
        extractedAadhaar.replace(/\s/g, "") === enteredAadhaar
      ) {
        aadhaarVerified = true;
      }

      aadhaarUrl = await uploadFileToSupabase(
        aadhaarPath,
        "aadhaar"
      );
    }

    let kycRemark = "KYC verified successfully. Waiting for admin approval.";

    if (!panVerified && !aadhaarVerified) {
      kycRemark =
        "PAN and Aadhaar verification failed. Please upload correct documents.";
    } else if (!panVerified) {
      kycRemark =
        "PAN verification failed. Please upload correct PAN card.";
    } else if (!aadhaarVerified) {
      kycRemark =
        "Aadhaar verification failed. Please upload correct Aadhaar card.";
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        panNumber: enteredPan,
        aadhaarNumber: enteredAadhaar,

        panUrl,
        aadhaarUrl,

        panVerified,
        aadhaarVerified,
        kycRemark,

        status:
          panVerified && aadhaarVerified
            ? "PENDING"
            : "KYC_REJECTED",
      },
    });
  }

  // auth.service.ts ke andar (class AuthService { ... } ke andar hi)

  // ==========================
  // CLIENT / ADMIN — UPDATE PROFILE
  // ==========================
  async updateProfile(id: string, dto: Partial<RegisterDto>) {
    // Allowed fields ko hi update karenge
    const data: any = {};

    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;

    if (dto.firstName || dto.lastName) {
      data.fullname = `${dto.firstName || ''} ${dto.lastName || ''}`.trim();
    }

    if (dto.contact !== undefined) data.contact = dto.contact;
    if (dto.altContact !== undefined) data.altContact = dto.altContact;

    if (dto.profession !== undefined) data.profession = dto.profession;

    if (dto.communicationAddress !== undefined) {
      data.communicationAddress = dto.communicationAddress;
    }
    if (dto.permanentAddress !== undefined) {
      data.permanentAddress = dto.permanentAddress;
    }

    if (dto.accountHolderName !== undefined) {
      data.accountHolderName = dto.accountHolderName;
    }
    if (dto.accountNumber !== undefined) {
      data.accountNumber = dto.accountNumber;
    }
    if (dto.ifsc !== undefined) data.ifsc = dto.ifsc;
    if (dto.bankName !== undefined) data.bankName = dto.bankName;
    if (dto.branch !== undefined) data.branch = dto.branch;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.state !== undefined) data.state = dto.state;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
    });

    return {
      message: 'Profile updated successfully',
      user: updated,
    };
  }

  async updateUser(id: string, data: any) {
    return await this.prisma.user.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        fullname: `${data.firstName} ${data.lastName}`.trim(),
        contact: data.contact,
        altContact: data.altContact,
        fatherName: data.fatherName,
        profession: data.profession,
        communicationAddress: data.communicationAddress,
        permanentAddress: data.permanentAddress,
        accountHolderName: data.accountHolderName,
        accountNumber: data.accountNumber,
        ifsc: data.ifsc,
        bankName: data.bankName,
        branch: data.branch,
        city: data.city,
        state: data.state,
      },
    });
  }

}