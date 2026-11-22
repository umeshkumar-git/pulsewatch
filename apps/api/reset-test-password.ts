import argon2 from "argon2";
import { prisma } from "./src/config/database";

async function main() {
	const email = "umeshkumarshah460@gmail.com";

	// Set a new password for your local test account.
	const newPassword = "PulseWatchTest@2026";

	const passwordHash = await argon2.hash(newPassword, {
		type: argon2.argon2id,
	});

	const user = await prisma.user.update({
		where: { email },
		data: { passwordHash },
		select: {
			id: true,
			email: true,
		},
	});

	console.log("Password reset successful:", user.email);
}

main()
	.catch(console.error)
	.finally(async () => {
		await prisma.$disconnect();
	});
