// prisma/seed.js
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const plainPassword = "123456";

  // =========================
  // ADMIN (WEB)
  // =========================
  // Route admin cek: admin.password === password
  // Jadi di DB harus disimpan PLAIN
  await prisma.admin.upsert({
    where: { username: "logistic" }, // username unik
    update: {
      password: plainPassword,
    },
    create: {
      username: "logistic",
      password: plainPassword,
    },
  });

  // =========================
  // DRIVER (MOBILE)
  // =========================
  // Route driver pakai bcrypt.compare(password, driver.password)
  // Jadi di DB harus HASH
  const driverHash = await bcrypt.hash(plainPassword, 10);

  await prisma.driver.upsert({
    where: { phone: "08123456789" }, // phone itu @unique di schema
    update: {
      name: "Daryana",
      password: driverHash,
    },
    create: {
      name: "Daryana",
      phone: "08123456789",
      password: driverHash,
    },
  });

  console.log("✅ Seed admin & driver berhasil!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });