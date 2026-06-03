import { ChatOpenAI, type ClientOptions } from '@langchain/openai';
import pick from 'lodash/pick';
import {
	NodeConnectionTypes,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
	jsonParse,
} from 'n8n-workflow';

import { mergeCustomHeaders } from './helpers/helpers';

import { openAiFailedAttemptHandler } from './helpers/error-handling';
import {
	makeN8nLlmFailedAttemptHandler,
	N8nLlmTracing,
	getConnectionHintNoticeField,
} from '@n8n/ai-utilities';
import { searchModels } from './methods/loadModels';
import type { ModelOptions } from './types';

const INCLUDE_JSON_WARNING: INodeProperties = {
	displayName:
		'If using JSON response format, you must include word "json" in the prompt in your chain or agent. Also, make sure to select latest models released post November 2023.',
	name: 'notice',
	type: 'notice',
	default: '',
};

const OPENAI_MODEL_BUILDER_HINT = {
	message:
		'Prefer the GPT-5.4 family: the flagship variant (e.g. `gpt-5.4`) for general use, a `-mini` / `-nano` variant when the task explicitly calls for cost-efficiency, or `-pro` only when the user asks for maximum capability. Never use gpt-4o, gpt-4-turbo, gpt-4, gpt-3.5, or earlier — those are superseded by the GPT-5 family and are not valid choices.',
};

const completionsResponseFormat: INodeProperties = {
	displayName: 'Response Format',
	name: 'responseFormat',
	default: 'text',
	type: 'options',
	options: [
		{
			name: 'Text',
			value: 'text',
			description: 'Regular text response',
		},
		{
			name: 'JSON',
			value: 'json_object',
			description:
				'Enables JSON mode, which should guarantee the message the model generates is valid JSON',
		},
		{
			name: 'JSON Schema',
			value: 'json_schema',
			description:
				'Enables JSON Schema mode, which guarantees the response matches the provided JSON Schema',
		},
	],
};

const jsonSchemaExample = `{
  "type": "object",
  "properties": {
    "message": {
      "type": "string"
    }
  },
  "additionalProperties": false,
  "required": ["message"]
}`;

export class LmChatOpenAiCompletionsSchema implements INodeType {
	methods = {
		listSearch: {
			searchModels,
		},
	};

