from app.utils.logger import create_logger
import aiohttp
from io import BytesIO
from app.config.arangodb_constants import EventTypes
from app.config.arangodb_constants import CollectionNames

logger = create_logger(__name__)

class EventProcessor:
    def __init__(self, processor, arango_service):
        logger.info("🚀 Initializing EventProcessor")
        self.processor = processor
        self.arango_service = arango_service

    async def on_event(self, event_data: dict):
        """
        Process events received from Kafka consumer
        Args:
            event_data: Dictionary containing:
                - event_type: Type of event (create, update, delete)
                - record_id: ID of the record
                - record_version: Version of the record
                - signed_url: Signed URL to download the file
                - connector_name: Name of the connector 
                - metadata_route: Route to get metadata
        """
        try:
            logger.info(f"📥 Processing event: {event_data}")

            # Extract event type and record ID
            event_type = event_data.get(
                'eventType', EventTypes.NEW_RECORD.value)  # default to create
            event_data = event_data.get('payload')
            record_id = event_data.get('recordId')
            org_id = event_data.get('orgId')

            if not record_id:
                logger.error("❌ No record ID provided in event data")
                return
            
            # Handle delete event
            if event_type == EventTypes.DELETE_RECORD.value:
                logger.info(f"🗑️ Deleting embeddings for record {record_id}")
                await self.processor.indexing_pipeline.delete_embeddings(record_id)
                return

            # For both create and update events, we need to process the document
            if event_type == EventTypes.UPDATE_RECORD.value:
                # For updates, first delete existing embeddings
                logger.info(f"""🔄 Updating record {record_id} - deleting existing embeddings""")
                await self.processor.indexing_pipeline.delete_embeddings(record_id)

            # Update indexing status to IN_PROGRESS
            record = await self.arango_service.get_document(record_id, CollectionNames.RECORDS.value)
            doc = dict(record)

            # Update with new metadata fields
            doc.update({
                "indexingStatus": "IN_PROGRESS",
            })

            docs = [doc]
            await self.arango_service.batch_upsert_nodes(docs, CollectionNames.RECORDS.value)   

            # Extract necessary data
            record_version = event_data.get('version', 0)
            signed_url = event_data.get('signedUrl')
            connector = event_data.get('connectorName', '')
            extension = event_data.get('extension', 'unknown')
            mime_type = event_data.get('mimeType', 'unknown')
            
            if extension is None and mime_type != 'text/gmail_content':
                extension = event_data['recordName'].split('.')[-1]
            
            logger.info("🚀 Checking for mime_type")
            logger.info("🚀 mime_type: %s", mime_type)
            logger.info("🚀 extension: %s", extension)

            if mime_type == "application/vnd.google-apps.presentation":
                logger.info("🚀 Processing Google Slides")
                result = await self.processor.process_google_slides(record_id, record_version, org_id)
                return result

            if mime_type == "application/vnd.google-apps.document":
                logger.info("🚀 Processing Google Docs")
                result = await self.processor.process_google_docs(record_id, record_version, org_id)
                return result

            if mime_type == "application/vnd.google-apps.spreadsheet":
                logger.info("🚀 Processing Google Sheets")
                result = await self.processor.process_google_sheets(record_id, record_version, org_id)
                return result
            
            if mime_type == "text/gmail_content":
                logger.info("🚀 Processing Gmail Message")
                result = await self.processor.process_gmail_message(
                    recordName=f"Record-{record_id}",
                    recordId=record_id,
                    version=record_version,
                    source=connector,
                    orgId=org_id,
                    html_content=event_data.get('body'))
                
                logger.info(f"Content: {event_data.get('body')}")
                return result
            
            if signed_url:
                logger.debug(f"Signed URL: {signed_url}")
                # Download file using signed URL
                async with aiohttp.ClientSession() as session:
                    async with session.get(signed_url) as response:
                        if response.status != 200:
                            logger.error(f"❌ Failed to download file: {response}")
                            return
                        file_content = await response.read()
            else:
                file_content = event_data.get('buffer')

            if extension == "pdf":
                result = await self.processor.process_pdf_document(
                    recordName=f"Record-{record_id}",
                    recordId=record_id,
                    version=record_version,
                    source=connector,
                    orgId=org_id,
                    pdf_binary=file_content
                )

            elif extension == "docx":
                result = await self.processor.process_docx_document(
                    recordName=f"Record-{record_id}",
                    recordId=record_id,
                    version=record_version,
                    source=connector,
                    orgId=org_id,
                    docx_binary=BytesIO(file_content)
                )
            
            elif extension == "doc":
                result = await self.processor.process_doc_document(
                    recordName=f"Record-{record_id}",
                    recordId=record_id,
                    version=record_version,
                    source=connector,
                    orgId=org_id,
                    doc_binary=file_content
                )
            elif extension in ['xlsx']:
                result = await self.processor.process_excel_document(
                    recordName=f"Record-{record_id}",
                    recordId=record_id,
                    version=record_version,
                    source=connector,
                    orgId=org_id,
                    excel_binary=file_content
                )
            elif extension == "xls":
                result = await self.processor.process_xls_document(
                    recordName=f"Record-{record_id}",
                    recordId=record_id,
                    version=record_version,
                    source=connector,
                    orgId=org_id,
                    xls_binary=file_content
                )
            elif extension == "csv":
                result = await self.processor.process_csv_document(
                    recordName=f"Record-{record_id}",
                    recordId=record_id,
                    version=record_version,
                    source=connector,
                    orgId=org_id,
                    csv_binary=file_content
                )
                
            elif extension == "html":
                result = await self.processor.process_html_document(
                    recordName=f"Record-{record_id}",
                    recordId=record_id,
                    version=record_version,
                    source=connector,
                    orgId=org_id,
                    html_content=file_content
                )
                
            elif extension == "pptx":
                result = await self.processor.process_pptx_document(
                    recordName=f"Record-{record_id}",
                    recordId=record_id,
                    version=record_version,
                    source=connector,
                    orgId=org_id,
                    pptx_binary=file_content
                )
                
            elif extension == "md":
                result = await self.processor.process_md_document(
                    recordName=f"Record-{record_id}",
                    recordId=record_id,
                    version=record_version,
                    source=connector,
                    orgId=org_id,
                    md_binary=file_content
                )
            elif extension == "txt":
                result = await self.processor.process_txt_document(
                    recordName=f"Record-{record_id}",
                    recordId=record_id,
                    version=record_version,
                    source=connector,
                    orgId=org_id,
                    txt_binary=file_content
                )

            else:
                logger.info(f"""🔴🔴🔴 Unsupported file extension: {
                               extension} 🔴🔴🔴""")
                doc = docs[0]
                doc.update({
                    "indexingStatus": "FILE_TYPE_NOT_SUPPORTED"
                    
                })
                docs = [doc]
                await self.arango_service.batch_upsert_nodes(docs, CollectionNames.RECORDS.value)
                
                return


            logger.info(
                f"✅ Successfully processed document for record {record_id}")
            return result

        except Exception as e:
            # Let the error bubble up to Kafka consumer
            logger.error(f"❌ Error in event processor: {str(e)}")
            raise

