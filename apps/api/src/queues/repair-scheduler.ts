import { prisma } from "../config/database";
import { scheduleMonitorCheck } from "./monitor.queue";

async function main() {
  const monitor = await prisma.monitor.findUnique({
    where: {
      id: "a08436d5-d329-47ca-a362-de6b1ccd6f81",
    },
  });

  if (!monitor) {
    throw new Error("Monitor not found");
  }

  if (!monitor.enabled) {
    throw new Error("Monitor is disabled. Scheduler not created.");
  }

  await scheduleMonitorCheck(
    monitor.id,
    monitor.intervalSeconds,
  );

  console.log(`Scheduler ensured for: ${monitor.name}`);
  console.log(`Interval: ${monitor.intervalSeconds} seconds`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
