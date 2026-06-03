export type ModelOptions = {
	baseURL?: string;
	frequencyPenalty?: number;
	maxTokens?: number;
	responseFormat?: 'text' | 'json_object' | 'json_schema';
	jsonSchemaName?: string;
	jsonSchema?: string;
	jsonSchemaDescription?: string;
	jsonSchemaStrict?: boolean;
	presencePenalty?: number;
	temperature?: number;
	reasoningEffort?: 'low' | 'medium' | 'high';
	timeout?: number;
	maxRetries?: number;
	topP?: number;
};
