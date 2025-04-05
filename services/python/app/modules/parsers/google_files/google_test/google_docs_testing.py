"""Test module for Google Docs API integration"""

import os
import pickle
import asyncio
from typing import Dict, List, Optional
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from app.utils.logger import create_logger

logger = create_logger(__name__)

class GoogleDocsTest:
    """Test class for Google Docs API operations"""

    def __init__(self):
        self.docs_service = None
        self.drive_service = None

    async def authenticate(self) -> bool:
        """Authenticate using OAuth2 for individual user"""
        try:
            SCOPES = [
                'https://www.googleapis.com/auth/drive.readonly',
                'https://www.googleapis.com/auth/documents.readonly'
            ]

            creds = None
            if os.path.exists('token.pickle'):
                with open('token.pickle', 'rb') as token:
                    creds = pickle.load(token)

            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                else:
                    flow = InstalledAppFlow.from_client_secrets_file(
                        'credentials.json',  # Make sure this file exists
                        SCOPES
                    )
                    creds = flow.run_local_server(port=8090)
                with open('token.pickle', 'wb') as token:
                    pickle.dump(creds, token)

            # Build both Drive and Docs services
            self.drive_service = build('drive', 'v3', credentials=creds)
            self.docs_service = build('docs', 'v1', credentials=creds)
            return True

        except Exception as e:
            logger.error("❌ Authentication failed: %s", str(e))
            return False

    async def list_docs(self) -> List[Dict]:
        """List all Google Docs in the user's Drive"""
        try:
            results = self.drive_service.files().list(
                q="mimeType='application/vnd.google-apps.document'",
                spaces='drive',
                fields="files(id, name, createdTime, modifiedTime)",
                pageSize=10  # Limiting to 10 docs for testing
            ).execute()

            docs = results.get('files', [])
            logger.info("✅ Found %d documents", len(docs))
            return docs

        except Exception as e:
            logger.error("❌ Failed to list documents: %s", str(e))
            return []


async def main():
    """Main function to test Google Docs functionality"""
    docs_test = GoogleDocsTest()

    # Authenticate
    if not await docs_test.authenticate():
        logger.error("❌ Authentication failed")
        return

    # List documents
    docs = await docs_test.list_docs()
    if not docs:
        logger.error("❌ No documents found")
        return

    # Parse the first document in detail
    first_doc = docs[0]
    logger.info("🔍 Analyzing document: %s", first_doc['name'])

    content = await docs_test.parse_doc_content(first_doc['id'])
    if content:
        logger.info("\n✅ Document Analysis Results:")
        logger.info("=" * 50)
        logger.info("📄 Title: %s\n", content['title'])

        # Display paragraphs
        logger.info("📝 Paragraphs:")
        logger.info("-" * 30)
        for idx, para in enumerate(content['elements'], 1):
            if para['type'] == 'paragraph':
                logger.info(f"Paragraph {idx}:")
                logger.info(f"  Start Index: {para['start_index']}")
                logger.info(f"  End Index: {para['end_index']}")
                logger.info(f"  Text: {para['text']}")
                if para.get('bullet'):
                    logger.info(f"  Bullet: Yes")
                if para.get('textStyle'):
                    style = para['textStyle']
                    style_info = []
                    if style.get('bold'):
                        style_info.append('bold')
                    if style.get('italic'):
                        style_info.append('italic')
                    if style.get('underline'):
                        style_info.append('underlined')
                    if style_info:
                        logger.info(f"  Style: {', '.join(style_info)}")
                # Display links in paragraph
                if para.get('links'):
                    logger.info("  Links:")
                    for link in para['links']:
                        logger.info(f"    - {link['text']} ({link['url']})")
                        logger.info(f"      Start Index: {
                                    link['start_index']}")
                        logger.info(f"      End Index: {link['end_index']}")
                logger.info("")

        # Display tables
        if content['tables']:
            logger.info("\n📊 Tables:")
            logger.info("-" * 30)
            for idx, table in enumerate(content['tables'], 1):
                logger.info(f"Table {idx}:")
                logger.info(f"  Start Index: {table['start_index']}")
                logger.info(f"  End Index: {table['end_index']}")
                logger.info(f"  Dimensions: {table['rows']}x{
                            table['columns']}")
                logger.info("  Cells:")
                for cell in table['cells']:
                    logger.info(
                        f"    Cell [Row {cell['row']}, Col {cell['column']}]:")
                    logger.info(f"      Start Index: {cell['start_index']}")
                    logger.info(f"      End Index: {cell['end_index']}")
                    logger.info(f"      Content: {' '.join(cell['content'])}")
                    if cell.get('links'):
                        logger.info("      Links:")
                        for link in cell['links']:
                            logger.info(
                                f"        - {link['text']} ({link['url']})")
                            logger.info(f"          Start Index: {
                                        link['start_index']}")
                            logger.info(f"          End Index: {
                                        link['end_index']}")
                logger.info("")

        # Display images
        if content['images']:
            logger.info("\n🖼️ Images:")
            logger.info("-" * 30)
            for idx, image in enumerate(content['images'], 1):
                logger.info(f"Image {idx}:")
                logger.info(f"  Start Index: {image['start_index']}")
                logger.info(f"  End Index: {image['end_index']}")
                logger.info(f"  Source URI: {image['source_uri']}")
                if image.get('size'):
                    logger.info(f"  Size: {image['size']}")
                logger.info("")

        # Display headers
        if content['headers']:
            logger.info("\n📑 Headers:")
            logger.info("-" * 30)
            for idx, header in enumerate(content['headers'], 1):
                logger.info(f"Header {idx}:")
                logger.info(f"  ID: {header['id']}")
                logger.info(f"  Content: {' '.join(header['content'])}")
                logger.info("")

        # Display footers
        if content['footers']:
            logger.info("\n📟 Footers:")
            logger.info("-" * 30)
            for idx, footer in enumerate(content['footers'], 1):
                logger.info(f"Footer {idx}:")
                logger.info(f"  ID: {footer['id']}")
                logger.info(f"  Content: {' '.join(footer['content'])}")
                logger.info("")

    else:
        logger.error("❌ Failed to parse document content")


if __name__ == "__main__":
    asyncio.run(main())
