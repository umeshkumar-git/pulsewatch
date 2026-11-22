import nodemailer from "nodemailer";
import { env } from "../config/env";

function getTransporter() {
	if (
		!env.SMTP_HOST ||
		!env.SMTP_USER ||
		!env.SMTP_PASS ||
		!env.NOTIFICATION_FROM
	) {
		throw new Error("SMTP_CONFIGURATION_MISSING");
	}

	return nodemailer.createTransport({
		host: env.SMTP_HOST,
		port: env.SMTP_PORT,
		secure: env.SMTP_SECURE,
		auth: {
			user: env.SMTP_USER,
			pass: env.SMTP_PASS,
		},
		connectionTimeout: 10000,
		greetingTimeout: 10000,
		socketTimeout: 20000,
	});
}

export async function sendEmail(input: {
	to: string;
	subject: string;
	text: string;
	html: string;
}) {
	const transporter = getTransporter();

	const result = await transporter.sendMail({
		from: env.NOTIFICATION_FROM,
		to: input.to,
		subject: input.subject,
		text: input.text,
		html: input.html,
	});

	return {
		messageId: result.messageId,
		accepted: result.accepted,
		rejected: result.rejected,
	};
}

export async function verifyEmailConnection() {
	const transporter = getTransporter();
	await transporter.verify();
}
