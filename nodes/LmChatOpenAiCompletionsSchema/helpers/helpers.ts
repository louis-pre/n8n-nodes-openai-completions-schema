import type { ICredentialDataDecryptedObject } from 'n8n-workflow';

export function mergeCustomHeaders(
	credentials: ICredentialDataDecryptedObject,
	defaultHeaders: Record<string, string>,
): Record<string, string> {
	if (
		credentials.header &&
		typeof credentials.headerName === 'string' &&
		credentials.headerName &&
		typeof credentials.headerValue === 'string'
	) {
		return {
			...defaultHeaders,
			[credentials.headerName]: credentials.headerValue,
		};
	}
	return defaultHeaders;
}
