import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: Request) {
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const interval = setInterval(async () => {
        if (closed) return;

        try {
          // ============================
          // ACTIVE = trip belum complete
          // ETD null ATAU ETA null
          // ============================
          const activeGroups = await prisma.driverStatus.groupBy({
            by: ["tripGroup"],
            _max: { updatedAt: true },
            where: {
              OR: [{ etdTime: null }, { etaTime: null }],
            },
          });

          const active = await Promise.all(
            activeGroups.map(async (g) =>
              prisma.driverStatus.findFirst({
                where: {
                  tripGroup: g.tripGroup,
                  OR: [{ etdTime: null }, { etaTime: null }],
                },
                include: { driver: true },
                orderBy: { updatedAt: "desc" },
              })
            )
          );

          // ============================
          // HISTORY = trip sudah selesai
          // ETD dan ETA TIDAK null
          // ============================
          const historyGroups = await prisma.driverStatus.groupBy({
            by: ["tripGroup"],
            _max: { updatedAt: true },
            where: {
              AND: [{ etdTime: { not: null } }, { etaTime: { not: null } }],
            },
          });

          const history = await Promise.all(
            historyGroups.map(async (g) =>
              prisma.driverStatus.findFirst({
                where: {
                  tripGroup: g.tripGroup,
                  updatedAt: g._max.updatedAt ?? undefined,
                },
                include: { driver: true },
              })
            )
          );

          // KIRIM DATA KE FRONTEND
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                active: active.filter(Boolean),
                history: history.filter(Boolean),
              })}\n\n`
            )
          );
        } catch (err) {
          console.error("STREAM ERROR:", err);
        }
      }, 1500);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
