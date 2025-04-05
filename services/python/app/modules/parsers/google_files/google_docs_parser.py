"""Google Docs Parser module for parsing Google Docs content"""

from typing import Dict, Optional
from app.utils.logger import create_logger
from app.connectors.utils.decorators import exponential_backoff
from .parser_admin_service import ParserAdminService
from .parser_user_service import ParserUserService

logger = create_logger(__name__)

class GoogleDocsParser:
    """Parser class for Google Docs content"""

    def __init__(self, admin_service: Optional[ParserAdminService] = None, user_service: Optional[ParserUserService] = None):
        """Initialize with either admin or user service"""
        self.admin_service = admin_service
        self.user_service = user_service
        self.service = None

        # Set the appropriate service
        if user_service and user_service.docs_service:
            self.service = user_service.docs_service
        elif admin_service and admin_service.docs_service:
            self.service = admin_service.docs_service

    @exponential_backoff()
    async def parse_doc_content(self, doc_id: str) -> Optional[Dict]:
        """Parse detailed content from a Google Doc including structural elements"""
        try:
            # Fetch the document
            document = self.docs_service.documents().get(documentId=doc_id).execute()

            # Initialize content structure
            content = {
                'title': document.get('title', ''),
                'elements': [],
                'tables': [],
                'images': [],
                'headers': [],
                'footers': [],
            }

            # Process document body
            for element in document.get('body', {}).get('content', []):
                # Process paragraphs
                if 'paragraph' in element:
                    para_content = {
                        'type': 'paragraph',
                        'start_index': element.get('startIndex', 0),
                        'end_index': element.get('endIndex', 0),
                        'text': '',
                        'style': element['paragraph'].get('paragraphStyle', {}),
                        'bullet': element['paragraph'].get('bullet', None),
                        'links': []  # Add links array to store link information
                    }

                    # Extract text, formatting, and links from paragraph elements
                    for para_element in element['paragraph'].get('elements', []):
                        if 'textRun' in para_element:
                            text_run = para_element['textRun']
                            text_content = text_run.get('content', '')
                            para_content['text'] += text_content

                            # Include text styling information
                            para_content['textStyle'] = text_run.get(
                                'textStyle', {})

                            # Check for links in the text run
                            if text_run.get('textStyle', {}).get('link'):
                                para_content['links'].append({
                                    'text': text_content,
                                    'url': text_run['textStyle']['link'].get('url', ''),
                                    'start_index': para_element.get('startIndex', 0),
                                    'end_index': para_element.get('endIndex', 0)
                                })

                    content['elements'].append(para_content)

                # Process tables
                elif 'table' in element:
                    table_content = {
                        'type': 'table',
                        'start_index': element.get('startIndex', 0),
                        'end_index': element.get('endIndex', 0),
                        'rows': len(element['table'].get('tableRows', [])),
                        'columns': len(element['table'].get('tableRows', [{}])[0].get('tableCells', [])),
                        'cells': []
                    }

                    # Process each cell in the table
                    for row_idx, row in enumerate(element['table'].get('tableRows', [])):
                        for col_idx, cell in enumerate(row.get('tableCells', [])):
                            cell_content = {
                                'row': row_idx,  # Add row number
                                'column': col_idx,  # Add column number
                                'start_index': cell.get('startIndex', 0),
                                'end_index': cell.get('endIndex', 0),
                                'content': [],
                                'links': []  # Add links array for table cells
                            }

                            # Extract content from cell
                            for cell_element in cell.get('content', []):
                                if 'paragraph' in cell_element:
                                    text = ''
                                    for para_element in cell_element['paragraph'].get('elements', []):
                                        if 'textRun' in para_element:
                                            text_run = para_element['textRun']
                                            text_content = text_run.get(
                                                'content', '')
                                            text += text_content

                                            # Check for links in the cell
                                            if text_run.get('textStyle', {}).get('link'):
                                                cell_content['links'].append({
                                                    'text': text_content,
                                                    'url': text_run['textStyle']['link'].get('url', ''),
                                                    'start_index': para_element.get('startIndex', 0),
                                                    'end_index': para_element.get('endIndex', 0)
                                                })
                                    cell_content['content'].append(text)

                            table_content['cells'].append(cell_content)

                    content['tables'].append(table_content)

                # Process inline images
                elif 'inlineObjectElement' in element:
                    obj_id = element['inlineObjectElement'].get(
                        'inlineObjectId')
                    if obj_id and obj_id in document.get('inlineObjects', {}):
                        image_obj = document['inlineObjects'][obj_id]
                        image_content = {
                            'type': 'image',
                            'start_index': element.get('startIndex', 0),
                            'end_index': element.get('endIndex', 0),
                            'source_uri': image_obj.get('inlineObjectProperties', {})
                            .get('embeddedObject', {})
                            .get('imageProperties', {})
                            .get('sourceUri', ''),
                            'size': image_obj.get('inlineObjectProperties', {})
                            .get('embeddedObject', {})
                            .get('size', {})
                        }
                        content['images'].append(image_content)

            # Process headers
            for header_id, header in document.get('headers', {}).items():
                header_content = {
                    'id': header_id,
                    'content': []
                }
                for element in header.get('content', []):
                    if 'paragraph' in element:
                        text = ''
                        for para_element in element['paragraph'].get('elements', []):
                            if 'textRun' in para_element:
                                text += para_element['textRun'].get(
                                    'content', '')
                        header_content['content'].append(text)
                content['headers'].append(header_content)

            # Process footers
            for footer_id, footer in document.get('footers', {}).items():
                footer_content = {
                    'id': footer_id,
                    'content': []
                }
                for element in footer.get('content', []):
                    if 'paragraph' in element:
                        text = ''
                        for para_element in element['paragraph'].get('elements', []):
                            if 'textRun' in para_element:
                                text += para_element['textRun'].get(
                                    'content', '')
                        footer_content['content'].append(text)
                content['footers'].append(footer_content)

            return content

        except Exception as e:
            logger.error("❌ Failed to parse document %s: %s", doc_id, str(e))
            return None
