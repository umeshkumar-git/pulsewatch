import { prisma } from "../config/database";
import { monitorQueue } from "./monitor.queue";

async function main() {
  const [monitors, schedulers] = await Promise.all([
    prisma.monitor.findMany({
      select: {
        id: true,
        name: true,
        enabled: true,
        status: true,
        intervalSeconds: true,
      },
    }),
    monitorQueue.getJobSchedulers(0, 49, true),
  ]);

  const schedulerIds = new Set(
    schedulers.map((scheduler) =>
      scheduler.key.replace("monitor-", ""),
    ),
  );

  console.table(
    monitors.map((monitor) => {
      const hasScheduler = schedulerIds.has(monitor.id);

      return {
        name: monitor.name,
        enabled: monitor.enabled,
        status: monitor.status,
        interval: monitor.intervalSeconds,
        schedulerCount: hasScheduler ? 1 : 0,
        result: monitor.enabled
          ? hasScheduler ? "OK" : "MISSING"
          : hasScheduler ? "UNEXPECTED" : "OK",
      };
    }),
  );
}

main()
  .catch(console.error)
  .finally(async () => {
    await monitorQueue.close();
    await prisma.$disconnect();
  });
