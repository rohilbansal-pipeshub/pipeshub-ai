from app.core.llm_service import AzureLLMConfig, OpenAILLMConfig, GeminiLLMConfig, AnthropicLLMConfig, AwsBedrockLLMConfig, LLMFactory
from app.config.ai_models_named_constants import LLMProvider, AzureOpenAILLM
from app.config.configuration_service import config_node_constants
from app.config.configuration_service import ConfigurationService


async def get_llm(config_service: ConfigurationService):
    ai_models = await config_service.get_config(config_node_constants.AI_MODELS.value)
    llm_configs = ai_models['llm']
    # For now, we'll use the first available provider that matches our supported types
    # We will add logic to choose a specific provider based on our needs
    llm_config = None
    
    for config in llm_configs:
        provider = config['provider']
        if provider == LLMProvider.AZURE_OPENAI_PROVIDER.value:
            llm_config = AzureLLMConfig(
                model=config['configuration']['model'],
                temperature=0.2,
                api_key=config['configuration']['apiKey'],
                azure_endpoint=config['configuration']['endpoint'],
                azure_api_version=AzureOpenAILLM.AZURE_OPENAI_VERSION.value,
                azure_deployment=config['configuration']['deploymentName'],
            )
            break
        elif provider == LLMProvider.OPENAI_PROVIDER.value:
            llm_config = OpenAILLMConfig(
                model=config['configuration']['model'],
                temperature=0.2,
                api_key=config['configuration']['apiKey'],
            )
            break
        elif provider == LLMProvider.GEMINI_PROVIDER.value:
            llm_config = GeminiLLMConfig(
                model=config['configuration']['model'],
                temperature=0.2,
                api_key=config['configuration']['apiKey'],
            )
        elif provider == LLMProvider.ANTHROPIC_PROVIDER.value:
            llm_config = AnthropicLLMConfig(
                model=config['configuration']['model'],
                temperature=0.2,
                api_key=config['configuration']['apiKey'],
            )
        elif provider == LLMProvider.AWS_BEDROCK_PROVIDER.value:
            llm_config = AwsBedrockLLMConfig(
                model=config['configuration']['model'],
                temperature=0.2,
                region=config['configuration']['region'],
                access_key=config['configuration']['aws_access_key_id'],
                access_secret=config['configuration']['aws_access_secret_key'],
                api_key=config['configuration']['aws_access_secret_key'],
            )
    if not llm_config:
        raise ValueError("No supported LLM provider found in configuration")

    llm = LLMFactory.create_llm(llm_config)

    return llm