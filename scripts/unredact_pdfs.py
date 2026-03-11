#!/usr/bin/env python3
"""
Takes the 5 redacted PDFs from ../redacted/ and creates mock versions with
fictional patient data replacing the black redaction boxes (form field widgets).

Approach (all pymupdf, single content stream):
1. Open with pymupdf
2. Remove Widget annotations (the redaction boxes)
3. Redact original text in annotation areas (white fill)
4. Insert fictional text as COMPLETE LINES (label + value) so pdf-parse
   extracts them as coherent lines matching the parser's regex patterns
5. Rebuild each modified page as image + invisible text layer so pdf-parse
   extracts text in positional (visual) order

Usage:
    source .venv/bin/activate
    python unredact_pdfs.py

Requires: pymupdf (fitz)
"""

import os

import fitz  # pymupdf


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REDACTED_DIR = os.path.join(SCRIPT_DIR, "..", "redacted")
OUTPUT_DIR = SCRIPT_DIR


# ---------------------------------------------------------------------------
# Per-file configuration
# ---------------------------------------------------------------------------
# Each file defines:
#   header_redact_pypdf: (x1, y1, x2, y2) in pypdf coords for the header
#                        block to redact (covers labels + values)
#   header_lines: list of (text, x, y_pypdf, fontsize) for complete lines
#                 to insert in the header area. x and y are in pypdf coords.
#   body_redacts: list of (x1, y1, x2, y2) in pypdf coords for body text
#                 areas to redact (individual name mentions in paragraphs)
#   body_lines: list of (text, x, y_pypdf, fontsize) for body text insertions
# ---------------------------------------------------------------------------

