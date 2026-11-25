import type { Request, Response } from "express";

import {
	createStatusPage,
	getStatusPages,
	getManagedStatusPage,
	updateStatusPage,
	updateStatusPageMonitors,
	deleteStatusPage,
	getPublicStatusPage,
	StatusPageError,
} from "./status-page.service";

import {
	createStatusPageSchema,
	updateStatusPageSchema,
	updateStatusPageMonitorsSchema,
	statusPageIdSchema,
	statusPageSlugSchema,
} from "./status-page.schemas";

function userId(req: Request) {
	if (!req.user?.id) {
		throw new StatusPageError("UNAUTHORIZED", 401);
	}

	return req.user.id;
}

function handleError(error: unknown, res: Response) {
	if (error instanceof StatusPageError) {
		return res.status(error.statusCode).json({
			success: false,
			message: error.message,
		});
	}

	console.error("Status page controller error:", error);

	return res.status(500).json({
		success: false,
		message: "Internal server error",
	});
}

export async function create(req: Request, res: Response) {
	try {
		const parsed = createStatusPageSchema.safeParse(req.body);

		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: "Invalid status page data",
				errors: parsed.error.flatten(),
			});
		}

		const page = await createStatusPage(userId(req), parsed.data);

		return res.status(201).json({
			success: true,
			data: { page },
		});
	} catch (error) {
		return handleError(error, res);
	}
}

export async function list(req: Request, res: Response) {
	try {
		const pages = await getStatusPages(userId(req));

		return res.status(200).json({
			success: true,
			data: { pages },
		});
	} catch (error) {
		return handleError(error, res);
	}
}

export async function getOne(req: Request, res: Response) {
	try {
		const parsedId = statusPageIdSchema.safeParse(req.params.id);

		if (!parsedId.success) {
			return res.status(400).json({
				success: false,
				message: "Invalid status page ID",
			});
		}

		const page = await getManagedStatusPage(userId(req), parsedId.data);

		return res.status(200).json({
			success: true,
			data: { page },
		});
	} catch (error) {
		return handleError(error, res);
	}
}

export async function update(req: Request, res: Response) {
	try {
		const parsedId = statusPageIdSchema.safeParse(req.params.id);
		const parsedBody = updateStatusPageSchema.safeParse(req.body);

		if (!parsedId.success || !parsedBody.success) {
			return res.status(400).json({
				success: false,
				message: "Invalid status page ID or update data",
				errors: parsedBody.success
					? undefined
					: parsedBody.error.flatten(),
			});
		}

		const page = await updateStatusPage(
			userId(req),
			parsedId.data,
			parsedBody.data,
		);

		return res.status(200).json({
			success: true,
			data: { page },
		});
	} catch (error) {
		return handleError(error, res);
	}
}

export async function updateMonitors(req: Request, res: Response) {
	try {
		const parsedId = statusPageIdSchema.safeParse(req.params.id);
		const parsedBody = updateStatusPageMonitorsSchema.safeParse(req.body);

		if (!parsedId.success || !parsedBody.success) {
			return res.status(400).json({
				success: false,
				message: "Invalid status page ID or monitor list",
				errors: parsedBody.success
					? undefined
					: parsedBody.error.flatten(),
			});
		}

		const page = await updateStatusPageMonitors(
			userId(req),
			parsedId.data,
			parsedBody.data.monitorIds,
		);

		return res.status(200).json({
			success: true,
			data: { page },
		});
	} catch (error) {
		return handleError(error, res);
	}
}

export async function remove(req: Request, res: Response) {
	try {
		const parsedId = statusPageIdSchema.safeParse(req.params.id);

		if (!parsedId.success) {
			return res.status(400).json({
				success: false,
				message: "Invalid status page ID",
			});
		}

		await deleteStatusPage(userId(req), parsedId.data);

		return res.status(200).json({
			success: true,
			message: "Status page deleted",
		});
	} catch (error) {
		return handleError(error, res);
	}
}

export async function getPublic(req: Request, res: Response) {
	try {
		const parsedSlug = statusPageSlugSchema.safeParse(req.params.slug);

		if (!parsedSlug.success) {
			return res.status(404).json({
				success: false,
				message: "Status page not found",
			});
		}

		const page = await getPublicStatusPage(parsedSlug.data);

		return res.status(200).json({
			success: true,
			data: { page },
		});
	} catch (error) {
		return handleError(error, res);
	}
}
