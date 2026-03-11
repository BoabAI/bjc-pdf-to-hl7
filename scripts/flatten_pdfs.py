#!/usr/bin/env python3
"""
Flatten mock referral PDFs by removing original patient text that overlaps
with the fictional overlay text.

Strategy: Use pymupdf (fitz) to identify text spans by font. The overlay uses
'Helvetica' (from reportlab), while original text uses document-specific fonts
(TimesNewRoman, Arial, etc.). We redact original-font text spans that fall
within annotation rectangles, preserving only the Helvetica overlay text.

Usage:
    source .venv/bin/activate
    python flatten_pdfs.py

Requires: pymupdf (fitz)
"""

import os
import fitz  # pymupdf


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# The overlay font used by unredact_pdfs.py (reportlab)
OVERLAY_FONT = "Helvetica"

# Annotation rectangles per file/page - areas where patient data lives.
# Text spans with non-Helvetica fonts inside these rects get removed.
# Format: { filename: { page_idx: [(x1, y1, x2, y2), ...] } }
ANNOTATION_RECTS = {
    "mock_referral1.pdf": {
        0: [
            (124.2, 478.4, 208.8, 489.2),   # 1st Name, Last Name
            (239.4, 476.6, 297.0, 487.4),   # DOB
            (145.8, 462.2, 228.6, 473.0),   # Address
            (235.8, 462.2, 284.4, 471.2),   # Suburb
            (316.8, 464.0, 352.8, 473.0),   # Postcode
            (180.0, 446.0, 248.4, 458.6),   # Mobile
            (190.8, 433.4, 232.2, 444.2),   # Claim No
            (230.3, 408.2, 253.8, 420.8),   # Name body 1
            (223.2, 354.2, 246.6, 365.0),   # Name body 2
            (226.8, 206.6, 250.2, 215.6),   # name (bottom)
        ],
        1: [
            (82.8, 525.2, 349.2, 534.2),    # Text3 (cc: line)
            (311.4, 725.0, 338.4, 734.0),   # Text4
        ],
    },
    "mock_referral2.pdf": {
        0: [
            (93.6, 519.7, 108.0, 530.5),    # title
            (109.8, 519.7, 234.0, 530.5),   # 1st Name Last Name
            (93.6, 508.9, 145.8, 519.7),    # DOB
            (93.6, 496.3, 163.8, 507.1),    # M/C Card Number
            (93.6, 487.3, 178.2, 496.3),    # Address
            (93.6, 474.7, 160.2, 485.5),    # Suburb
            (165.6, 474.7, 201.6, 485.5),   # postcode
            (91.8, 451.3, 153.0, 462.1),    # Mobile
            (144.0, 381.1, 216.0, 391.9),   # Full Name (body)
        ],
    },
    "mock_referral3.pdf": {
        0: [
            (163.8, 582.7, 246.6, 593.5),   # Full Name
            (275.4, 582.7, 329.4, 593.5),   # Text2 (DOB)
            (129.6, 570.1, 261.0, 580.9),   # Address
            (129.6, 557.5, 210.6, 570.1),   # Suburb Postcode
            (192.6, 546.7, 352.8, 559.3),   # Text5 (Medicare)
            (154.8, 534.1, 219.6, 544.9),   # Text6 (Mob)
            (151.2, 476.5, 169.2, 490.9),   # Name (body)
        ],
    },
    "mock_referral4.pdf": {
        0: [
            (84.6, 584.6, 163.8, 597.2),    # Name
            (84.6, 573.8, 192.6, 584.6),    # Address
            (84.6, 563.0, 158.4, 573.8),    # suburb
            (160.2, 563.0, 190.8, 573.8),   # pcode
            (118.8, 548.6, 167.4, 561.2),   # Text5 (DOB)
            (86.4, 534.2, 144.0, 548.6),    # mobile
            (140.4, 510.8, 198.0, 523.4),   # full name (body)
            (230.4, 336.2, 262.8, 350.6),   # Text8 (body)
        ],
    },
    "mock_referral5.pdf": {
        0: [
            (91.8, 494.5, 172.8, 503.5),    # 1st Name Last Name
            (212.4, 494.5, 266.4, 503.5),   # DOB
            (91.8, 481.9, 180.0, 492.7),    # Street Address
            (185.4, 481.9, 239.4, 490.9),   # STATE
            (246.6, 481.9, 268.2, 490.9),   # PCODE
            (273.6, 481.9, 336.6, 490.9),   # Mobile number
            (169.2, 453.1, 230.4, 463.9),   # Full Name (body)
        ],
    },
}


