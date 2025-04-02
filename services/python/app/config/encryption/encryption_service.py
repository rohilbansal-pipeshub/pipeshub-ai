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
        encrypted = "111f6e3706bc5c46f0abdd79:b2825cb33a34c872b6b6bf4fabbc9be125b2c5da712bd9343b55aaed24ac7b15a203599270fd8940135753ba5da38b8dcd731bc1855328ce158f8d3781540e451c06e6a0cf06188be6a5351d5bd91c4ca97632ad853b5fbd98466d1964cf2ecfeb4e8859b6b9853bc8c112b05c8b28e9b81cce1fe4d8226fcfab66f45cb00c650162998af189d6a185a3d2b19ce8037effac50359b3f9d78fff3f7688c25bc386d2dfedcab39188965a83e142a21dfa7164a78325321e1e418093226d910d427908a9cf7b3bc2b1d3a9151ac4008234d5ddf59f4baf126c4ff6d4a582801f6bf8ecf490e2ac2a7da7ac29b65b2c9d9d6c73b4a3d6be86b1a4ddf0aebb43e7ed95bc902:9978472c487e066ae9c239c5864582cb"
        decrypted = service.decrypt(encrypted)
        print("Decrypted:", decrypted)
    except Exception as error:
        print(error)