FILES = {
    "Referral_example.pdf": {
        "output": "mock_referral1.pdf",
        "pages": {
            0: {
                # Header block: covers RE: line through Claim No: line
                # Extends left to cover "RE:", "Mobile:", "Claim No:" labels
                "header_redact_pypdf": (70, 425, 555, 497),
                "header_lines": [
                    ("RE: James MITCHELL - DOB: 18/09/1978", 82, 484, 9),
                    ("72 Greenfield Dr, TAHMOOR, NSW, 2573", 82, 470, 9),
                    ("Mobile: 0451 223 891", 82, 456, 9),
                    ("Claim No: 9127834", 82, 442, 9),
                ],
                # Body: patient first name in 3 locations
                "body_redacts": [
                    (222, 404, 260, 425),   # "Name" body 1 (after "care of")
                    (216, 350, 254, 369),   # "Name" body 2 (after "catch up with")
                    (220, 202, 258, 220),   # "name" bottom of page
                ],
                "body_lines": [
                    ("James", 231, 413, 9),
                    ("James", 224, 359, 9),
                    ("James", 228, 211, 9),
                ],
            },
            1: {
                "header_redact_pypdf": None,
                "header_lines": [],
                # cc: line and body name
                "body_redacts": [
                    (75, 521, 555, 538),    # cc: patient line
                    (303, 721, 345, 738),   # "neither is [name]"
                ],
                "body_lines": [
                    ("cc: Mr James Mitchell, 72 Greenfield Dr, TAHMOOR NSW 2573", 83, 530, 8),
                    ("James", 312, 730, 8),
                ],
            },
        },
    },
    "Referral_example2.pdf": {
        "output": "mock_referral2.pdf",
        "pages": {
            0: {
                # Header: covers "re." line through phone
                "header_redact_pypdf": (55, 443, 555, 535),
                "header_lines": [
                    ("re. Ms Patricia Anne Henderson", 57, 525, 9),
                    ("03/11/1956", 94, 514, 9),
                    ("2143 67890 1/2", 94, 501, 9),
                    ("14 Ocean View Pde", 94, 491, 9),
                    ("Ettalong Beach.  2257", 94, 479, 9),
                    ("0438 221 765", 94, 457, 9),
                ],
                # Body: "Thank you for seeing [name]"
                "body_redacts": [
                    (136, 377, 224, 396),
                ],
                "body_lines": [
                    ("Patricia Henderson", 145, 386, 9),
                ],
            },
        },
    },
    "Referral_example3.pdf": {
        "output": "mock_referral3.pdf",
        "pages": {
            0: {
                # Header: covers RE: through Mob:
                "header_redact_pypdf": (80, 526, 555, 601),
                "header_lines": [
                    ("RE:   Ms Karen Phillips   DOB 14/07/1982", 82, 588, 9),
                    ("Address: 45 Alt Street, Ashfield 2131", 82, 575, 9),
                    ("Home Ph: (02) 9716 4532", 82, 562, 9),
                    ("Medicare no: 5298 14730 3   Ref 1, Exp 01/2028", 82, 551, 9),
                    ("Mob: 0423 876 214", 82, 539, 9),
                ],
                # Body: "Thank you for seeing [name]"
                "body_redacts": [
                    (143, 472, 177, 495),
                ],
                "body_lines": [
                    ("Karen", 152, 483, 9),
                ],
            },
        },
    },
    "Referral_example4.pdf": {
        "output": "mock_referral4.pdf",
        "pages": {
            0: {
                # Header: covers Re: through mobile
                "header_redact_pypdf": (50, 526, 555, 605),
                "header_lines": [
                    ("Re: Amira Karim", 55, 591, 9),
                    ("27 Windsor Road", 55, 579, 9),
                    ("Kellyville NSW  2155", 55, 568, 9),
                    ("DOB: 08/11/1985", 55, 554, 9),
                    ("Mobile: 0412 334 567", 55, 540, 9),
                ],
                # Body: name in 2 locations
                "body_redacts": [
                    (132, 506, 206, 528),   # "Thank you for seeing [name]"
                    (222, 332, 271, 355),   # "outcome of [name]'s"
                ],
                "body_lines": [
                    ("Amira Karim", 141, 516, 9),
                    ("Amira", 231, 342, 9),
                ],
            },
        },
    },
    "referral_example1.pdf": {
        "output": "mock_referral5.pdf",
        "pages": {
            0: {
                # Header: covers Re: through phone
                "header_redact_pypdf": (50, 446, 555, 510),
                "header_lines": [
                    ("Re: Mr Thomas Whitaker (D.O.B.: 15/06/1948)", 82, 500, 9),
                    ("22 Brighton Blvd, Bondi Beach NSW, 2026, 0412 789 456", 82, 487, 9),
                ],
                # Body: "Thank you for seeing [name]"
                "body_redacts": [
                    (161, 449, 238, 468),
                ],
                "body_lines": [
                    ("Thomas Whitaker", 170, 458, 9),
                ],
            },
        },
    },
}


def pypdf_to_fitz_y(y_pypdf, page_height):
    """Convert pypdf y coordinate (bottom-left origin) to pymupdf (top-left)."""
    return page_height - y_pypdf


def pypdf_rect_to_fitz(rect_pypdf, page_height):
    """Convert pypdf rect (x1,y1,x2,y2) to pymupdf Rect."""
    x1, y1, x2, y2 = rect_pypdf
    fitz_y1 = page_height - y2  # top
    fitz_y2 = page_height - y1  # bottom
    return fitz.Rect(x1, fitz_y1, x2, fitz_y2)


