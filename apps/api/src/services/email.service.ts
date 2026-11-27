
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

import { env } from "../config/env";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
        if (
                !env.SMTP_HOST ||
                !env.SMTP_USER ||
                !env.SMTP_PASS ||
                !env.NOTIFICATION_FROM
        ) {
                throw new Error("SMTP_CONFIGURATION_MISSING");
        }

        if (!transporter) {
                transporter = nodemailer.createTransport({
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

        return transporter;
}

export async function sendEmail(input: {
        to: string;
        subject: string;
        text: string;
        html: string;
}) {
        const activeTransporter = getTransporter();

        const result = await activeTransporter.sendMail({
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
        const activeTransporter = getTransporter();
        await activeTransporter.verify();
}

export function closeEmailTransport(): void {
        if (transporter) {
                transporter.close();
                transporter = null;
        }
}
