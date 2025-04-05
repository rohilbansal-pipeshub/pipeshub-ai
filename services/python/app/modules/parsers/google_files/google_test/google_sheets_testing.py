"""Test module for Google Sheets API integration"""

import os
import pickle
import asyncio
from typing import Dict, List, Optional, Any
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from app.utils.logger import create_logger

logger = create_logger(__name__)

class GoogleSheetsTest:
    """Test class for Google Sheets API operations"""

    def __init__(self):
        self.sheets_service = None
        self.drive_service = None

    async def authenticate(self) -> bool:
        """Authenticate using OAuth2 for individual user"""
        try:
            SCOPES = [
                'https://www.googleapis.com/auth/drive.readonly',
                'https://www.googleapis.com/auth/spreadsheets.readonly'
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
                        'credentials.json',
                        SCOPES
                    )
                    creds = flow.run_local_server(port=8090)
                with open('token.pickle', 'wb') as token:
                    pickle.dump(creds, token)

            # Build both Drive and Sheets services
            self.drive_service = build('drive', 'v3', credentials=creds)
            self.sheets_service = build('sheets', 'v4', credentials=creds)
            return True

        except Exception as e:
            logger.error("❌ Authentication failed: %s", str(e))
            return False

    async def list_sheets(self) -> List[Dict]:
        """List all Google Sheets in the user's Drive"""
        try:
            results = self.drive_service.files().list(
                q="mimeType='application/vnd.google-apps.spreadsheet'",
                spaces='drive',
                fields="files(id, name, createdTime, modifiedTime)",
                pageSize=100  # Adjust as needed
            ).execute()

            sheets = results.get('files', [])
            logger.info("✅ Found %d spreadsheets", len(sheets))
            return sheets

        except Exception as e:
            logger.error("❌ Failed to list spreadsheets: %s", str(e))
            return []

    async def get_spreadsheet_metadata(self, spreadsheet_id: str) -> Dict[str, Any]:
        """Get metadata about the spreadsheet including sheet names"""
        try:
            spreadsheet = self.sheets_service.spreadsheets().get(
                spreadsheetId=spreadsheet_id
            ).execute()

            return {
                'title': spreadsheet.get('properties', {}).get('title', ''),
                'locale': spreadsheet.get('properties', {}).get('locale', ''),
                'timeZone': spreadsheet.get('properties', {}).get('timeZone', ''),
                'sheets': [{
                    'title': sheet.get('properties', {}).get('title', ''),
                    'sheetId': sheet.get('properties', {}).get('sheetId', ''),
                    'index': sheet.get('properties', {}).get('index', 0),
                    'sheetType': sheet.get('properties', {}).get('sheetType', ''),
                    'gridProperties': sheet.get('properties', {}).get('gridProperties', {})
                } for sheet in spreadsheet.get('sheets', [])]
            }

        except Exception as e:
            logger.error("❌ Failed to get spreadsheet metadata: %s", str(e))
            return None

    def _get_column_letter(self, column_number: int) -> str:
        """Convert column number to letter (1 = A, 2 = B, etc.)"""
        result = ""
        while column_number > 0:
            column_number, remainder = divmod(column_number - 1, 26)
            result = chr(65 + remainder) + result
        return result

    async def get_sheet_data(self, spreadsheet_id: str, range_name: str) -> Dict[str, Any]:
        """Get sheet data including formatting"""
        try:
            # Get values and formatting in one batch request
            batch_request = self.sheets_service.spreadsheets().get(
                spreadsheetId=spreadsheet_id,
                ranges=[range_name],
                includeGridData=True
            ).execute()

            sheet_data = batch_request['sheets'][0]
            grid_data = sheet_data['data'][0]

            processed_data = {
                'headers': [],
                'data': []
            }

            # Process headers (first row)
            if 'rowData' in grid_data and grid_data['rowData']:
                first_row = grid_data['rowData'][0]
                for col_idx, cell in enumerate(first_row.get('values', []), 1):
                    header_value = cell.get('formattedValue', '')
                    processed_data['headers'].append(header_value)

            # Process data rows
            for row_idx, row in enumerate(grid_data.get('rowData', [])[1:], 2):
                row_data = []
                for col_idx, cell in enumerate(row.get('values', []), 1):
                    cell_data = self._process_cell(
                        cell,
                        processed_data['headers'][col_idx-1] if col_idx -
                        1 < len(processed_data['headers']) else None,
                        row_idx,
                        col_idx
                    )
                    row_data.append(cell_data)
                processed_data['data'].append(row_data)

            return processed_data

        except Exception as e:
            logger.error("❌ Failed to get sheet data: %s", str(e))
            return None

    def _process_cell(self, cell: Dict, header: str, row: int, col: int) -> Dict[str, Any]:
        """Process individual cell data and formatting"""
        cell_data = {
            'value': cell.get('formattedValue'),
            'header': header,
            'row': row,
            'column': col,
            'column_letter': self._get_column_letter(col),
            'coordinate': f"{self._get_column_letter(col)}{row}",
            'data_type': self._get_data_type(cell),
            'style': {
                'font': self._extract_font_style(cell),
                'fill': self._extract_fill_style(cell),
                'alignment': self._extract_alignment(cell)
            }
        }

        # Add formula if present
        if 'userEnteredValue' in cell and 'formulaValue' in cell['userEnteredValue']:
            cell_data['formula'] = cell['userEnteredValue']['formulaValue']

        return cell_data

    def _get_data_type(self, cell: Dict) -> str:
        """Determine cell data type"""
        if 'userEnteredValue' in cell:
            value_type = list(cell['userEnteredValue'].keys())[0]
            return {
                'stringValue': 'str',
                'numberValue': 'num',
                'boolValue': 'bool',
                'formulaValue': 'formula',
                'errorValue': 'error'
            }.get(value_type, 'unknown')
        return 'null'

    def _extract_font_style(self, cell: Dict) -> Dict:
        """Extract font styling information"""
        effective_format = cell.get(
            'effectiveFormat', {}).get('textFormat', {})
        return {
            'bold': effective_format.get('bold', False),
            'italic': effective_format.get('italic', False),
            'size': effective_format.get('fontSize', 10),
            'color': effective_format.get('foregroundColor', {}).get('rgbColor', None)
        }

    def _extract_fill_style(self, cell: Dict) -> Dict:
        """Extract cell fill styling information"""
        background = cell.get('effectiveFormat', {}).get('backgroundColor', {})
        return {
            'background_color': background.get('rgbColor', None)
        }

    def _extract_alignment(self, cell: Dict) -> Dict:
        """Extract cell alignment information"""
        effective_format = cell.get('effectiveFormat', {})
        return {
            'horizontal': effective_format.get('horizontalAlignment', 'LEFT').lower(),
            'vertical': effective_format.get('verticalAlignment', 'MIDDLE').lower()
        }

    async def find_tables(self, spreadsheet_id: str, range_name: str) -> List[Dict[str, Any]]:
        """Find tables within the sheet data"""
        sheet_data = await self.get_sheet_data(spreadsheet_id, range_name)
        if not sheet_data:
            return []

        tables = []
        visited_cells = set()

        def get_table(start_row_idx: int, start_col_idx: int) -> Dict[str, Any]:
            """Extract a table starting from given indices"""
            table_data = []
            headers = []

            # Get headers from the first row
            first_row = sheet_data['data'][start_row_idx]
            col_idx = start_col_idx

            while col_idx < len(first_row):
                cell = first_row[col_idx]
                if cell['value'] is not None:
                    visited_cells.add((start_row_idx, col_idx))
                    headers.append(cell['value'])
                else:
                    break
                col_idx += 1

            if not headers:
                return None

            # Process data rows
            row_idx = start_row_idx + 1
            while row_idx < len(sheet_data['data']):
                row = sheet_data['data'][row_idx]
                row_data = []
                empty_row = True
                col_idx = start_col_idx

                while col_idx < len(row) and col_idx - start_col_idx < len(headers):
                    cell = row[col_idx]
                    if cell['value'] is not None:
                        empty_row = False
                        visited_cells.add((row_idx, col_idx))
                        row_data.append(cell)
                    col_idx += 1

                if empty_row:
                    break
                if row_data:
                    table_data.append(row_data)
                row_idx += 1

            if not table_data:
                return None

            return {
                'headers': headers,
                'data': table_data,
                'start_row': start_row_idx + 1,  # 1-based row number
                'start_col': start_col_idx + 1,  # 1-based column number
                'end_row': row_idx,
                'end_col': start_col_idx + len(headers)
            }

        # Find all tables in the sheet
        for row_idx in range(len(sheet_data['data'])):
            for col_idx in range(len(sheet_data['data'][row_idx])):
                if (row_idx, col_idx) not in visited_cells:
                    cell = sheet_data['data'][row_idx][col_idx]
                    if cell['value'] and isinstance(cell['value'], str):
                        table = get_table(row_idx, col_idx)
                        if table:
                            tables.append(table)

        return tables

    async def process_spreadsheet(self, spreadsheet_id: str) -> Dict[str, Any]:
        """Process an entire spreadsheet including all sheets"""
        try:
            # Get spreadsheet metadata
            metadata = await self.get_spreadsheet_metadata(spreadsheet_id)
            if not metadata:
                return None

            processed_sheets = []
            total_tables = 0
            total_rows = 0

            # Process each sheet in the spreadsheet
            for sheet in metadata['sheets']:
                sheet_name = sheet['title']
                # Adjust range as needed
                range_name = f"'{sheet_name}'!A1:Z1000"

                logger.info(f"\nProcessing sheet: {sheet_name}")

                # Get sheet data
                sheet_data = await self.get_sheet_data(spreadsheet_id, range_name)
                if not sheet_data:
                    continue

                # Find tables in the sheet
                tables = await self.find_tables(spreadsheet_id, range_name)

                processed_sheets.append({
                    'name': sheet_name,
                    'headers': sheet_data['headers'],
                    'row_count': len(sheet_data['data']),
                    'tables': tables
                })

                total_tables += len(tables)
                total_rows += len(sheet_data['data'])

            return {
                'metadata': metadata,
                'sheets': processed_sheets,
                'summary': {
                    'total_sheets': len(metadata['sheets']),
                    'total_tables': total_tables,
                    'total_rows': total_rows
                }
            }

        except Exception as e:
            logger.error("❌ Failed to process spreadsheet: %s", str(e))
            return None