	description: INodeTypeDescription = {
		displayName: 'OpenAI Chat Model (JSON Schema)',

		name: 'lmChatOpenAiCompletionsSchema',
		icon: { light: 'file:openAiLight.svg', dark: 'file:openAiLight.dark.svg' },
		group: ['transform'],
		version: [1, 1.1, 1.2],
		description: 'For advanced usage with an AI chain',
		defaults: {
			name: 'OpenAI Chat Model (JSON Schema)',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatopenai/',
					},
				],
			},
		},

		inputs: [],

		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [
			{
				name: 'openAiApi',
				required: true,
			},
		],
		requestDefaults: {
			ignoreHttpStatusErrors: true,
			baseURL:
				'={{ $parameter.options?.baseURL?.split("/").slice(0,-1).join("/") || $credentials?.url?.split("/").slice(0,-1).join("/") || "https://api.openai.com" }}',
		},
		properties: [
			getConnectionHintNoticeField([NodeConnectionTypes.AiChain, NodeConnectionTypes.AiAgent]),
			{
				...INCLUDE_JSON_WARNING,
				displayOptions: {
					show: {
						'/options.responseFormat': ['json_object'],
					},
				},
			},
			{
				...INCLUDE_JSON_WARNING,
				displayOptions: {
					show: {
						'/options.responseFormat': ['json_schema'],
					},
				},
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				description:
					'The model which will generate the completion. <a href="https://beta.openai.com/docs/models/overview">Learn more</a>.',
				typeOptions: {
					loadOptions: {
						routing: {
							request: {
								method: 'GET',
								url: '={{ $parameter.options?.baseURL?.split("/").slice(-1).pop() || $credentials?.url?.split("/").slice(-1).pop() || "v1" }}/models',
							},
							output: {
								postReceive: [
									{
										type: 'rootProperty',
										properties: {
											property: 'data',
										},
									},
									{
										type: 'filter',
										properties: {
											pass: `={{
												($parameter.options?.baseURL && !$parameter.options?.baseURL?.startsWith('https://api.openai.com/')) ||
												($credentials?.url && !$credentials.url.startsWith('https://api.openai.com/')) ||
												$responseItem.id.startsWith('ft:') ||
												$responseItem.id.startsWith('o1') ||
												$responseItem.id.startsWith('o3') ||
												($responseItem.id.startsWith('gpt-') && !$responseItem.id.includes('instruct'))
											}}`,
										},
									},
									{
										type: 'setKeyValue',
										properties: {
											name: '={{$responseItem.id}}',
											value: '={{$responseItem.id}}',
										},
									},
									{
										type: 'sort',
										properties: {
											key: 'name',
										},
									},
								],
							},
						},
					},
				},
				routing: {
					send: {
						type: 'body',
						property: 'model',
					},
				},
				default: 'gpt-5-mini',
				builderHint: OPENAI_MODEL_BUILDER_HINT,
				displayOptions: {
					hide: {
						'@version': [{ _cnd: { gte: 1.2 } }],
					},
				},
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'resourceLocator',
				default: { mode: 'list', value: 'gpt-5-mini' },
				builderHint: OPENAI_MODEL_BUILDER_HINT,
				required: true,
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select a model...',
						typeOptions: {
							searchListMethod: 'searchModels',
							searchable: true,
						},
					},
					{
						displayName: 'ID',
						name: 'id',
						type: 'string',
						placeholder: 'gpt-5-mini',
					},
				],
				description: 'The model. Choose from the list, or specify an ID.',
				displayOptions: {
					hide: {
						'@version': [{ _cnd: { lte: 1.1 } }],
					},
				},
			},
			{
				displayName:
					'When using non-OpenAI models via "Base URL" override, not all models might be chat-compatible or support other features, like tools calling or JSON response format',
				name: 'notice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						'/options.baseURL': [{ _cnd: { exists: true } }],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				description: 'Additional options to add',
				type: 'collection',
				default: {},
				options: [
					{
						displayName: 'Base URL',
						name: 'baseURL',
						default: 'https://api.openai.com/v1',
						description: 'Override the default base URL for the API',
						type: 'string',
						displayOptions: {
							hide: {
								'@version': [{ _cnd: { gte: 1.1 } }],
							},
						},
					},
					{
						displayName: 'Frequency Penalty',
						name: 'frequencyPenalty',
						default: 0,
						typeOptions: { maxValue: 2, minValue: -2, numberPrecision: 1 },
						description:
							"Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim",
						type: 'number',
					},
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxTokens',
						default: -1,
						description:
							'The maximum number of tokens to generate in the completion. Most models have a context length of 2048 tokens (except for the newest models, which support 32,768).',
						type: 'number',
						typeOptions: {
							maxValue: 32768,
						},
					},
					completionsResponseFormat,
					{
						displayName: 'JSON Schema Name',
						name: 'jsonSchemaName',
						type: 'string',
						default: 'response_schema',
						description:
							'The name of the response format. Must be a-z, A-Z, 0-9, or contain underscores and dashes, with a maximum length of 64.',
						displayOptions: {
							show: {
								'/options.responseFormat': ['json_schema'],
							},
						},
					},
					{
						displayName: 'JSON Schema',
						name: 'jsonSchema',
						type: 'json',
						default: jsonSchemaExample,
						description: 'The JSON Schema that the response must conform to',
						displayOptions: {
							show: {
								'/options.responseFormat': ['json_schema'],
							},
						},
					},
					{
						displayName: 'JSON Schema Description',
						name: 'jsonSchemaDescription',
						type: 'string',
						default: '',
						description: 'Optional description of the JSON Schema',
						displayOptions: {
							show: {
								'/options.responseFormat': ['json_schema'],
							},
						},
					},
					{
						displayName: 'JSON Schema Strict',
						name: 'jsonSchemaStrict',
						type: 'boolean',
						default: false,
						description:
							'Whether to require that the response strictly matches the provided JSON Schema',
						displayOptions: {
							show: {
								'/options.responseFormat': ['json_schema'],
							},
						},
					},
					{
						displayName: 'Presence Penalty',
						name: 'presencePenalty',
						default: 0,
						typeOptions: { maxValue: 2, minValue: -2, numberPrecision: 1 },
						description:
							"Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics",
						type: 'number',
					},
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						default: 0.7,
						typeOptions: { maxValue: 2, minValue: 0, numberPrecision: 1 },
						description:
							'Controls randomness: Lowering results in less random completions. As the temperature approaches zero, the model will become deterministic and repetitive.',
						type: 'number',
					},
					{
						displayName: 'Reasoning Effort',
						name: 'reasoningEffort',
						default: 'medium',
						description:
							'Controls the amount of reasoning tokens to use. A value of "low" will favor speed and economical token usage, "high" will favor more complete reasoning at the cost of more tokens generated and slower responses.',
						type: 'options',
						options: [
							{
								name: 'Low',
								value: 'low',
								description: 'Favors speed and economical token usage',
							},
							{
								name: 'Medium',
								value: 'medium',
								description: 'Balance between speed and reasoning accuracy',
							},
							{
								name: 'High',
								value: 'high',
								description:
									'Favors more complete reasoning at the cost of more tokens generated and slower responses',
							},
						],
						displayOptions: {
							show: {
								'/model': [{ _cnd: { regex: '(^o1([-\\d]+)?$)|(^o[3-9].*)|(^gpt-5.*)' } }],
							},
						},
					},
					{
						displayName: 'Timeout',
						name: 'timeout',
						default: 60000,
						description: 'Maximum amount of time a request is allowed to take in milliseconds',
						type: 'number',
					},
					{
						displayName: 'Max Retries',
						name: 'maxRetries',
						default: 2,
						description: 'Maximum number of retries to attempt',
						type: 'number',
					},
					{
						displayName: 'Top P',
						name: 'topP',
						default: 1,
						typeOptions: { maxValue: 1, minValue: 0, numberPrecision: 1 },
						description:
							'Controls diversity via nucleus sampling: 0.5 means half of all likelihood-weighted options are considered. We generally recommend altering this or temperature but not both.',
						type: 'number',
					},
				],
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('openAiApi');

		const version = this.getNode().typeVersion;
		const modelName =
			version >= 1.2
				? (this.getNodeParameter('model.value', itemIndex) as string)
				: (this.getNodeParameter('model', itemIndex) as string);

		const options = this.getNodeParameter('options', itemIndex, {}) as ModelOptions;

		const configuration: ClientOptions = {};

		if (options.baseURL) {
			configuration.baseURL = options.baseURL;
		} else if (credentials.url) {
			configuration.baseURL = credentials.url as string;
		}

		const timeout = options.timeout;
		configuration.defaultHeaders = mergeCustomHeaders(
			credentials,
			(configuration.defaultHeaders ?? {}) as Record<string, string>,
		);

		const modelKwargs: Record<string, unknown> = {};
		if (options.responseFormat) {
			if (options.responseFormat === 'json_schema') {
				modelKwargs.response_format = {
					type: 'json_schema',
					json_schema: {
						name: options.jsonSchemaName,
						schema: jsonParse(options.jsonSchema || '{}', {
							errorMessage: 'Failed to parse JSON Schema',
						}),
						...(options.jsonSchemaDescription && { description: options.jsonSchemaDescription }),
						strict: options.jsonSchemaStrict,
					},
				};
			} else {
				modelKwargs.response_format = { type: options.responseFormat };
			}
		}
		if (options.reasoningEffort && ['low', 'medium', 'high'].includes(options.reasoningEffort)) {
			modelKwargs.reasoning_effort = options.reasoningEffort;
		}

		const includedOptions = pick(options, [
			'frequencyPenalty',
			'maxTokens',
			'presencePenalty',
			'temperature',
			'topP',
			'baseURL',
		]);

		const fields: Record<string, unknown> = {
			apiKey: (credentials.apiKey as string) || '',
			model: modelName,
			...includedOptions,
			timeout,
			maxRetries: options.maxRetries ?? 2,
			configuration,
			callbacks: [new N8nLlmTracing(this)],
			modelKwargs,
			onFailedAttempt: makeN8nLlmFailedAttemptHandler(this, openAiFailedAttemptHandler),
			supportsStrictToolCalling: false,
		};

		const model = new ChatOpenAI(fields);

		return {
			response: model,
		};
	}
}
