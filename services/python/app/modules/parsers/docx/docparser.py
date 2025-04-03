import subprocess
import os
import tempfile
import shutil


class DocParser:
    """Parser for Microsoft Word .doc and .docx files"""

    def __init__(self):
        pass

    def convert_doc_to_docx(self, binary: str) -> str:
        """Convert .doc file to .docx using LibreOffice"""
        try:
            # Check if LibreOffice is installed
            subprocess.run(['which', 'libreoffice'], check=True)

            # Create temporary directory
            temp_dir = tempfile.mkdtemp()

            # Convert .doc to .docx using LibreOffice
            subprocess.run([
                'libreoffice',
                '--headless',
                '--convert-to', 'docx',
                '--outdir', temp_dir,
                binary
            ], check=True, capture_output=True)

            # Get the docx file path
            docx_file = os.path.join(temp_dir, os.path.basename(
                binary).rsplit('.', 1)[0] + '.docx')

            if not os.path.exists(docx_file):
                raise Exception("DOCX conversion failed")

            return docx_file

        except subprocess.CalledProcessError:
            print("Error: 'libreoffice' is not installed. Please install it using:")
            print("sudo apt-get install libreoffice")
            raise
        except Exception as e:
            print(f"Error converting .doc to .docx: {e}")
            if 'temp_dir' in locals():
                shutil.rmtree(temp_dir)
            raise
