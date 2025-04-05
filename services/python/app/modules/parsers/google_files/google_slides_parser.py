"""Google Slides Parser module for parsing Google Slides content"""

from typing import Dict, List, Optional, Any
from app.utils.logger import create_logger
from app.connectors.utils.decorators import exponential_backoff
from .parser_admin_service import ParserAdminService
from .parser_user_service import ParserUserService

logger = create_logger(__name__)

class GoogleSlidesParser:
    """Parser class for Google Slides content"""

    def __init__(self, admin_service: Optional[ParserAdminService] = None, user_service: Optional[ParserUserService] = None):
        """Initialize with either admin or user service"""
        self.admin_service = admin_service
        self.user_service = user_service
        self.service = None

        # Set the appropriate service
        if user_service and user_service.slides_service:
            self.service = user_service.slides_service
        elif admin_service and admin_service.slides_service:
            self.service = admin_service.slides_service

    @exponential_backoff()
    async def get_presentation_metadata(self, presentation_id: str) -> Dict[str, Any]:
        """Get metadata about the presentation"""
        try:
            if not self.service:
                logger.error("❌ No valid service available for parsing")
                return None

            presentation = self.service.presentations().get(
                presentationId=presentation_id
            ).execute()

            return {
                'title': presentation.get('title', ''),
                'locale': presentation.get('locale', ''),
                'slideCount': len(presentation.get('slides', [])),
                'presentationId': presentation_id,
                'revisionId': presentation.get('revisionId', ''),
                'pageSize': presentation.get('pageSize', {})
            }

        except Exception as e:
            logger.error("❌ Failed to get presentation metadata: %s", str(e))
            return None

    @exponential_backoff()
    async def parse_slide_content(self, presentation_id: str, slide_id: str) -> Dict[str, Any]:
        """Parse content from a specific slide"""
        try:
            if not self.service:
                logger.error("❌ No valid service available for parsing")
                return None

            # Get the specific slide content
            presentation = self.service.presentations().get(
                presentationId=presentation_id,
                fields=f"slides(objectId,slideProperties,pageElements)"
            ).execute()

            # Find the specific slide
            slide = next((s for s in presentation.get('slides', [])
                         if s.get('objectId') == slide_id), None)

            if not slide:
                logger.error(f"❌ Slide {slide_id} not found")
                return None

            return await self._process_slide(slide)

        except Exception as e:
            logger.error("❌ Failed to parse slide content: %s", str(e))
            return None

    async def _process_slide(self, slide: Dict) -> Dict[str, Any]:
        """Process individual slide content"""
        try:
            slide_data = {
                'slideId': slide.get('objectId', ''),
                'layout': slide.get('slideProperties', {}).get('layoutObjectId', ''),
                'masterObjectId': slide.get('slideProperties', {}).get('masterObjectId', ''),
                'elements': []
            }

            for element in slide.get('pageElements', []):
                element_data = await self._process_element(element)
                if element_data:
                    slide_data['elements'].append(element_data)

            return slide_data

        except Exception as e:
            logger.error("❌ Failed to process slide: %s", str(e))
            return None

    async def _process_element(self, element: Dict) -> Dict[str, Any]:
        """Process individual page element"""
        try:
            element_data = {
                'id': element.get('objectId', ''),
                'type': self._get_element_type(element),
                'transform': element.get('transform', {}),
                'size': element.get('size', {})
            }

            # Process based on element type
            if 'shape' in element:
                element_data.update(await self._process_shape(element))
            elif 'table' in element:
                element_data.update(await self._process_table(element))
            elif 'image' in element:
                element_data.update(await self._process_image(element))
            elif 'video' in element:
                element_data.update(await self._process_video(element))
            elif 'line' in element:
                element_data.update(await self._process_line(element))

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

    async def _process_shape(self, element: Dict) -> Dict[str, Any]:
        """Process shape element"""
        shape = element.get('shape', {})
        shape_data = {
            'shapeType': shape.get('shapeType', ''),
            'text': await self._extract_text_content(shape.get('text', {})),
            'placeholder': shape.get('placeholder', {}),
            'style': {
                'shapeBackgroundFill': shape.get('shapeProperties', {}).get('shapeBackgroundFill', {}),
                'outline': shape.get('shapeProperties', {}).get('outline', {})
            }
        }
        return shape_data

    async def _process_table(self, element: Dict) -> Dict[str, Any]:
        """Process table element"""
        table = element.get('table', {})
        table_data = {
            'rows': table.get('rows', 0),
            'columns': table.get('columns', 0),
            'cells': []
        }

        for row_idx, row in enumerate(table.get('tableRows', [])):
            for col_idx, cell in enumerate(row.get('tableCells', [])):
                cell_data = {
                    'rowIndex': row_idx,
                    'columnIndex': col_idx,
                    'text': await self._extract_text_content(cell.get('text', {})),
                    'style': cell.get('tableCellProperties', {})
                }
                table_data['cells'].append(cell_data)

        return table_data

    async def _process_image(self, element: Dict) -> Dict[str, Any]:
        """Process image element"""
        image = element.get('image', {})
        return {
            'sourceUrl': image.get('sourceUrl', ''),
            'contentUrl': image.get('contentUrl', ''),
            'imageProperties': image.get('imageProperties', {})
        }

    async def _process_video(self, element: Dict) -> Dict[str, Any]:
        """Process video element"""
        video = element.get('video', {})
        return {
            'id': video.get('id', ''),
            'source': video.get('source', ''),
            'url': video.get('url', ''),
            'videoProperties': video.get('videoProperties', {})
        }

    async def _process_line(self, element: Dict) -> Dict[str, Any]:
        """Process line element"""
        line = element.get('line', {})
        return {
            'lineType': line.get('lineType', ''),
            'lineProperties': line.get('lineProperties', {})
        }

    async def _extract_text_content(self, text_element: Dict) -> Dict[str, Any]:
        """Extract text content and styling"""
        if not text_element:
            return {'content': '', 'style': {}}

        text_content = {
            'content': '',
            'style': {},
            'lists': [],
            'links': []
        }

        for element in text_element.get('textElements', []):
            if 'textRun' in element:
                text_run = element['textRun']
                text_content['content'] += text_run.get('content', '')

                # Capture text style
                if 'style' in text_run:
                    text_content['style'] = {
                        'bold': text_run['style'].get('bold', False),
                        'italic': text_run['style'].get('italic', False),
                        'underline': text_run['style'].get('underline', False),
                        'fontSize': text_run['style'].get('fontSize', {}),
                        'foregroundColor': text_run['style'].get('foregroundColor', {}),
                        'backgroundColor': text_run['style'].get('backgroundColor', {})
                    }

                # Capture links
                if 'link' in text_run:
                    text_content['links'].append({
                        'url': text_run['link'].get('url', ''),
                        'text': text_run.get('content', '')
                    })

            elif 'paragraphMarker' in element:
                # Capture list information
                if 'bullet' in element['paragraphMarker']:
                    text_content['lists'].append({
                        'glyph': element['paragraphMarker']['bullet'].get('glyph', ''),
                        'listId': element['paragraphMarker']['bullet'].get('listId', ''),
                        'nestingLevel': element['paragraphMarker']['bullet'].get('nestingLevel', 0)
                    })

        return text_content

    @exponential_backoff()
    async def process_presentation(self, presentation_id: str) -> Dict[str, Any]:
        """Process an entire presentation including all slides"""
        try:
            if not self.service:
                logger.error("❌ No valid service available for parsing")
                return None

            # Get presentation metadata
            metadata = await self.get_presentation_metadata(presentation_id)
            if not metadata:
                return None

            # Get all slides
            presentation = self.service.presentations().get(
                presentationId=presentation_id
            ).execute()

            processed_slides = []
            for slide in presentation.get('slides', []):
                slide_data = await self._process_slide(slide)
                if slide_data:
                    processed_slides.append(slide_data)

            return {
                'metadata': metadata,
                'slides': processed_slides,
                'summary': {
                    'totalSlides': len(processed_slides),
                    'hasNotes': any(slide.get('slideProperties', {}).get('notesPage')
                                    for slide in presentation.get('slides', []))
                }
            }

        except Exception as e:
            logger.error("❌ Failed to process presentation: %s", str(e))
            return None
