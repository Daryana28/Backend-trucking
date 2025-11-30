import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Hapus admin lama (aman untuk development)
  await prisma.admin.deleteMany({});

  await prisma.admin.create({
    data: {
      username: "logistic",
      password: "123456", // kalau mau hash nanti saya buatkan
    },
  });

  console.log("Seed admin berhasil!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });