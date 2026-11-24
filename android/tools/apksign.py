"""Sign an APK with v1 (JAR, via the JDK's jarsigner) and v2 (APK Signature Scheme v2,
implemented here from the spec: source.android.com/docs/security/features/apksigning/v2).
No Android SDK needed. Verify the result with: apksigtool verify / androguard.

usage: python3 apksign.py keygen <keydir>
       python3 apksign.py sign <keydir> <in.apk> <out.apk>
"""
import hashlib, os, struct, subprocess, sys, tempfile, datetime, secrets
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives.serialization import pkcs12

HERE = os.path.dirname(os.path.abspath(__file__))
ALIAS = "wdhub"
SIG_RSA_PKCS1_SHA256 = 0x0103
V2_BLOCK_ID = 0x7109871A
CHUNK = 1 << 20


# ---------------------------------------------------------------- keys
def keygen(d):
    os.makedirs(d, exist_ok=True)
    if os.path.exists(os.path.join(d, "keystore.p12")):
        print("key already exists in", d, "- keeping it (updates must use the same key)")
        return
    key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Working Dead Hub"), x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Working Dead Revival")])
    now = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now)
            .not_valid_after(now + datetime.timedelta(days=365 * 40)).sign(key, hashes.SHA256()))
    pw = secrets.token_urlsafe(18)
    open(os.path.join(d, "password.txt"), "w").write(pw + "\n")
    open(os.path.join(d, "keystore.p12"), "wb").write(pkcs12.serialize_key_and_certificates(
        ALIAS.encode(), key, cert, None, serialization.BestAvailableEncryption(pw.encode())))
    fp = hashlib.sha256(cert.public_bytes(serialization.Encoding.DER)).hexdigest()
    open(os.path.join(d, "FINGERPRINT.txt"), "w").write(fp + "\n")
    print("new signing key:", d, "\nSHA-256 cert fingerprint:", fp)


def load(d):
    pw = open(os.path.join(d, "password.txt")).read().strip()
    key, cert, _ = pkcs12.load_key_and_certificates(open(os.path.join(d, "keystore.p12"), "rb").read(), pw.encode())
    return key, cert, pw


# ---------------------------------------------------------------- zip structure
def find_eocd(data):
    i = data.rfind(b"PK\x05\x06", max(0, len(data) - 65557))
    assert i >= 0, "no end of central directory"
    cd_size, cd_off = struct.unpack_from("<II", data, i + 12)
    return i, cd_off, cd_size


def lp(b):  # length-prefixed (uint32 LE)
    return struct.pack("<I", len(b)) + b


def chunked_digest(sections):
    digests = []
    for sec in sections:
        for o in range(0, len(sec), CHUNK):
            c = sec[o:o + CHUNK]
            digests.append(hashlib.sha256(b"\xa5" + struct.pack("<I", len(c)) + c).digest())
    return hashlib.sha256(b"\x5a" + struct.pack("<I", len(digests)) + b"".join(digests)).digest()


def v2_sign(data, key, cert):
    eocd, cd_off, cd_size = find_eocd(data)
    assert data[cd_off - 16:cd_off] != b"APK Sig Block 42", "already has a signing block"
    contents, cd, eocd_b = data[:cd_off], data[cd_off:cd_off + cd_size], data[eocd:]
    digest = chunked_digest([contents, cd, eocd_b])  # EOCD's CD offset already equals the block's position

    cert_der = cert.public_bytes(serialization.Encoding.DER)
    signed_data = (lp(lp(struct.pack("<I", SIG_RSA_PKCS1_SHA256) + lp(digest)))   # digests
                   + lp(lp(cert_der))                                           # certificates
                   + lp(b""))                                                   # additional attributes
    sig = key.sign(signed_data, padding.PKCS1v15(), hashes.SHA256())
    pub = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    signer = lp(signed_data) + lp(lp(struct.pack("<I", SIG_RSA_PKCS1_SHA256) + lp(sig))) + lp(pub)
    value = lp(lp(signer))
    pair = struct.pack("<Q", 4 + len(value)) + struct.pack("<I", V2_BLOCK_ID) + value
    size = len(pair) + 8 + 16
    block = struct.pack("<Q", size) + pair + struct.pack("<Q", size) + b"APK Sig Block 42"

    new_eocd = bytearray(eocd_b)
    struct.pack_into("<I", new_eocd, 16, cd_off + len(block))
    return contents + block + cd + bytes(new_eocd)


def sign(d, src, out):
    key, cert, pw = load(d)
    with tempfile.TemporaryDirectory() as t:
        v1 = os.path.join(t, "v1.apk")
        subprocess.run(["jarsigner", "-J-Duser.language=en", "-keystore", os.path.join(d, "keystore.p12"), "-storetype", "PKCS12",
                        "-storepass:env", "WD_PW", "-digestalg", "SHA-256", "-sigalg", "SHA256withRSA",
                        "-signedjar", v1, src, ALIAS], check=True, env={**os.environ, "WD_PW": pw}, stdout=subprocess.DEVNULL)
        aligned = os.path.join(t, "aligned.apk")
        subprocess.run([sys.executable, "-I", os.path.join(HERE, "zipalign.py"), "--realign", v1, aligned], check=True, stdout=subprocess.DEVNULL)
        data = open(aligned, "rb").read()
    open(out, "wb").write(v2_sign(data, key, cert))
    print("signed (v1 + v2):", out)


if __name__ == "__main__":
    {"keygen": lambda: keygen(sys.argv[2]), "sign": lambda: sign(*sys.argv[2:5])}[sys.argv[1]]()
