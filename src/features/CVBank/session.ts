import { jwtDecode } from "jwt-decode";

export type CVBankUser = {
	email: string;
	name?: string;
	picture?: string;
	givenName?: string;
	familyName?: string;
};

type GoogleJwtPayload = {
	email?: string;
	hd?: string;
	name?: string;
	picture?: string;
	given_name?: string;
	family_name?: string;
};

export const CVBANK_STORAGE_KEY = "cvbank:user";

export function readStoredCVBankUser(storage: Storage): CVBankUser | null {
	try {
		const stored = storage.getItem(CVBANK_STORAGE_KEY);
		return stored ? (JSON.parse(stored) as CVBankUser) : null;
	} catch (err) {
		console.warn("Failed to read stored CVBank user", err);
		return null;
	}
}

export function writeStoredCVBankUser(storage: Storage, user: CVBankUser | null) {
	if (user) {
		storage.setItem(CVBANK_STORAGE_KEY, JSON.stringify(user));
		return;
	}

	storage.removeItem(CVBANK_STORAGE_KEY);
}

export function parseGoogleCredential(credential: string, allowedDomain?: string): CVBankUser {
	const payload = jwtDecode<GoogleJwtPayload>(credential);
	const email = payload.email ?? "";

	if (!email) {
		throw new Error("Could not read email from Google response.");
	}

	if (allowedDomain) {
		const domain = email.split("@")[1]?.toLowerCase() ?? "";
		if (domain !== allowedDomain) {
			throw new Error(`Please sign in with your @${allowedDomain} email.`);
		}
	}

	return {
		email,
		name: payload.name ?? email,
		picture: payload.picture,
		givenName: payload.given_name,
		familyName: payload.family_name,
	};
}