import prisma from "./prisma";
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "JWT_SECRET";

export function signToken(driverId: string) {
  return jwt.sign({ driverId }, SECRET, { expiresIn: "7d" });
}

export async function getDriverFromAuth(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return null;

    const decoded = jwt.verify(token, SECRET) as any;

    const driver = await prisma.driver.findUnique({
      where: { id: decoded.driverId },
    });

    return driver;
  } catch {
    return null;
  }
}