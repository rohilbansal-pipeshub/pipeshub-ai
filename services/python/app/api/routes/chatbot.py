import asyncio
from jinja2 import Template 
from pydantic import BaseModel
from dependency_injector.wiring import inject
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Optional, Dict, Any, List
from app.setups.query_setup import AppContainer
from app.utils.logger import logger
from app.modules.retrieval.retrieval_service import RetrievalService
from app.modules.retrieval.retrieval_arango import ArangoService
from app.config.configuration_service import ConfigurationService
from app.modules.qna.prompt_templates import qna_prompt
from app.utils.citations import process_citations
from app.utils.query_transform import setup_query_transformation
from app.utils.query_decompose import QueryDecompositionService
from app.modules.reranker.reranker import RerankerService

router = APIRouter()

# Pydantic models
class ChatQuery(BaseModel):
    query: str
    limit: Optional[int] = 20
    previousConversations: List[Dict] = []
    useDecomposition: bool = True
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
    config_service = container.config_service()
    return config_service

async def get_reranker_service(request: Request) -> RerankerService:
    container: AppContainer = request.app.container
    reranker_service = container.reranker_service()
    return reranker_service

@router.post("/chat")
@inject
async def askAI(request: Request, query_info: ChatQuery, 
                retrieval_service: RetrievalService=Depends(get_retrieval_service),
                arango_service: ArangoService=Depends(get_arango_service),
                reranker_service: RerankerService=Depends(get_reranker_service)):
    """Perform semantic search across documents"""
    try:
        llm = retrieval_service.llm
      
        print("useDecomposition", query_info.useDecomposition)
        if query_info.useDecomposition:
            print("calling query decomposition")
            decomposition_service = QueryDecompositionService(llm)
            decomposition_result = await decomposition_service.decompose_query(query_info.query)
            decomposed_queries = decomposition_result["queries"]
            
            print("decomposed_queries", decomposed_queries)
            if not decomposed_queries:
                all_queries = [{'query': query_info.query}]
            else:
                all_queries = decomposed_queries

        else:
            all_queries = [{'query': query_info.query}]
        
        complete_queries = []
        for query_dict in all_queries:
            # Setup query transformation 
            query = query_dict.get('query')
            print("Query is ", query)
            rewrite_chain, expansion_chain = await setup_query_transformation(llm)
            
            # Run query transformations in parallel
            rewritten_query, expanded_queries = await asyncio.gather(
                rewrite_chain.ainvoke(query),
                expansion_chain.ainvoke(query)
            )
        
            logger.info(f"Rewritten query: {rewritten_query}")
            logger.info(f"Expanded queries: {expanded_queries}")
            
            expanded_queries_list = [q.strip() for q in expanded_queries.split('\n') if q.strip()]

            queries = [rewritten_query.strip()] if rewritten_query.strip() else []
            queries.extend([q for q in expanded_queries_list if q not in queries])
            seen = set()
            unique_queries = []
            for q in queries:
                if q.lower() not in seen:
                    seen.add(q.lower())
                    unique_queries.append(q)

            results = await retrieval_service.search_with_filters(
                queries=unique_queries,
                org_id=request.state.user.get('orgId'),
                user_id=request.state.user.get('userId'),
                limit=query_info.limit,
                filter_groups=query_info.filters,
                arango_service=arango_service
            )
            logger.info("Results from the AI service received")
            # Format conversation history
            previous_conversations = query_info.previousConversations
            print(results, "formatted_results")
            template = Template(qna_prompt)
            # Get raw search results
            search_results = results.get('searchResults', [])
        
            # Apply reranking
            if search_results and len(search_results) > 1:
                # Use the original query for reranking
                reranked_results = await reranker_service.rerank(
                    query=query_info.query,
                    documents=search_results,
                    top_k=query_info.limit  # Maintain the same limit
                )
                # Update results with reranked documents
                results['searchResults'] = reranked_results
            
                print(results, "reranked_results")
                complete_queries.append(results['searchResults'])
        # Get search results
        logger.debug("complete queries", complete_queries)
        

        rendered_form = template.render(query=query_info.query, rephrased_queries=complete_queries, records = results['searchResults']) 

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
        return process_citations(response, results['searchResults'])
    except Exception as e:
        logger.error(f"Error in askAI: {str(e)}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))
