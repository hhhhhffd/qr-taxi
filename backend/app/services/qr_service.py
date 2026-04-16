"""QR service — generate QR code PNGs for location slugs."""

import io
import logging
from pathlib import Path

import qrcode
import qrcode.constants

logger = logging.getLogger(__name__)

_QR_DIR = Path("/app/static/qr")


def generate_qr(slug: str, domain: str) -> bytes:
    """Generate a QR code PNG for a location slug and save it to disk.

    Creates a QR code pointing to the platform router ``/go/{slug}``.  The
    router detects the scanner's platform (WeChat, Telegram, browser) and
    redirects accordingly.  Saves the PNG to ``/app/static/qr/{slug}.png``
    and returns the raw PNG bytes so the caller can stream them immediately.

    Args:
        slug: Location slug.
        domain: Public domain of the service (e.g. ``aparu.kz``).

    Returns:
        Raw PNG bytes of the generated QR code image.
    """
    url = f"https://{domain}/go/{slug}"

    qr: qrcode.QRCode = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    # Persist to disk so the static file server can serve it later
    _QR_DIR.mkdir(parents=True, exist_ok=True)
    img_path = _QR_DIR / f"{slug}.png"
    img.save(str(img_path))
    logger.info("QR code saved: %s → %s", url, img_path)

    # Return raw PNG bytes for immediate streaming
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()
