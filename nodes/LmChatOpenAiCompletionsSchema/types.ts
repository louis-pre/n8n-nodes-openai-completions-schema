export type ModelOptions = {
	baseURL?: string;
	frequencyPenalty?: number;
	maxTokens?: number;
	responseFormat?: {
		responseOptions?: Array<{
			type?: 'text' | 'json_schema' | 'json_object';
			name?: string;
			schema?: string;
			description?: string;
			strict?: boolean;
		}>;
	};
	presencePenalty?: number;
	temperature?: number;
	reasoningEffort?: 'low' | 'medium' | 'high';
	timeout?: number;
	maxRetries?: number;
	topP?: number;
};
