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
          // Ambil semua tripGroup + updatedAt terakhir
          const groups = await prisma.driverStatus.groupBy({
            by: ["tripGroup"],
            _max: { updatedAt: true },
          });

          // Ambil record terakhir untuk tiap tripGroup
          const lastRecords = await Promise.all(
            groups.map((g) =>
              prisma.driverStatus.findFirst({
                where: {
                  tripGroup: g.tripGroup,
                  updatedAt: g._max.updatedAt ?? undefined,
                },
                include: { driver: true },
              })
            )
          );

          const active: any[] = [];
          const history: any[] = [];

          // Bagi: yang belum lengkap (ETD / ETA null) → active
          //       yang sudah lengkap (ETD & ETA terisi) → history
          for (const rec of lastRecords) {
            if (!rec) continue;

            if (!rec.etdTime || !rec.etaTime) {
              active.push(rec);
            } else {
              history.push(rec);
            }
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                active,
                history,
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
