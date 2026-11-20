import { monitorQueue } from "./monitor.queue";

async function main() {
	const schedulers = await monitorQueue.getJobSchedulers(0, 49, true);

	console.log(JSON.stringify(schedulers, null, 2));

	await monitorQueue.close();
}

main().catch(async (error) => {
	console.error(error);
	await monitorQueue.close();
	process.exitCode = 1;
});
