import asyncio
import os
from jinja2 import Template 
from pydantic import BaseModel
from dependency_injector.wiring import inject
from fastapi import APIRouter, Depends, HTTPException, Request
from app.setups.query_setup import AppContainer
from app.utils.logger import logger
from app.config.configuration_service import config_node_constants
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from app.modules.retrieval.retrieval_service import RetrievalService
from app.modules.retrieval.retrieval_arango import ArangoService
from app.config.configuration_service import ConfigurationService
from jinja2 import Template 
from app.modules.qna.prompt_templates import qna_prompt
from app.core.llm_service import AzureLLMConfig, OpenAILLMConfig, LLMFactory
import os
from app.config.ai_models_named_constants import LLMProvider, AzureOpenAILLM
from app.api.chatbot.citations import process_citations
from app.utils.query_transform import setup_query_transformation

router = APIRouter()

# Pydantic models
class ChatQuery(BaseModel):
    query: str
    limit: Optional[int] = 20
    previousConversations: List[Dict] = []
    filters: Optional[Dict[str, Any]] = None
    retrieval_mode: Optional[str] = "HYBRID"


async def get_retrieval_service(request: Request) -> RetrievalService:
    # Retrieve the container from the app (set in your lifespan)
    container: AppContainer = request.app.container
    # Await the async resource provider to get the actual service instance
    retrieval_service = await container.retrieval_service()
    return retrieval_service

async def get_arango_service(request: Request) -> ArangoService:
    container: AppContainer = request.app.container
    arango_service = await container.arango_service()
    return arango_service

async def get_config_service(request: Request) -> ConfigurationService:    
    container: AppContainer = request.app.container
    config_service = await container.config_service()
    return config_service

@router.post("/chat")
@inject
async def askAI(request: Request, query_info: ChatQuery, 
                retrieval_service=Depends(get_retrieval_service),
                arango_service=Depends(get_arango_service),
                config_service=Depends(get_config_service)):
    """Perform semantic search across documents"""
    try:
        # Setup LLM configuration
        ai_models = await config_service.get_config(config_node_constants.AI_MODELS.value)
        llm_configs = ai_models['llm']
        # For now, we'll use the first available provider that matches our supported types
        # We will add logic to choose a specific provider based on our needs
        llm_config = None
        
        for config in llm_configs:
            provider = config['provider']
            if provider == LLMProvider.AZURE_OPENAI_PROVIDER.value:
                llm = AzureLLMConfig(
                    model=config['configuration']['model'],
                    temperature=config['configuration']['temperature'],
                    api_key=config['configuration']['apiKey'],
                    azure_endpoint=config['configuration']['endpoint'],
                    azure_api_version=AzureOpenAILLM.AZURE_OPENAI_VERSION.value,
                    azure_deployment=config['configuration']['deploymentName'],
                )
                break
            elif provider == LLMProvider.OPENAI_PROVIDER.value:
                llm = OpenAILLMConfig(
                    model=config['configuration']['model'],
                    temperature=config['configuration']['temperature'],
                    api_key=config['configuration']['apiKey'],
                )
                break
        
        if not llm:
            raise ValueError("No supported LLM provider found in configuration")

        llm = LLMFactory.create_llm(llm_config)
      
        rewrite_chain, expansion_chain = setup_query_transformation(llm)
        
        # Run query transformations in parallel
        rewritten_query, expanded_queries = await asyncio.gather(
            rewrite_chain.ainvoke(query_info.query),
            expansion_chain.ainvoke(query_info.query)
        )
        
        logger.info(f"Rewritten query: {rewritten_query}")
        logger.info(f"Expanded queries: {expanded_queries}")
        
        expanded_queries_list = [q.strip() for q in expanded_queries.split('\n') if q.strip()]

        queries = [rewritten_query.strip()] if rewritten_query.strip() else []
        queries.extend([q for q in expanded_queries_list if q not in queries])

        # Get search results
        results = await retrieval_service.search_with_filters(
            queries=queries,
            org_id=request.state.user.get('orgId'),
            user_id=request.state.user.get('userId'),
            limit=query_info.limit,
            filter_groups=query_info.filters,
            arango_service=arango_service
        )
        logger.info("Results from the AI service received")
        results = results.get('searchResults')
        # Format conversation history
        previous_conversations = query_info.previousConversations
        print(results, "formatted_results")
        template = Template(qna_prompt) 
        rendered_form = template.render(query=query_info.query, records = results) 

        messages = [
            {"role": "system", "content": "You are a enterprise questions answering expert"}
        ]

        # Add conversation history
        for conversation in previous_conversations:
            if conversation.get('role') == 'user_query':
                messages.append({"role": "user", "content": conversation.get('content')})
            elif conversation.get('role') == 'bot_response':
                messages.append({"role": "assistant", "content": conversation.get('content')})
        
        # Add current query with context
        messages.append({"role": "user", "content": rendered_form})
        
        # Make async LLM call
        response = await llm.ainvoke(messages)
        
        # Process citations and return response
        return process_citations(response, results)
    except Exception as e:
        logger.error(f"Error in askAI: {str(e)}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/check-record-access/{record_id}")
@inject
async def check_record_access(
    record_id: str,
    request: Request,
    arango_service: ArangoService = Depends(get_arango_service)
) -> Optional[Dict]:
    """
    Check if the current user has access to a specific record
    """
    try:
        has_access = await arango_service.check_record_access_with_details(
            user_id=request.state.user.get('userId'),
            org_id=request.state.user.get('orgId'),
            record_id=record_id
        )
        return has_access
    except Exception as e:
        logger.error(f"Error checking record access: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to check record access"
        )


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}