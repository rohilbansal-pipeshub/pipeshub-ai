from typing import Dict, List, Any, Optional, Union
import json
from dataclasses import dataclass

@dataclass
class ChatDocCitation:
    content: str
    metadata: Dict[str, Any]
    chunkindex: int

def process_citations(llm_response, documents: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Process the LLM response and extract citations from relevant documents.
    
    Args:
        llm_response: Response object from LLM containing content with documentIndexes
        documents: List of document dictionaries with content and metadata
        
    Returns:
        Dict containing processed response with citations
    """
    try:
        # Handle the case where llm_response might be an object with a content field
        if hasattr(llm_response, 'content'):
            response_content = llm_response.content
        elif isinstance(llm_response, dict) and 'content' in llm_response:
            response_content = llm_response['content']
        else:
            response_content = llm_response
        
        # Parse the LLM response if it's a string
        if isinstance(response_content, str):
            try:
                # Clean the JSON string before parsing
                cleaned_content = response_content.strip()
                # Handle nested JSON (sometimes response is JSON within JSON)
                if cleaned_content.startswith('"') and cleaned_content.endswith('"'):
                    # Remove outer quotes and unescape inner quotes
                    cleaned_content = cleaned_content[1:-1].replace('\\"', '"')
                
                # Handle escaped newlines and other special characters
                cleaned_content = cleaned_content.replace('\\n', '\n').replace('\\t', '\t')
                
                # Try to parse the cleaned content
                response_data = json.loads(cleaned_content)
            except json.JSONDecodeError as e:
                # If regular parsing fails, try a more lenient approach
                try:
                    # Sometimes response might be malformed with extra characters
                    # Find the first { and last } to extract potential JSON
                    start_idx = cleaned_content.find('{')
                    end_idx = cleaned_content.rfind('}')
                    
                    if start_idx >= 0 and end_idx > start_idx:
                        potential_json = cleaned_content[start_idx:end_idx+1]
                        response_data = json.loads(potential_json)
                    else:
                        return {
                            "error": f"Failed to parse LLM response: {str(e)}",
                            "raw_response": response_content
                        }
                except Exception as nested_e:
                    return {
                        "error": f"Failed to parse LLM response: {str(e)}, Nested error: {str(nested_e)}",
                        "raw_response": response_content
                    }
        else:
            response_data = response_content
        
        # Debug information
        print(f"Response data type: {type(response_data)}")
        print(f"Response data: {response_data}")
        
        # Extract document indexes (1-based indexing from template)
        doc_indexes = []
        
        # Handle different formats of chunkIndexes
        chunk_indexes = None
        
        # Function to recursively search for chunk indexes in nested dictionaries
        def find_chunk_indexes(data, visited=None):
            if visited is None:
                visited = set()
                
            # Avoid circular references
            data_id = id(data)
            if data_id in visited:
                return None
            visited.add(data_id)
            
            if isinstance(data, dict):
                # Check for various possible key names
                for key in ["chunkIndexes", "chunkindex", "chunk_indexes", "chunkIndexes"]:
                    if key in data:
                        return data[key]
                
                # Search nested dictionaries
                for value in data.values():
                    result = find_chunk_indexes(value, visited)
                    if result is not None:
                        return result
            
            # Handle nested array of objects
            elif isinstance(data, list):
                for item in data:
                    result = find_chunk_indexes(item, visited)
                    if result is not None:
                        return result
                        
            return None
        
        # Try to find chunk indexes in the response data
        chunk_indexes = find_chunk_indexes(response_data)
        
        # Fallback: If we still haven't found any indexes and have "answer" field,
        # try parsing the answer text to find numeric references
        if chunk_indexes is None and isinstance(response_data, dict) and "answer" in response_data:
            answer_text = response_data["answer"]
            # Look for citation patterns like [1] or [1, 2] in the answer
            import re
            citation_matches = re.findall(r'\[([0-9,\s]+)\]', answer_text)
            if citation_matches:
                # Use the first match as our chunk indexes
                chunk_indexes = citation_matches[0]
        
        # If we found chunk indexes, process them
        if chunk_indexes is not None:
            # Convert to list if it's not already
            if not isinstance(chunk_indexes, list):
                if isinstance(chunk_indexes, str):
                    # Try to handle comma-separated strings or space-separated
                    chunk_indexes = chunk_indexes.replace('[', '').replace(']', '').replace('"', '').replace("'", "")
                    # Split by comma or space
                    if ',' in chunk_indexes:
                        chunk_indexes = [r.strip() for r in chunk_indexes.split(',')]
                    else:
                        chunk_indexes = [r.strip() for r in chunk_indexes.split() if r.strip()]
                else:
                    chunk_indexes = [chunk_indexes]
                    
            # Filter out empty values
            chunk_indexes = [idx for idx in chunk_indexes if idx]
            
            print(chunk_indexes, "chunk_indexes")
            print(documents, "documents")
            # Process each index
            for idx in chunk_indexes:
                try:
                    # Strip any quotes or spaces
                    if isinstance(idx, str):
                        idx = idx.strip().strip('"\'')
                    
                    # Convert to int and adjust for 0-based indexing
                    idx_value = int(idx) - 1
                    if 0 <= idx_value < len(documents):
                        doc_indexes.append(idx_value)
                except (ValueError, TypeError) as e:
                    print(f"Error processing index {idx}: {str(e)}")
                    continue
        
        print(f"Processed doc_indexes: {doc_indexes}")
        
        # Get citations from referenced documents
        citations = []
        for idx in doc_indexes:
            try:
                doc = documents[idx]
                
                # Safely access content and metadata
                content = doc.get('content', '')
                metadata = doc.get('metadata', {})
                
                citation = ChatDocCitation(
                    content=content,
                    metadata=metadata,
                    chunkindex=idx+1
                )
                citations.append(citation)
            except (IndexError, KeyError) as e:
                print(f"Error accessing document at index {idx}: {str(e)}")
                continue

        # Create a result object (either use existing or create new)
        if isinstance(response_data, dict):
            result = response_data.copy()
        else:
            result = {"answer": str(response_data)}
            
        # Add citations to response
        result["citations"] = [
            {
                "content": cit.content,
                "chunkIndex": cit.chunkindex,
                "metadata": cit.metadata,
                "citationType": "vectordb|document"
            }
            for cit in citations
        ]
        
        return result
        
    except Exception as e:
        import traceback
        return {
            "error": f"Citation processing failed: {str(e)}",
            "traceback": traceback.format_exc(),
            "raw_response": llm_response
        }