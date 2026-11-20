import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal"];

function isPublicIp(address: string): boolean {
	if (!ipaddr.isValid(address)) {
		return false;
	}

	const parsed = ipaddr.process(address);

	// Only globally routable unicast addresses are accepted.
	return parsed.range() === "unicast";
}

export async function validateMonitorUrl(input: string): Promise<string> {
	let parsedUrl: URL;

	try {
		parsedUrl = new URL(input);
	} catch {
		throw new Error("INVALID_MONITOR_URL");
	}

	if (!["http:", "https:"].includes(parsedUrl.protocol)) {
		throw new Error("UNSUPPORTED_URL_PROTOCOL");
	}

	if (parsedUrl.username || parsedUrl.password) {
		throw new Error("URL_CREDENTIALS_NOT_ALLOWED");
	}

	const hostname = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");

	if (
		hostname === "localhost" ||
		BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
	) {
		throw new Error("PRIVATE_HOST_NOT_ALLOWED");
	}

	// If the hostname is already an IP address, validate it directly.
	if (ipaddr.isValid(hostname)) {
		if (!isPublicIp(hostname)) {
			throw new Error("PRIVATE_IP_NOT_ALLOWED");
		}

		return parsedUrl.toString();
	}

	// Resolve every address. Reject the hostname if even one
	// returned address is private, reserved or otherwise non-public.
	let addresses: LookupAddress[];

	try {
		addresses = await lookup(hostname, {
			all: true,
			verbatim: true,
		});
	} catch {
		throw new Error("DNS_RESOLUTION_FAILED");
	}

	if (addresses.length === 0) {
		throw new Error("DNS_RESOLUTION_FAILED");
	}

	const hasUnsafeAddress = addresses.some(
		(entry) => !isPublicIp(entry.address),
	);

	if (hasUnsafeAddress) {
		throw new Error("PRIVATE_IP_NOT_ALLOWED");
	}

	return parsedUrl.toString();
}
