from typing import List, Dict, Any, Optional, Set, Tuple
from collections import defaultdict
from langchain_community.embeddings import HuggingFaceEmbeddings
from qdrant_client import QdrantClient
from qdrant_client.http.models import Filter, FieldCondition, MatchValue
from langchain_qdrant import QdrantVectorStore, FastEmbedSparse, RetrievalMode
from dotenv import load_dotenv
from app.modules.retrieval.retrieval_arango import ArangoService
from app.config.arangodb_constants import CollectionNames,RecordTypes

class RetrievalService:
    def __init__(
        self,
        collection_name: str,
        qdrant_api_key: str,
        qdrant_host: str,
        grpc_port: int
    ):
        """
        Initialize the retrieval service with necessary configurations.

        Args:
            collection_name: Name of the Qdrant collection
            qdrant_api_key: API key for Qdrant
            qdrant_host: Qdrant server host URL
        """
        # Initialize dense embeddings with BGE (same as indexing)
        model_name = "BAAI/bge-large-en-v1.5"
        encode_kwargs = {'normalize_embeddings': True}

        self.dense_embeddings = HuggingFaceEmbeddings(
            model_name=model_name,
            model_kwargs={'device': 'cpu'},
            encode_kwargs=encode_kwargs
        )

        # Initialize sparse embeddings (same as indexing)
        self.sparse_embeddings = FastEmbedSparse(model_name="Qdrant/BM25")

        # Initialize Qdrant client
        self.qdrant_client = QdrantClient(
            host=qdrant_host,
            grpc_port=grpc_port,
            api_key=qdrant_api_key,
            prefer_grpc=True,
            https=False,
        )
        self.collection_name = collection_name

        # Initialize vector store with same configuration as indexing
        self.vector_store: QdrantVectorStore = QdrantVectorStore(
            client=self.qdrant_client,
            collection_name=collection_name,
            vector_name="dense",
            sparse_vector_name="sparse",
            embedding=self.dense_embeddings,
            sparse_embedding=self.sparse_embeddings,
            retrieval_mode=RetrievalMode.HYBRID,
        )
        
    def _preprocess_query(self, query: str) -> str:
        """
        Preprocess the query text.

        Args:
            query: Raw query text

        Returns:
            Preprocessed query text
        """
        # Add query prefix for better retrieval performance (BGE recommendation)
        # Same as in indexing pipeline
        return f"Represent this document for retrieval: {query.strip()}"

    def _format_results(self, results: List[tuple]) -> List[Dict[str, Any]]:
        """Format search results into a consistent structure with flattened metadata."""
        formatted_results = []
        for doc, score in results:
            formatted_result = {
                "content": doc.page_content,
                "score": float(score),
                "citationType": "vectordb|document",
                "metadata": doc.metadata
            }
            formatted_results.append(formatted_result)
        return formatted_results

    def _build_qdrant_filter(self, org_id: str, accessible_records: List[str]) -> Filter:
        """
        Build Qdrant filter for accessible records with both org_id and record_id conditions.

        Args:
            org_id: Organization ID to filter
            accessible_records: List of record IDs the user has access to

        Returns:
            Qdrant Filter object
        """
        return Filter(
            must=[
                FieldCondition(   # org_id condition
                    key="metadata.orgId",
                    match=MatchValue(value=org_id)
                ),
                Filter(   # recordId must be one of the accessible_records
                    should=[
                        FieldCondition(
                            key="metadata.recordId",
                            match=MatchValue(value=record_id)
                        ) for record_id in accessible_records
                    ]
                )
            ]
        )

    async def search_with_filters(
        self,
        queries: List[str],
        user_id: str,
        org_id: str,
        filter_groups: Optional[Dict[str, List[str]]] = None,
        limit: int = 20,
        arango_service: Optional[ArangoService] = None
    ) -> List[Dict[str, Any]]:
        """Perform semantic search on accessible records with multiple queries."""

        try:
            # Get accessible records
            if not arango_service:
                raise ValueError("ArangoService is required for permission checking")
            
            filter_groups = filter_groups or {}
            
            print("org_id: ", org_id)
            print("user_id: ", user_id)
            print("query: ", queries)
            print("limit: ", limit)
            print("filter_groups: ", filter_groups)
            
            # Convert filter_groups to format expected by get_accessible_records
            arango_filters = {}
            if filter_groups:  # Only process if filter_groups is not empty
                for key, values in filter_groups.items():
                    # Convert key to match collection naming
                    metadata_key = key.lower()  # e.g., 'departments', 'categories', etc.
                    arango_filters[metadata_key] = values
            
            accessible_records = await arango_service.get_accessible_records(
                user_id=user_id,
                org_id=org_id,
                filters=arango_filters
            )
            print("accessible_records: ", accessible_records)

            if not accessible_records:
                return []
            
            # Extract record IDs from accessible records
            record_ids = [record['_key'] for record in accessible_records if record is not None]
            # Build Qdrant filter
            qdrant_filter = self._build_qdrant_filter(org_id, record_ids)
            
            all_results = []
            seen_chunks = set()

            # Process each query
            for query in queries:
                # Perform similarity search
                processed_query = self._preprocess_query(query)
                results = await self.vector_store.asimilarity_search_with_score(
                    query=processed_query,
                    k=limit,
                    filter=qdrant_filter
                )
                print("results length", len(results))
                # Add to results if content not already seen
                for doc, score in results:
                   if doc.page_content not in seen_chunks:
                        all_results.append((doc, score))
                        seen_chunks.add(doc.page_content)
            
            print("all results length", len(all_results))

            search_results = self._format_results(all_results)
            record_ids = list(set(result['metadata']['recordId'] for result in search_results))
            user = await arango_service.get_user_by_user_id(user_id)
            
            # Get full record documents from Arango
            records = []
            if record_ids:
                for record_id in record_ids:
                    record = await arango_service.get_document(record_id, CollectionNames.RECORDS.value)
                    if record['recordType'] == RecordTypes.FILE.value:
                        files = await arango_service.get_document(record_id, CollectionNames.FILES.value)
                        record = {**record, **files}
                    if record['recordType'] == RecordTypes.MAIL.value:
                        mail = await arango_service.get_document(record_id, CollectionNames.MAILS.value)
                        message_id = record['externalRecordId']
                        # Format the webUrl with the user's email
                        mail['webUrl'] = f"https://mail.google.com/mail?authuser={user['email']}#all/{message_id}"
                        record = {**record, **mail}
                    records.append(record)
            
            return {
                "searchResults": search_results,
                "records": records
            }
            
        except Exception as e:
            raise ValueError(f"Filtered search failed: {str(e)}")