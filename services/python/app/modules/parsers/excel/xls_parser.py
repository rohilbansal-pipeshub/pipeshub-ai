import subprocess
import os
import tempfile
import shutil


class XLSParser:
    """Parser for Microsoft Excel .xls files"""

    def __init__(self):
        pass

    def convert_xls_to_xlsx(self, binary: bytes) -> bytes:
        """
        Convert .xls file to .xlsx using LibreOffice and return the xlsx binary content
        
        Args:
            binary (bytes): The binary content of the XLS file
            
        Returns:
            bytes: The binary content of the converted XLSX file
        """
        temp_dir = None
        try:
            # Check if LibreOffice is installed
            subprocess.run(['which', 'libreoffice'], check=True)

            # Create temporary directory and input file
            temp_dir = tempfile.mkdtemp()
            temp_input = os.path.join(temp_dir, 'input.xls')
            
            # Write binary data to temporary file
            with open(temp_input, 'wb') as f:
                f.write(binary)

            # Convert .xls to .xlsx using LibreOffice
            subprocess.run([
                'libreoffice',
                '--headless',
                '--convert-to', 'xlsx',
                '--outdir', temp_dir,
                temp_input
            ], check=True, capture_output=True)

            # Get the xlsx file path
            xlsx_file = os.path.join(temp_dir, 'input.xlsx')

            if not os.path.exists(xlsx_file):
                raise Exception("XLSX conversion failed")

            # Read the converted file as binary
            with open(xlsx_file, 'rb') as f:
                xlsx_binary = f.read()

            return xlsx_binary

        except subprocess.CalledProcessError:
            print("Error: 'libreoffice' is not installed. Please install it using:")
            print("sudo apt-get install libreoffice")
            raise
        except Exception as e:
            print(f"Error converting .xls to .xlsx: {e}")
            raise
        finally:
            # Clean up temporary directory
            if temp_dir and os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
