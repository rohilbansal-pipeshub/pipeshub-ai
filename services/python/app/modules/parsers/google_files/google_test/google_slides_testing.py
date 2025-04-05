"""Test module for Google Slides API integration and parsing"""

import os
import pickle
import asyncio
from typing import Dict, List, Optional
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from app.utils.logger import create_logger
from app.connectors.utils.rate_limiter import GoogleAPIRateLimiter

logger = create_logger(__name__)

class GoogleSlidesTest:
    """Test class for Google Slides API operations and parsing"""

    def __init__(self):
        self.rate_limiter = GoogleAPIRateLimiter()
        self.google_limiter = self.rate_limiter.google_limiter
        self.credentials = None
        self.slides_service = None
        self.drive_service = None

    async def authenticate(self) -> bool:
        """Authenticate using OAuth2 for individual user"""
        try:
            logger.info("🔐 Setting up authentication")

            SCOPES = [
                'https://www.googleapis.com/auth/drive.readonly',
                'https://www.googleapis.com/auth/presentations.readonly'
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

            self.credentials = creds
            self.slides_service = build('slides', 'v1', credentials=creds)
            self.drive_service = build('drive', 'v3', credentials=creds)

            logger.info("✅ Authentication successful")
            return True

        except Exception as e:
            logger.error("❌ Authentication failed: %s", str(e))
            return False

    async def list_slides_files(self) -> List[Dict]:
        """List all Google Slides files in Drive"""
        try:
            logger.info("🔍 Listing Google Slides files")

            async with self.google_limiter:
                results = self.drive_service.files().list(
                    q="mimeType='application/vnd.google-apps.presentation'",
                    spaces='drive',
                    fields="files(id, name, createdTime, modifiedTime)",
                    pageSize=10  # Limiting to 10 files for testing
                ).execute()

            files = results.get('files', [])
            logger.info("✅ Found %d presentation files", len(files))
            return files

        except Exception as e:
            logger.error("❌ Failed to list Slides files: %s", str(e))
            return []

    async def process_presentation(self, presentation_id: str) -> Optional[Dict]:
        """Process a single presentation"""
        try:
            logger.info("🔄 Processing presentation: %s", presentation_id)

            async with self.google_limiter:
                presentation = self.slides_service.presentations().get(
                    presentationId=presentation_id
                ).execute()

            # Process presentation data
            processed_data = {
                'metadata': {
                    'title': presentation.get('title', ''),
                    'locale': presentation.get('locale', ''),
                    'slideCount': len(presentation.get('slides', [])),
                    'presentationId': presentation_id,
                },
                'slides': [],
                'summary': {
                    'totalSlides': len(presentation.get('slides', [])),
                    'hasNotes': any(slide.get('slideProperties', {}).get('notesPage')
                                    for slide in presentation.get('slides', []))
                }
            }

            # Process each slide
            for slide in presentation.get('slides', []):
                slide_data = await self._process_slide(slide)
                if slide_data:
                    processed_data['slides'].append(slide_data)

            logger.info("✅ Successfully processed presentation")
            return processed_data

        except Exception as e:
            logger.error("❌ Failed to process presentation: %s", str(e))
            return None

    async def _process_slide(self, slide: Dict) -> Dict:
        """Process individual slide content"""
        try:
            slide_data = {
                'slideId': slide.get('objectId', ''),
                'elements': []
            }

            # Process each element in the slide
            for element in slide.get('pageElements', []):
                element_data = await self._process_element(element)
                if element_data:
                    slide_data['elements'].append(element_data)

            return slide_data

        except Exception as e:
            logger.error("❌ Failed to process slide: %s", str(e))
            return None

    async def _process_element(self, element: Dict) -> Optional[Dict]:
        """Process individual page element"""
        try:
            element_data = {
                'type': self._get_element_type(element),
                'text': await self._extract_text(element)
            }

            return element_data

        except Exception as e:
            logger.error("❌ Failed to process element: %s", str(e))
            return None

    def _get_element_type(self, element: Dict) -> str:
        """Determine element type"""
        if 'shape' in element:
            return 'shape'
        elif 'table' in element:
            return 'table'
        elif 'image' in element:
            return 'image'
        elif 'video' in element:
            return 'video'
        elif 'line' in element:
            return 'line'
        return 'unknown'

    async def _extract_text(self, element: Dict) -> Dict:
        """Extract text content from element"""
        text_data = {
            'content': '',
            'links': []
        }

        # Extract text from shape
        if 'shape' in element and 'text' in element['shape']:
            for text_element in element['shape']['text'].get('textElements', []):
                if 'textRun' in text_element:
                    text_run = text_element['textRun']
                    text_data['content'] += text_run.get('content', '')

                    # Extract links if present
                    if 'link' in text_run.get('textStyle', {}):
                        text_data['links'].append({
                            'text': text_run.get('content', ''),
                            'url': text_run['textStyle']['link'].get('url', '')
                        })

        return text_data

    def print_presentation_summary(self, presentation_data: Dict):
        """Print a summary of the processed presentation"""
        try:
            metadata = presentation_data.get('metadata', {})
            slides = presentation_data.get('slides', [])
            summary = presentation_data.get('summary', {})

            logger.info("\n📊 Presentation Summary")
            logger.info("=" * 50)
            logger.info("📑 Title: %s", metadata.get('title'))
            logger.info("🔢 Total Slides: %d", summary.get('totalSlides'))
            logger.info("📝 Has Notes: %s",
                        "Yes" if summary.get('hasNotes') else "No")
            logger.info("\n")

            # Print details for each slide
            for idx, slide in enumerate(slides, 1):
                logger.info("📌 Slide %d", idx)
                logger.info("-" * 30)

                # Print elements in the slide
                elements = slide.get('elements', [])
                element_types = {}
                for element in elements:
                    element_type = element.get('type')
                    element_types[element_type] = element_types.get(
                        element_type, 0) + 1

                logger.info("Elements found:")
                for element_type, count in element_types.items():
                    logger.info(f"  - {element_type}: {count}")

                # Print text content if available
                text_elements = [e for e in elements if e.get(
                    'type') == 'shape' and e.get('text', {}).get('content')]
                if text_elements:
                    logger.info("\nText content:")
                    for text_element in text_elements:
                        content = text_element.get(
                            'text', {}).get('content', '').strip()
                        if content:
                            logger.info(f"  • {content}")

                logger.info("\n")

        except Exception as e:
            logger.error("❌ Failed to print presentation summary: %s", str(e))


async def main():
    """Main function to test Google Slides functionality"""
    slides_test = GoogleSlidesTest()

    # Authenticate
    if not await slides_test.authenticate():
        logger.error("❌ Authentication failed")
        return

    # List Slides files
    slides_files = await slides_test.list_slides_files()
    if not slides_files:
        logger.error("❌ No Slides files found")
        return

    # Process each presentation
    for file in slides_files:
        logger.info("\n🔄 Processing: %s", file['name'])
        presentation_data = await slides_test.process_presentation(file['id'])

        if presentation_data:
            # Print summary
            slides_test.print_presentation_summary(presentation_data)
        else:
            logger.error("❌ Failed to process presentation: %s", file['name'])


if __name__ == "__main__":
    asyncio.run(main())
