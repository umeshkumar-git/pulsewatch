import { prisma } from "../../config/database";

import type {
  CreateMonitorInput,
  UpdateMonitorInput,
} from "./monitor.schemas";

import { validateMonitorUrl } from "./monitor-url";

export class MonitorError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "MonitorError";
  }
}

// CREATE MONITOR
export async function createMonitor(
  userId: string,
  input: CreateMonitorInput
) {
  let url: string;

  try {
    url = await validateMonitorUrl(input.url);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "";

    throw new MonitorError(message, 400);
  }

  return prisma.monitor.create({
    data: {
      userId,
      name: input.name,
      url,
      method: input.method,
      intervalSeconds: input.intervalSeconds,
      timeoutMs: input.timeoutMs,
      failureThreshold: input.failureThreshold,
      recoveryThreshold: input.recoveryThreshold,
      enabled: true,
      nextCheckAt: new Date(),
    },
  });
}

// GET ALL MONITORS
export async function getMonitors(
  userId: string,
  page: number,
  limit: number
) {
  const skip = (page - 1) * limit;

  const [monitors, total] = await Promise.all([
    prisma.monitor.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        _count: {
          select: {
            checkResults: true,
            incidents: true,
          },
        },
      },
    }),

    prisma.monitor.count({
      where: { userId },
    }),
  ]);

  return {
    monitors,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// GET ONE MONITOR
export async function getMonitor(
  userId: string,
  monitorId: string
) {
  const monitor = await prisma.monitor.findFirst({
    where: {
      id: monitorId,
      userId,
    },
    include: {
      checkResults: {
        orderBy: { checkedAt: "desc" },
        take: 20,
      },
      incidents: {
        orderBy: { startedAt: "desc" },
        take: 10,
      },
    },
  });

  if (!monitor) {
    throw new MonitorError("MONITOR_NOT_FOUND", 404);
  }

  return monitor;
}

// UPDATE MONITOR
export async function updateMonitor(
  userId: string,
  monitorId: string,
  input: UpdateMonitorInput
) {
  const data: UpdateMonitorInput = { ...input };

  if (data.url) {
    try {
      data.url = await validateMonitorUrl(data.url);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "";

      throw new MonitorError(message, 400);
    }
  }

  const result = await prisma.monitor.updateMany({
    where: {
      id: monitorId,
      userId,
    },
    data,
  });

  if (result.count === 0) {
    throw new MonitorError("MONITOR_NOT_FOUND", 404);
  }

  return prisma.monitor.findFirst({
    where: {
      id: monitorId,
      userId,
    },
  });
}

// DELETE MONITOR
export async function deleteMonitor(
  userId: string,
  monitorId: string
) {
  const result = await prisma.monitor.deleteMany({
    where: {
      id: monitorId,
      userId,
    },
  });

  if (result.count === 0) {
    throw new MonitorError("MONITOR_NOT_FOUND", 404);
  }

  return { deleted: true };
}

// PAUSE MONITOR
export async function pauseMonitor(
  userId: string,
  monitorId: string
) {
  const result = await prisma.monitor.updateMany({
    where: {
      id: monitorId,
      userId,
    },
    data: {
      enabled: false,
      status: "PAUSED",
    },
  });

  if (result.count === 0) {
    throw new MonitorError("MONITOR_NOT_FOUND", 404);
  }

  return prisma.monitor.findFirst({
    where: {
      id: monitorId,
      userId,
    },
  });
}

// RESUME MONITOR
export async function resumeMonitor(
  userId: string,
  monitorId: string
) {
  const result = await prisma.monitor.updateMany({
    where: {
      id: monitorId,
      userId,
    },
    data: {
      enabled: true,
      status: "UNKNOWN",
      nextCheckAt: new Date(),
    },
  });

  if (result.count === 0) {
    throw new MonitorError("MONITOR_NOT_FOUND", 404);
  }

  return prisma.monitor.findFirst({
    where: {
      id: monitorId,
      userId,
    },
  });
}