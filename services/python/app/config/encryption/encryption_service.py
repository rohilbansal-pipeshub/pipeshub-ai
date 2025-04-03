import os
import logging
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Custom error classes matching the Node.js implementation
class EncryptionError(Exception):
    def __init__(self, message, detail=None):
        super().__init__(f"{message}: {detail}" if detail else message)

class DecryptionError(Exception):
    def __init__(self, message, detail=None):
        super().__init__(f"{message}: {detail}" if detail else message)

class InvalidKeyFormatError(Exception):
    def __init__(self, message):
        super().__init__(message)

# Setup logger to mimic Logger service in Node.js
logger = logging.getLogger("Encryption Service")
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)


class EncryptionService:
    _instance = None

    def __init__(self, algorithm: str, secret_key: str):
        # In this example, algorithm should be "aes-256-gcm"
        self.algorithm = algorithm
        self.secret_key = secret_key  # this is a hex string

    @classmethod
    def get_instance(cls, algorithm: str, secret_key: str):
        if cls._instance is None:
            cls._instance = EncryptionService(algorithm, secret_key)
        return cls._instance

    def encrypt(self, text: str) -> str:
        try:
            # Recommended IV length for GCM is 12 bytes
            iv = os.urandom(12)
            key = bytes.fromhex(self.secret_key)
            aesgcm = AESGCM(key)
            # Encrypt returns ciphertext with the tag appended (last 16 bytes)
            encrypted = aesgcm.encrypt(iv, text.encode('utf-8'), None)
            # Split ciphertext and auth tag
            ciphertext = encrypted[:-16]
            auth_tag = encrypted[-16:]
            # Return the encrypted string as "iv:ciphertext:authTag"
            return f"{iv.hex()}:{ciphertext.hex()}:{auth_tag.hex()}"
        except Exception as e:
            logger.error("Encryption failed", exc_info=True)
            raise EncryptionError("Encryption failed", str(e))

    def decrypt(self, encrypted_text: str) -> str:
        if encrypted_text is None:
            raise DecryptionError("Decryption failed, encrypted text is None")
        try:
            # For AES-256-GCM, expect format "iv:ciphertext:authTag"
            parts = encrypted_text.split(':')
            if len(parts) != 3:
                raise InvalidKeyFormatError("Invalid encrypted text format; expected format iv:ciphertext:authTag")
            iv_hex, ciphertext_hex, auth_tag_hex = parts
            iv = bytes.fromhex(iv_hex)
            ciphertext = bytes.fromhex(ciphertext_hex)
            auth_tag = bytes.fromhex(auth_tag_hex)
            key = bytes.fromhex(self.secret_key)
            # Recombine ciphertext and auth tag as expected by AESGCM.decrypt
            combined = ciphertext + auth_tag
            aesgcm = AESGCM(key)
            decrypted = aesgcm.decrypt(iv, combined, None)
            return decrypted.decode('utf-8')
        except Exception as e:
            logger.error("Decryption failed", exc_info=True)
            raise DecryptionError("Decryption failed, could be due to different encryption algorithm or secret key", str(e))


# Example usage:
if __name__ == "__main__":
    # Replace these with your actual values.
    secret_key = "89f6d3a5a0ab94d2d8d0b13cac3fe3c94a6c234bd5016f33ef83829f87f6c44f"
    service = EncryptionService.get_instance("aes-256-gcm", secret_key)

    # Decrypt the message back
    try:
        encrypted ="d382ed8f6de8b70f15c43ef7:5a1a55339cf99d8d131de0d5adbd4965502b9e453e12173cada3035088b33b0d1e5356a02e17196e5a23d38912ba42f9:efbfd5da52be08ff6712853d2589a532" 
        decrypted = service.decrypt(encrypted)
        print("Decrypted:", decrypted)
    except Exception as error:
        print(error)