async def main():
    """Test function to demonstrate Google Sheets parsing"""
    sheets_test = GoogleSheetsTest()

    # Authenticate
    if not await sheets_test.authenticate():
        logger.error("❌ Authentication failed")
        return

    # List all spreadsheets
    sheets = await sheets_test.list_sheets()
    if not sheets:
        logger.error("❌ No spreadsheets found")
        return

    logger.info("\n📊 Found Spreadsheets:")
    logger.info("=" * 50)

    # Process each spreadsheet
    for sheet in sheets:
        logger.info(f"\nProcessing: {sheet['name']} (ID: {sheet['id']})")
        logger.info("-" * 50)

        result = await sheets_test.process_spreadsheet(sheet['id'])
        if result:
            # Display spreadsheet summary
            logger.info("\n📑 Spreadsheet Summary:")
            logger.info(f"Title: {result['metadata']['title']}")
            logger.info(f"Total Sheets: {result['summary']['total_sheets']}")
            logger.info(f"Total Tables: {result['summary']['total_tables']}")
            logger.info(f"Total Rows: {result['summary']['total_rows']}")

            # Display details for each sheet
            for sheet_data in result['sheets']:
                logger.info(f"\n📋 Sheet: {sheet_data['name']}")
                logger.info(f"  Rows: {sheet_data['row_count']}")
                logger.info(f"  Tables found: {len(sheet_data['tables'])}")

                # Display sample of tables found
                for idx, table in enumerate(sheet_data['tables'], 1):
                    logger.info(f"\n  Table {idx}:")
                    logger.info(f"    Location: {sheets_test._get_column_letter(table['start_col'])}"
                                f"{table['start_row']}:{
                                    sheets_test._get_column_letter(table['end_col'])}"
                                f"{table['end_row']}")
                    logger.info(f"    Headers: {table['headers']}")
                    logger.info(f"    Rows: {len(table['data'])}")

                    # Display sample data (first 2 rows)
                    logger.info("\n    Sample Data:")
                    for row in table['data'][:2]:
                        row_data = {cell['header']: cell['value']
                                    for cell in row}
                        logger.info(f"      {row_data}")
                    if len(table['data']) > 2:
                        logger.info("      ...")

        logger.info("\n" + "=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
