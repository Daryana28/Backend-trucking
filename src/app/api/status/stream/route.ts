// src/app/api/status/stream/route.ts
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
          // Kelompokkan berdasarkan tripGroup + driver
          const groups = await prisma.driverStatus.groupBy({
            by: ["tripGroup", "driverId"],
            _max: { updatedAt: true },
          });

          const active: any[] = [];
          const history: any[] = [];

          for (const g of groups) {
            const statuses = await prisma.driverStatus.findMany({
              where: { tripGroup: g.tripGroup },
              include: { driver: true },
              orderBy: { updatedAt: "asc" },
            });

            if (!statuses.length) continue;

            const forward =
              [...statuses]
                .filter((s) => s.direction === "forward")
                .slice(-1)[0] || null;
            const reverse =
              [...statuses]
                .filter((s) => s.direction === "reverse")
                .slice(-1)[0] || null;

            const anyStatus = statuses[statuses.length - 1];

            const plate = forward?.plate ?? reverse?.plate ?? null;
            const origin = forward?.origin ?? reverse?.origin ?? null;
            const destinationForward = forward?.destination ?? null;
            const destinationReverse = reverse?.destination ?? null;

            const isComplete = Boolean(forward?.etaTime && reverse?.etaTime);

            const tripItem = {
              tripGroup: g.tripGroup,
              driverId: g.driverId,
              driver: {
                name: anyStatus.driver?.name ?? null,
                phone: anyStatus.driver?.phone ?? null,
              },
              plate,
              origin,
              destinationForward,
              destinationReverse,
              forward: forward
                ? {
                    etdTime: forward.etdTime,
                    etaTime: forward.etaTime,
                    direction: forward.direction,
                  }
                : null,
              reverse: reverse
                ? {
                    etdTime: reverse.etdTime,
                    etaTime: reverse.etaTime,
                    direction: reverse.direction,
                  }
                : null,
              isComplete,
              lastUpdated: anyStatus.updatedAt.toISOString(),
            };

            if (isComplete) history.push(tripItem);
            else active.push(tripItem);
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
