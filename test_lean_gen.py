import fitz
import qrcode
import io
import os
from PIL import Image

# 1. Prepare base template with compressed background and no embedded files
doc = fitz.open('CERTIFICATE.pdf')

# Remove embedded files (e.g. 5MB vectorcraft project)
for name in list(doc.embfile_names()):
    doc.embfile_del(name)

# Compress background image (xref 25)
img_bytes = doc.extract_image(25)['image']
im = Image.open(io.BytesIO(img_bytes)).convert('RGB')
buf = io.BytesIO()
im.save(buf, format='JPEG', quality=75, optimize=True)
doc[0].replace_image(25, stream=buf.getvalue())

# Save clean lightweight base template
base_bytes = doc.tobytes(deflate=True, garbage=4, clean=True)
doc.close()
print("Clean base template size in KB:", len(base_bytes) / 1024)

# Test generating one certificate from base_bytes
doc2 = fitz.open(stream=base_bytes, filetype="pdf")
page = doc2[0]

# Redact placeholders
for b in page.get_text('blocks'):
    text = b[4]
    if 'Name Surname Othernames' in text or 'lorem ipsum' in text or 'jndjdn' in text:
        page.add_redact_annot(fitz.Rect(b[:4]))
page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

# Fonts
page.insert_font(fontname='Vivaldi', fontfile='C:/Windows/Fonts/VIVALDII.TTF')
page.insert_font(fontname='Bookman', fontfile='C:/Windows/Fonts/BOOKOS.TTF')
page.insert_font(fontname='BookmanBold', fontfile='C:/Windows/Fonts/BOOKOSB.TTF')
page.insert_font(fontname='BookmanItalic', fontfile='C:/Windows/Fonts/BOOKOSI.TTF')

# Name
page.insert_textbox(
    fitz.Rect(300, 825, 2164, 985),
    "Hayatu Umar Yahaya",
    fontname='Vivaldi',
    fontsize=105,
    color=(0, 0, 0),
    align=fitz.TEXT_ALIGN_CENTER
)

# Desc
page.insert_textbox(
    fitz.Rect(480, 1025, 1984, 1285),
    ("Presented to Hayatu Umar Yahaya in recognition of your outstanding leadership, "
     "vision and unwavering dedication as Chairman of the FYB Committee. You led with "
     "wisdom, sacrifice and exemplary commitment, coordinating the affairs of the final "
     "year with excellence and ensuring our set had a memorable and successful final year."),
    fontname='Bookman',
    fontsize=38,
    color=(0.12, 0.12, 0.12),
    align=fitz.TEXT_ALIGN_CENTER
)

# QR Code
qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=1)
qr.add_data("https://u19ce.pages.dev/certificates/hayatu-umar-yahaya")
qr.make(fit=True)
qr_img = qr.make_image(fill_color="black", back_color="white")
qr_buf = io.BytesIO()
qr_img.save(qr_buf, format='PNG')
page.insert_image(fitz.Rect(1392, 1373, 1607, 1588), stream=qr_buf.getvalue())

# Text around QR
page.insert_textbox(fitz.Rect(1300, 1340, 1700, 1365), "VERIFY CERTIFICATE", fontname='BookmanBold', fontsize=17, color=(0.08, 0.42, 0.38), align=fitz.TEXT_ALIGN_CENTER)
page.insert_textbox(fitz.Rect(1100, 1598, 1900, 1626), "u19ce.pages.dev/certificates/hayatu-umar-yahaya", fontname='BookmanItalic', fontsize=18, color=(0.2, 0.2, 0.2), align=fitz.TEXT_ALIGN_CENTER)

out_pdf = doc2.tobytes(deflate=True, garbage=4, clean=True)
print("Final individual PDF size in KB:", len(out_pdf) / 1024)

# Web image test
pix = page.get_pixmap(dpi=72)
im_web = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
im_web.thumbnail((1600, 1200))
buf_web = io.BytesIO()
im_web.save(buf_web, format='WEBP', quality=75)
print("Final WebP image size in KB:", len(buf_web.getvalue()) / 1024)

