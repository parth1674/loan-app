import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hashed = await bcrypt.hash("admin123", 10);

  await prisma.user.create({
    data: {
      fullname: "Admin",
      email: "admin@gmail.com",
      passwordHash: hashed,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  console.log("Admin created");
}

main();
