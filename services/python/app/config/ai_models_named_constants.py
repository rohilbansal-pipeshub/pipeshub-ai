from enum import Enum

class LLMProvider(Enum):
    AZURE_OPENAI_PROVIDER = "azureOpenAI"
    OPENAI_PROVIDER = "openAI"
    GEMINI_PROVIDER = "gemini"
    VERTEX_AI_PROVIDER = "vertexAI"
    ANTHROPIC_PROVIDER = "anthropic"
    
class OCRProvider(Enum):
    AZURE_PROVIDER = "azureDI"
    OCRMYPDF_PROVIDER = "ocrmypdf"
    
class AzureOpenAILLM(Enum):
    AZURE_OPENAI_VERSION = "2023-07-01-preview"
    
class AzureDocIntelligenceModel(Enum):
    PREBUILT_DOCUMENT = "prebuilt-document"