from docling.document_converter import DocumentConverter
from docling.datamodel.base_models import DocumentStream
from io import BytesIO

class DocxParser:
    def __init__(self):
        self.text_content = None
        self.metadata = None

    def parse(self, file_binary):
        # Ensure file_binary is a bytes-like object
        print(type(file_binary))
        # Create a DocumentStream directly from the bytes
        source = DocumentStream(name="content.docx", stream=file_binary)

        converter = DocumentConverter()
        doc = converter.convert(source)
        print(doc.document)
        
        return doc.document
    
def main():
    # Path to the DOCX file
    file_path = '/home/rohil/Volume-b/Downloads/Documents/doc.docx'
    
    # Create a DocxParser instance
    parser = DocxParser(file_path)
    
    # Parse the DOCX file
    parser.parse()
    
if __name__ == "__main__":
    main()