def process_pdf(input_filename, config):
    """Process a single redacted PDF, creating a mock version."""
    input_path = os.path.join(REDACTED_DIR, input_filename)
    output_filename = config["output"]
    output_path = os.path.join(OUTPUT_DIR, output_filename)

    print(f"\nProcessing: {input_filename} -> {output_filename}")

    doc = fitz.open(input_path)

    modified_pages = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        page_height = page.rect.height
        page_config = config.get("pages", {}).get(page_idx)

        if not page_config:
            print(f"  Page {page_idx}: no modifications")
            continue

        # --- STEP 1: Collect widget rects (black-bordered form field boxes) ---
        # We don't delete them here; instead we render without annotations in step 5
        # NOTE: page.annots() does NOT return widgets; must use page.widgets()
        widget_rects = [fitz.Rect(w.rect) for w in page.widgets()]
        if widget_rects:
            print(f"  Page {page_idx}: found {len(widget_rects)} widget boxes to suppress")

        # --- STEP 2: Redact header block ---
        header_rect = page_config.get("header_redact_pypdf")
        if header_rect:
            fitz_rect = pypdf_rect_to_fitz(header_rect, page_height)
            page.add_redact_annot(fitz_rect, fill=(1, 1, 1))
            print(f"  Page {page_idx}: header redaction "
                  f"({header_rect[0]:.0f},{header_rect[1]:.0f})-"
                  f"({header_rect[2]:.0f},{header_rect[3]:.0f})")

        # --- STEP 3: Redact body text areas ---
        for body_rect in page_config.get("body_redacts", []):
            fitz_rect = pypdf_rect_to_fitz(body_rect, page_height)
            page.add_redact_annot(fitz_rect, fill=(1, 1, 1))

        # Apply all redactions
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

        # --- STEP 4: Insert complete lines ---
        all_lines = page_config.get("header_lines", []) + page_config.get("body_lines", [])
        for text, x, y_pypdf, fontsize in all_lines:
            fitz_y = pypdf_to_fitz_y(y_pypdf, page_height)
            page.insert_text(
                fitz.Point(x, fitz_y),
                text,
                fontname="helv",
                fontsize=fontsize,
                color=(0, 0, 0),
            )

        print(f"  Page {page_idx}: inserted {len(all_lines)} lines")
        modified_pages.append(page_idx)

    # --- STEP 5: Rebuild modified pages as image + sorted invisible text ---
    # This ensures pdf-parse extracts text in positional order
    for page_idx in modified_pages:
        page = doc[page_idx]

        # Extract all text sorted by position
        td = page.get_text("dict", sort=True)
        text_spans = []
        for block in td["blocks"]:
            if "lines" not in block:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    text = span.get("text", "")
                    if text.strip():
                        text_spans.append({
                            "text": text,
                            "bbox": span["bbox"],
                            "size": span["size"],
                        })

        # Render page to image (skip annotations to hide widget borders)
        pix = page.get_pixmap(dpi=200, annots=False)
        img_data = pix.tobytes("png")

        # Create new page
        rect = page.rect
        new_page = doc.new_page(pno=page_idx + 1,
                                width=rect.width, height=rect.height)

        # Insert image as background
        new_page.insert_image(rect, stream=img_data)

        # Insert all text as invisible layer in sorted order
        for span in text_spans:
            x1, y1, x2, y2 = span["bbox"]
            fs = span["size"]
            baseline_y = y2 - fs * 0.15
            new_page.insert_text(
                fitz.Point(x1, baseline_y),
                span["text"],
                fontname="helv",
                fontsize=fs,
                color=(1, 1, 1),
                render_mode=3,  # invisible but extractable
            )

        # Delete original page
        doc.delete_page(page_idx)
        print(f"  Page {page_idx}: rebuilt with {len(text_spans)} sorted text spans")

    # Save
    tmp_path = output_path + ".tmp"
    doc.save(tmp_path, deflate=True, garbage=4)
    doc.close()
    os.replace(tmp_path, output_path)

    size = os.path.getsize(output_path)
    print(f"  Saved: {output_path} ({size:,} bytes)")
    return output_path


def main():
    print("=" * 60)
    print("Unredacting PDFs with fictional patient data")
    print("=" * 60)

    output_paths = []
    for input_filename, config in FILES.items():
        path = process_pdf(input_filename, config)
        output_paths.append(path)

    print("\n" + "=" * 60)
    print("All 5 mock PDFs created:")
    print("=" * 60)
    for p in output_paths:
        size = os.path.getsize(p)
        print(f"  {os.path.basename(p)} ({size:,} bytes)")

    print(f"\nOutput directory: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