def span_overlaps_rects(span_bbox, rects, margin=3):
    """Check if a text span's bounding box overlaps any annotation rectangle."""
    sx1, sy1, sx2, sy2 = span_bbox
    for (rx1, ry1, rx2, ry2) in rects:
        # Check overlap with margin
        if (sx1 < rx2 + margin and sx2 > rx1 - margin and
                sy1 < ry2 + margin and sy2 > ry1 - margin):
            return True
    return False


def flatten_page(page, rects):
    """
    Remove non-overlay text spans that overlap with annotation rectangles.

    Uses pymupdf's redaction API to surgically remove original patient text
    while preserving the Helvetica overlay text.

    Note: ANNOTATION_RECTS use pypdf coordinates (origin at bottom-left),
    but pymupdf uses top-left origin. We flip the y-coordinates here.
    """
    page_height = page.rect.height

    # Convert rects from pypdf coords (bottom-left origin) to pymupdf (top-left)
    flipped_rects = []
    for (rx1, ry1, rx2, ry2) in rects:
        new_y1 = page_height - ry2  # old top -> new top
        new_y2 = page_height - ry1  # old bottom -> new bottom
        flipped_rects.append((rx1, new_y1, rx2, new_y2))

    # Get all text spans with font and position info
    td = page.get_text("dict")
    redact_rects = []

    for block in td["blocks"]:
        if "lines" not in block:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                font = span["font"]
                text = span.get("text", "").strip()
                bbox = span["bbox"]

                if not text:
                    continue

                # Skip overlay text (Helvetica from reportlab)
                if font == OVERLAY_FONT:
                    continue

                # Check if this non-overlay span overlaps an annotation rect
                if span_overlaps_rects(bbox, flipped_rects):
                    redact_rects.append((fitz.Rect(bbox), text, font))

    if not redact_rects:
        return 0

    # Add redaction annotations for each identified span
    for rect, text, font in redact_rects:
        # Add redaction with white fill (matching the overlay background)
        page.add_redact_annot(rect, fill=(1, 1, 1))

    # Apply all redactions - this removes the text content
    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

    return len(redact_rects)


def process_pdf(filename):
    """Process a single mock PDF."""
    filepath = os.path.join(SCRIPT_DIR, filename)
    if not os.path.exists(filepath):
        print(f"  Skipping: not found")
        return

    rects_by_page = ANNOTATION_RECTS.get(filename, {})
    if not rects_by_page:
        print(f"  Skipping: no annotation rects defined")
        return

    doc = fitz.open(filepath)
    total_removed = 0

    for page_idx in range(len(doc)):
        rects = rects_by_page.get(page_idx)
        if not rects:
            print(f"  Page {page_idx}: no annotations, skipped")
            continue

        page = doc[page_idx]
        removed = flatten_page(page, rects)
        total_removed += removed
        if removed:
            print(f"  Page {page_idx}: removed {removed} original text spans")
        else:
            print(f"  Page {page_idx}: no overlapping original text found")

    if total_removed > 0:
        # pymupdf can't save non-incrementally to the same file,
        # so save to a temp file then replace the original
        tmp_path = filepath + ".tmp"
        doc.save(tmp_path, incremental=False, deflate=True, garbage=4)
        doc.close()
        os.replace(tmp_path, filepath)
        final_size = os.path.getsize(filepath)
        print(f"  Saved: {final_size:,} bytes ({total_removed} spans removed)")
    else:
        print(f"  No changes needed")
        doc.close()


def main():
    print("=" * 60)
    print("Flattening mock PDFs (removing original patient text)")
    print("=" * 60)

    mock_files = [
        "mock_referral1.pdf",
        "mock_referral2.pdf",
        "mock_referral3.pdf",
        "mock_referral4.pdf",
        "mock_referral5.pdf",
    ]

    for filename in mock_files:
        print(f"\nProcessing: {filename}")
        process_pdf(filename)

    print("\n" + "=" * 60)
    print("Done.")
    print("=" * 60)


if __name__ == "__main__":
    main()
