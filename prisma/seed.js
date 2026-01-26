// prisma/seed.js
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const plainPassword = "123456";
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  // =========================
  // ADMIN (WEB)
  // =========================
  // Route admin pakai bcrypt.compare(password, admin.password)
  // Jadi di DB harus disimpan HASH
  await prisma.admin.upsert({
    where: { username: "logistic" }, // username unik
    update: {
      password: hashedPassword,
    },
    create: {
      username: "logistic",
      password: hashedPassword,
    },
  });

  console.log("Seed admin berhasil!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
