"""
generate_certificates.py
Generates lean certificate PDFs (~680KB each) and WebP preview images (~120KB each).
Run from the repo root: python generate_certificates.py
"""

import json
import os
import io
import fitz          # pymupdf
import qrcode
from PIL import Image


# â”€â”€ Lean base template â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def build_base_template():
    """Strip embedded VectorCraft file and recompress background PNG â†’ JPEG q75.
    Returns base PDF as bytes (~330KB) used as the starting point for each cert."""
    src = fitz.open('CERTIFICATE.pdf')

    # 1. Remove all embedded files (the 4.9MB VectorCraft blob)
    for name in list(src.embfile_names()):
        src.embfile_del(name)

    # 2. Replace xref 25 (11MB uncompressed PNG background) with JPEG q75
    try:
        img_info = src.extract_image(25)
        im = Image.open(io.BytesIO(img_info['image'])).convert('RGB')
        buf = io.BytesIO()
        im.save(buf, format='JPEG', quality=75, optimize=True)
        src[0].replace_image(25, stream=buf.getvalue())
    except Exception as e:
        print(f"  [warn] Could not recompress background image: {e}")

    base_bytes = src.tobytes(deflate=True, garbage=4, clean=True)
    src.close()
    print(f"Base template: {len(base_bytes) // 1024} KB")
    return base_bytes


# â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def generate():
    with open('data/certificates.json', 'r', encoding='utf-8') as f:
        certs = json.load(f)

    os.makedirs('public/certificates/pdf', exist_ok=True)
    os.makedirs('public/certificates/img', exist_ok=True)

    font_vivaldi       = 'C:/Windows/Fonts/VIVALDII.TTF'
    font_bookman       = 'C:/Windows/Fonts/BOOKOS.TTF'
    font_bookman_bold  = 'C:/Windows/Fonts/BOOKOSB.TTF'
    font_bookman_italic= 'C:/Windows/Fonts/BOOKOSI.TTF'

    print("Building lean base templateâ€¦")
    base_bytes = build_base_template()

    all_pdf = fitz.open()   # combined collection

    for idx, c in enumerate(certs):
        slug = c['slug']
        name = c['name']
        desc = c['description']
        url  = f"https://u19ce.pages.dev/certificates/{slug}"

        print(f"[{idx+1}/{len(certs)}] {name}")

        # Open fresh copy of the lean base for every certificate
        doc  = fitz.open(stream=base_bytes, filetype='pdf')
        page = doc[0]

        # â”€â”€ 1. Redact placeholders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        for b in page.get_text('blocks'):
            text = b[4]
            if ('Name Surname Othernames' in text
                    or 'lorem ipsum' in text
                    or 'jndjdn' in text):
                page.add_redact_annot(fitz.Rect(b[:4]))
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

        # â”€â”€ 2. Load fonts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        page.insert_font(fontname='Vivaldi',      fontfile=font_vivaldi)
        page.insert_font(fontname='Bookman',      fontfile=font_bookman)
        page.insert_font(fontname='BookmanBold',  fontfile=font_bookman_bold)
        page.insert_font(fontname='BookmanItalic',fontfile=font_bookman_italic)

        # â”€â”€ 3. Name (auto-scaled, Vivaldi) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        name_rect = fitz.Rect(300, 825, 2164, 985)
        for fs in range(105, 59, -2):
            if page.insert_textbox(name_rect, name,
                                   fontname='Vivaldi', fontsize=fs,
                                   color=(0, 0, 0),
                                   align=fitz.TEXT_ALIGN_CENTER) > 0:
                break

        # â”€â”€ 4. Description (auto-scaled, Bookman) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        desc_rect = fitz.Rect(480, 1025, 1984, 1285)
        for fs in range(40, 27, -1):
            if page.insert_textbox(desc_rect, desc,
                                   fontname='Bookman', fontsize=fs,
                                   color=(0.12, 0.12, 0.12),
                                   align=fitz.TEXT_ALIGN_CENTER) > 0:
                break

        # â”€â”€ 5. QR Code â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        qr = qrcode.QRCode(version=None,
                           error_correction=qrcode.constants.ERROR_CORRECT_M,
                           box_size=10, border=1)
        qr.add_data(url)
        qr.make(fit=True)
        qr_img   = qr.make_image(fill_color="black", back_color="white")
        qr_bytes = io.BytesIO()
        qr_img.save(qr_bytes, format='PNG')

        qr_box = fitz.Rect(1392, 1373, 1607, 1588)
        page.insert_image(qr_box, stream=qr_bytes.getvalue())

        # â”€â”€ 6. "VERIFY CERTIFICATE" label + short URL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        page.insert_textbox(
            fitz.Rect(1300, 1340, 1700, 1365),
            "VERIFY CERTIFICATE",
            fontname='BookmanBold', fontsize=17,
            color=(0.08, 0.42, 0.38),
            align=fitz.TEXT_ALIGN_CENTER
        )
        page.insert_textbox(
            fitz.Rect(1100, 1598, 1900, 1626),
            f"u19ce.pages.dev/certificates/{slug}",
            fontname='BookmanItalic', fontsize=18,
            color=(0.2, 0.2, 0.2),
            align=fitz.TEXT_ALIGN_CENTER
        )

        # Clickable link annotation covering the QR zone
        page.insert_link({'kind': fitz.LINK_URI,
                          'from': fitz.Rect(1387, 1340, 1612, 1626),
                          'uri': url})

        # â”€â”€ 7. Save PDF (lean) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        pdf_bytes = doc.tobytes(deflate=True, garbage=4, clean=True)
        pdf_path  = f"public/certificates/pdf/{slug}.pdf"
        with open(pdf_path, 'wb') as fh:
            fh.write(pdf_bytes)
        print(f"   PDF: {len(pdf_bytes) // 1024} KB -> {pdf_path}")

        # â”€â”€ 8. WebP preview image (72 dpi, max 1600 px wide, q75) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        pix = page.get_pixmap(dpi=72)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        if img.width > 1600:
            ratio = 1600 / img.width
            img   = img.resize((1600, int(img.height * ratio)), Image.LANCZOS)
        webp_buf  = io.BytesIO()
        img.save(webp_buf, format='WEBP', quality=75, optimize=True)
        webp_bytes = webp_buf.getvalue()
        img_path   = f"public/certificates/img/{slug}.webp"
        with open(img_path, 'wb') as fh:
            fh.write(webp_bytes)
        print(f"   IMG: {len(webp_bytes) // 1024} KB â†’ {img_path}")

        # Add to combined collection
        all_pdf.insert_pdf(fitz.open(stream=pdf_bytes, filetype='pdf'))
        doc.close()

    # â”€â”€ Combined PDF â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    all_path = "public/certificates/pdf/all-certificates-2024.pdf"
    all_pdf.save(all_path, deflate=True, garbage=4, clean=True)
    all_pdf.close()
    print(f"\nDone â€” {len(certs)} certificates generated.")
    print(f"Collection: {os.path.getsize(all_path) // 1024} KB â†’ {all_path}")


if __name__ == '__main__':
    generate()

