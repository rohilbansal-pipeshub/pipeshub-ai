from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from app.utils.logger import logger
import fitz
from app.config.ai_models_named_constants import OCRProvider


class OCRStrategy(ABC):
    """Abstract base class for OCR strategies"""

    @abstractmethod
    async def process_page(self, page) -> Dict[str, Any]:
        """Process a single page with OCR"""
        pass

    @abstractmethod
    async def load_document(self, content: bytes) -> None:
        """Load document content"""
        pass

    @abstractmethod
    async def extract_text(self) -> Dict[str, Any]:
        """Extract text and layout information"""
        pass

    def needs_ocr(self, page) -> bool:
        """Determine if a page needs OCR processing"""
        try:
            logger.debug("🔍 Checking if page needs OCR")

            # Get page metrics
            text = page.get_text().strip()
            words = page.get_text("words")
            images = page.get_images()
            page_area = page.rect.width * page.rect.height

            # Log detailed image information
            for img_index, img in enumerate(images):
                # img tuple contains: (xref, smask, width, height, bpc, colorspace, ...)
                logger.debug(f"📸 Image {img_index + 1}:")
                logger.debug(f"    Width: {img[2]}, Height: {img[3]}")
                logger.debug(f"    Bits per component: {img[4]}")
                logger.debug(f"    Colorspace: {img[5]}")
                logger.debug(f"    XRef: {img[0]}")

            # Multiple criteria for OCR need
            has_minimal_text = len(text) < 100  # Less than 100 characters
            has_images = len(images) > 0  # Contains images
            text_density = sum((w[2]-w[0])*(w[3]-w[1])
                               for w in words) / page_area if words else 0
            low_density = text_density < 0.01

            logger.debug(f"📊 OCR metrics - Text length: {len(text)}, "
                         f"Images: {len(images)}, "
                         f"Text density: {text_density:.4f}")

            # Extract and save images
            for img_index, img in enumerate(images):
                xref = img[0]
                try:
                    # Create pixmap from image
                    pix = fitz.Pixmap(page.parent, xref)
                    if pix.n - pix.alpha > 3:  # CMYK: convert to RGB
                        pix = fitz.Pixmap(fitz.csRGB, pix)

                    logger.debug(
                        f"📸 Image {img_index + 1} pixel format: {pix.n} channels")
                    # Optionally save the image:
                    # pix.save(f"image_{img_index + 1}.png")

                    pix = None  # Free memory
                except Exception as e:
                    logger.error(f"""❌ Error processing image {
                                 img_index + 1}: {str(e)}""")

            needs_ocr = (has_minimal_text and has_images) or low_density
            logger.debug(f"🔍 OCR need determination: {needs_ocr}")
            return needs_ocr

        except Exception as e:
            logger.error(f"❌ Error checking OCR need: {str(e)}")
            return True


class OCRHandler:
    """Factory and facade for OCR processing"""

    def __init__(self, strategy_type: str, **kwargs):
        """
        Initialize OCR handler with specified strategy

        Args:
            strategy_type: Type of OCR strategy ("pymupdf" or "azure")
            **kwargs: Strategy-specific configuration parameters
        """
        logger.info(
            "🛠️ Initializing OCR handler with strategy: %s", strategy_type)
        self.strategy = self._create_strategy(strategy_type, **kwargs)

    def _create_strategy(self, strategy_type: str, **kwargs) -> OCRStrategy:
        """Factory method to create appropriate OCR strategy"""
        logger.debug(f"🏭 Creating OCR strategy: {strategy_type}")

        if strategy_type == OCRProvider.OCRMYPDF_PROVIDER.value:
            logger.debug("📚 Creating OCRMYPDF OCR strategy")
            from app.modules.parsers.pdf.pymupdf_ocrmypdf_processor import PyMuPDFOCRStrategy
            return PyMuPDFOCRStrategy(
                language=kwargs.get("language", "eng")
            )
        elif strategy_type == OCRProvider.AZURE_PROVIDER.value:
            logger.debug("☁️ Creating Azure OCR strategy")
            from app.modules.parsers.pdf.azure_document_intelligence_processor import AzureOCRStrategy
            return AzureOCRStrategy(
                endpoint=kwargs["endpoint"],
                key=kwargs["key"],
                model_id=kwargs.get("model_id", "prebuilt-document")
            )
        else:
            logger.error(f"❌ Unsupported OCR strategy: {strategy_type}")
            raise ValueError(f"Unsupported OCR strategy: {strategy_type}")

    async def process_document(self, content: bytes) -> Dict[str, Any]:
        """
        Process document using the configured OCR strategy

        Args:
            content: PDF document content as bytes

        Returns:
            Dict containing extracted text and layout information
        """
        logger.info("🚀 Starting document processing")
        try:
            logger.debug("📥 Loading document")
            await self.strategy.load_document(content)

            logger.debug("📊 Extracting text and layout")
            result = await self.strategy.extract_text()

            logger.info("✅ Document processing completed successfully")
            return result
        except Exception as e:
            logger.error(f"❌ Error processing document: {str(e)}")
            raise
