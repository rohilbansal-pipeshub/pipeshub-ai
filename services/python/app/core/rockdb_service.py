from typing import Dict, List, Optional, Any
from rocksdict import Rdict, Options
import json
from app.utils.logger import create_logger

logger = create_logger(__name__)

class RockDBService:
    def __init__(self, db_path: str = "data/rockdb"):
        """Initialize RockDB service with the specified path"""
        logger.info(f"🗄️ Initializing RockDB at {db_path}")

        # Configure RockDB options
        opts = Options()
        opts.create_if_missing(True)
        opts.set_max_open_files(300000)
        opts.set_write_buffer_size(67108864)
        opts.set_max_write_buffer_number(3)
        opts.set_target_file_size_base(67108864)
        opts.set_compression_type('lz4')

        try:
            self.db = Rdict(path=db_path, options=opts)
            logger.debug("✅ RockDB initialized successfully")
        except Exception as e:
            logger.error(f"❌ Failed to initialize RockDB: {str(e)}")
            raise

    def _make_paragraph_key(self, doc_id: str, para_idx: int) -> bytes:
        """Create a key for paragraph storage"""
        return f"para:{doc_id}:{para_idx}".encode()

    def _make_sentence_key(self, doc_id: str, sent_idx: int) -> bytes:
        """Create a key for sentence storage"""
        return f"sent:{doc_id}:{sent_idx}".encode()

    def _make_mapping_key(self, doc_id: str) -> bytes:
        """Create a key for sentence-to-paragraph mapping"""
        return f"map:{doc_id}".encode()

    def store_document_content(self, doc_id: str, paragraphs: List[Dict], sentences: List[Dict]) -> None:
        """
        Store document paragraphs and sentences with their mappings

        Args:
            doc_id: Unique document identifier
            paragraphs: List of paragraph dictionaries with content and metadata
            sentences: List of sentence dictionaries with content and metadata
        """
        logger.info(f"📝 Storing content for document {doc_id}")
        logger.debug(f"📊 Paragraphs: {
                     len(paragraphs)}, Sentences: {len(sentences)}")

        try:
            # Create sentence to paragraph mapping
            sent_to_para_mapping = {}
            current_para_idx = 0

            # Store paragraphs
            for para_idx, para in enumerate(paragraphs):
                para_key = self._make_paragraph_key(doc_id, para_idx)
                self.db[para_key] = json.dumps(para)
                logger.debug(f"📘 Stored paragraph {para_idx}: {
                             para['content'][:50]}...")

            # Store sentences and create mapping
            for sent_idx, sent in enumerate(sentences):
                # Store sentence
                sent_key = self._make_sentence_key(doc_id, sent_idx)
                self.db[sent_key] = json.dumps(sent)

                # Map sentence to its paragraph based on block number
                if 'block_number' in sent:
                    sent_to_para_mapping[str(sent_idx)] = str(
                        sent['block_number'])
                logger.debug(f"📜 Stored sentence {sent_idx}: {
                             sent['content'][:50]}...")

            # Store mapping
            mapping_key = self._make_mapping_key(doc_id)
            self.db[mapping_key] = json.dumps(sent_to_para_mapping)

            logger.info(f"✅ Successfully stored document {doc_id} content")

        except Exception as e:
            logger.error(f"❌ Failed to store document content: {str(e)}")
            raise

    def get_sentence_with_context(self, doc_id: str, sent_idx: int) -> Dict[str, Any]:
        """
        Retrieve a sentence with its paragraph context

        Args:
            doc_id: Document identifier
            sent_idx: Sentence index

        Returns:
            Dictionary containing sentence and its paragraph context
        """
        logger.debug(f"🔍 Retrieving sentence {
                     sent_idx} from document {doc_id}")

        try:
            # Get sentence
            sent_key = self._make_sentence_key(doc_id, sent_idx)
            sent_data = self.db.get(sent_key)
            if not sent_data:
                logger.warning(
                    f"⚠️ Sentence {sent_idx} not found in document {doc_id}")
                return None

            sentence = json.loads(sent_data)

            # Get mapping
            mapping_key = self._make_mapping_key(doc_id)
            mapping_data = self.db.get(mapping_key)
            if not mapping_data:
                logger.warning(f"⚠️ Mapping not found for document {doc_id}")
                return {"sentence": sentence, "paragraph": None}

            mapping = json.loads(mapping_data)

            # Get paragraph
            para_idx = mapping.get(str(sent_idx))
            if para_idx:
                para_key = self._make_paragraph_key(doc_id, int(para_idx))
                para_data = self.db.get(para_key)
                if para_data:
                    paragraph = json.loads(para_data)
                    logger.debug(f"✅ Retrieved sentence with context")
                    return {
                        "sentence": sentence,
                        "paragraph": paragraph
                    }

            return {"sentence": sentence, "paragraph": None}

        except Exception as e:
            logger.error(
                f"❌ Failed to retrieve sentence with context: {str(e)}")
            raise

    def get_document_sentences(self, doc_id: str) -> List[Dict[str, Any]]:
        """
        Retrieve all sentences with their paragraph context for a document

        Args:
            doc_id: Document identifier

        Returns:
            List of dictionaries containing sentences and their paragraph context
        """
        logger.debug(f"🔍 Retrieving all sentences for document {doc_id}")

        try:
            sentences_with_context = []
            prefix = f"sent:{doc_id}:".encode()

            for key in self.db.prefix_iterator(prefix):
                sent_idx = int(key.decode().split(":")[-1])
                sentence_with_context = self.get_sentence_with_context(
                    doc_id, sent_idx)
                if sentence_with_context:
                    sentences_with_context.append(sentence_with_context)

            logger.info(f"✅ Retrieved {
                        len(sentences_with_context)} sentences with context")
            return sentences_with_context

        except Exception as e:
            logger.error(f"❌ Failed to retrieve document sentences: {str(e)}")
            raise

    def close(self):
        """Close the database connection"""
        logger.info("🔒 Closing RockDB connection")
        try:
            self.db.close()
            logger.debug("✅ RockDB connection closed")
        except Exception as e:
            logger.error(f"❌ Failed to close RockDB connection: {str(e)}")
            raise
