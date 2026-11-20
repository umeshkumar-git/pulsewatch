import type { Request, Response } from "express";

import {
	createMonitor,
	getMonitors,
	getMonitor,
	updateMonitor,
	deleteMonitor,
	pauseMonitor,
	resumeMonitor,
	getMonitorUptime,
	MonitorError,
} from "./monitor.service";

import {
	createMonitorSchema,
	updateMonitorSchema,
	monitorIdSchema,
} from "./monitor.schemas";

function getUserId(req: Request): string {
	if (!req.user?.id) {
		throw new MonitorError("UNAUTHORIZED", 401);
	}

	return req.user.id;
}

function handleError(error: unknown, res: Response) {
	if (error instanceof MonitorError) {
		return res.status(error.statusCode).json({
			success: false,
			message: error.message,
		});
	}

	console.error("Monitor controller error:", error);

	return res.status(500).json({
		success: false,
		message: "Internal server error",
	});
}

// CREATE
export async function create(req: Request, res: Response) {
	try {
		const parsed = createMonitorSchema.safeParse(req.body);

		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: "Invalid monitor data",
				errors: parsed.error.flatten(),
			});
		}

		const monitor = await createMonitor(getUserId(req), parsed.data);

		return res.status(201).json({
			success: true,
			data: { monitor },
		});
	} catch (error) {
		return handleError(error, res);
	}
}

// GET ALL
export async function getAll(req: Request, res: Response) {
	try {
		const page = Number(req.query.page ?? 1);
		const limit = Number(req.query.limit ?? 10);

		if (
			!Number.isInteger(page) ||
			!Number.isInteger(limit) ||
			page < 1 ||
			limit < 1 ||
			limit > 100
		) {
			return res.status(400).json({
				success: false,
				message: "Invalid pagination parameters",
			});
		}

		const result = await getMonitors(getUserId(req), page, limit);

		return res.status(200).json({
			success: true,
			data: result,
		});
	} catch (error) {
		return handleError(error, res);
	}
}

// GET ONE
export async function getOne(req: Request, res: Response) {
	try {
		const parsedId = monitorIdSchema.safeParse(req.params.id);

		if (!parsedId.success) {
			return res.status(400).json({
				success: false,
				message: "Invalid monitor ID",
			});
		}

		const monitor = await getMonitor(getUserId(req), parsedId.data);

		return res.status(200).json({
			success: true,
			data: { monitor },
		});
	} catch (error) {
		return handleError(error, res);
	}
}

// UPDATE
export async function update(req: Request, res: Response) {
	try {
		const parsedId = monitorIdSchema.safeParse(req.params.id);
		const parsedBody = updateMonitorSchema.safeParse(req.body);

		if (!parsedId.success || !parsedBody.success) {
			return res.status(400).json({
				success: false,
				message: "Invalid monitor ID or update data",
				errors: parsedBody.success
					? undefined
					: parsedBody.error.flatten(),
			});
		}

		const monitor = await updateMonitor(
			getUserId(req),
			parsedId.data,
			parsedBody.data,
		);

		return res.status(200).json({
			success: true,
			data: { monitor },
		});
	} catch (error) {
		return handleError(error, res);
	}
}

// DELETE
export async function remove(req: Request, res: Response) {
	try {
		const parsedId = monitorIdSchema.safeParse(req.params.id);

		if (!parsedId.success) {
			return res.status(400).json({
				success: false,
				message: "Invalid monitor ID",
			});
		}

		await deleteMonitor(getUserId(req), parsedId.data);

		return res.status(200).json({
			success: true,
			message: "Monitor deleted successfully",
		});
	} catch (error) {
		return handleError(error, res);
	}
}

// PAUSE
export async function pause(req: Request, res: Response) {
	try {
		const parsedId = monitorIdSchema.safeParse(req.params.id);

		if (!parsedId.success) {
			return res.status(400).json({
				success: false,
				message: "Invalid monitor ID",
			});
		}

		const monitor = await pauseMonitor(getUserId(req), parsedId.data);

		return res.status(200).json({
			success: true,
			data: { monitor },
		});
	} catch (error) {
		return handleError(error, res);
	}
}

// RESUME
export async function resume(req: Request, res: Response) {
	try {
		const parsedId = monitorIdSchema.safeParse(req.params.id);

		if (!parsedId.success) {
			return res.status(400).json({
				success: false,
				message: "Invalid monitor ID",
			});
		}

		const monitor = await resumeMonitor(getUserId(req), parsedId.data);

		return res.status(200).json({
			success: true,
			data: { monitor },
		});
	} catch (error) {
		return handleError(error, res);
	}
}

// GET MONITOR UPTIME
export async function getUptime(req: Request, res: Response) {
	try {
		const parsedId = monitorIdSchema.safeParse(req.params.id);

		if (!parsedId.success) {
			return res.status(400).json({
				success: false,
				message: "Invalid monitor ID",
			});
		}

		const hours =
			req.query.hours === undefined ? 24 : Number(req.query.hours);

		if (![24, 168, 720].includes(hours)) {
			return res.status(400).json({
				success: false,
				message: "Invalid hours. Allowed values: 24, 168, 720",
			});
		}

		const result = await getMonitorUptime(
			getUserId(req),
			parsedId.data,
			hours,
		);

		return res.status(200).json({
			success: true,
			data: result,
		});
	} catch (error) {
		return handleError(error, res);
	}
}
