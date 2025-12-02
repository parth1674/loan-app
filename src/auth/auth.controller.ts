import {
  Body,
  Controller,
  Post,
  Patch,
  Get,
  Param,
  UseGuards,
  Req,
  Query,
  ForbiddenException,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { diskStorage } from 'multer';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  // -----------------------------------------
  // Public: User Registration
  // -----------------------------------------
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // -----------------------------------------
  // Public: Login
  // -----------------------------------------
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // -----------------------------------------
  // ADMIN: Approve User
  // status = ACTIVE
  // -----------------------------------------
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('approve/:id')
  approveUser(@Param('id') id: string) {
    return this.authService.approveUser(id);
  }

  // -----------------------------------------
  // ADMIN: Change User Status
  // status = PENDING | ACTIVE | INACTIVE
  // -----------------------------------------
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('status/:id')
  changeStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.authService.changeStatus(id, status);
  }

  // -----------------------------------------
  // ADMIN: Get All Users List
  // -----------------------------------------
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('users')
  getUsers(
    @Query('status') status?: string,
    @Query('role') role?: string,
  ) {
    return this.authService.getUsers(status, role);
  }

  // -----------------------------------------
  // ADMIN OR CLIENT: Get single user info
  // CLIENT can only see himself
  // -----------------------------------------
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'CLIENT')
  @Get('user/:id')
  async getUser(@Param('id') id: string, @Req() req: any) {
    if (req.user.role === 'CLIENT' && req.user.id !== id) {
      throw new ForbiddenException('Not allowed');
    }
    return this.authService.getUserById(id);
  }

  @Post("register-complete")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "aadhaar", maxCount: 1 },
        { name: "pan", maxCount: 1 },
        { name: "photo", maxCount: 1 },
        { name: "cheque", maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: "./uploads",
          filename: (req, file, cb) => {
            const unique = Date.now() + "-" + file.originalname.replace(/\s+/g, "");
            cb(null, unique);
          }
        })
      }
    )
  )

  registerComplete(
    @Body() body: any,
    @UploadedFiles() files: any
  ) {
    return this.authService.registerComplete(body, files);
  }




}
