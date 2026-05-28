# PDF to HL7 Converter - Python Script

Standalone Python script for converting PDF patient consent forms to Australian HL7 v2.4 format (Genie-compatible).

## Installation

### 1. Install Python (if not already installed)
- Download from https://www.python.org/downloads/
- Make sure to check "Add Python to PATH" during installation

### 2. Install Dependencies
```bash
pip install PyMuPDF
```

Or use the requirements file:
```bash
pip install -r requirements.txt
```

## Usage

### Command Line
```bash
# Basic usage - output to same directory with .hl7 extension
python pdf_to_hl7.py "C:\path\to\consent_form.pdf"

# Specify output path
python pdf_to_hl7.py "C:\path\to\input.pdf" "C:\output\patient.hl7"
```

### Exit Codes
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Invalid arguments |
| 2 | Input file not found |
| 3 | PDF parsing error |
| 4 | Output write error |

## Power Automate Desktop Integration

### Option 1: Run Python Script Action

1. Add a **"Run Python script"** action
2. Set the Python path (e.g., `C:\Python311\python.exe`)
3. Use this script code:

```python
# Paste the contents of pdf_to_hl7.py here
# OR reference it as a file
```

### Option 2: Run Process Action (Recommended)

1. Add a **"Run application"** action with these settings:
   - **Application path:** `python` (or full path like `C:\Python311\python.exe`)
   - **Command line arguments:** `"C:\scripts\pdf_to_hl7.py" "%InputPDF%" "%OutputHL7%"`
   - **Working folder:** The folder containing the script

2. Use variables:
   ```
   %InputPDF%  - Full path to the PDF file to convert
   %OutputHL7% - Full path for the output HL7 file
   ```

3. Check the exit code:
   - `%ExitCode% = 0` means success
   - Any other value means an error occurred

### Example Power Automate Desktop Flow

```
1. [Get files in folder]
   - Folder: C:\Incoming\PDFs
   - Filter: *.pdf
   → Stores list in %Files%

2. [For each] file in %Files%

   3. [Set variable] %OutputPath% to:
      C:\Processed\HL7\%CurrentItem.NameWithoutExtension%.hl7

   4. [Run application]
      - Application: python
      - Arguments: "C:\scripts\pdf_to_hl7.py" "%CurrentItem.FullPath%" "%OutputPath%"

   5. [If] %ExitCode% = 0
      6. [Move file] %CurrentItem% to C:\Processed\Done\
      [Else]
      7. [Move file] %CurrentItem% to C:\Processed\Failed\
      [End if]

[End For each]
```

## What the Script Does

1. **Extracts Patient Data** from PDF text:
   - First Name, Last Name
   - Date of Birth (converts DD/MM/YYYY → YYYYMMDD)
   - Sex (inferred from title: Mr, Mrs, Miss, Ms)
   - Address, Suburb, State, Postcode
   - Medicare Number and Reference

2. **Generates Australian HL7 v2.4 Message**:
   - MSH: Message Header (ORU^R01)
   - PID: Patient Identification
   - PV1: Patient Visit (Outpatient)
   - OBR: Observation Request
   - OBX: Observation with embedded PDF (Base64)

3. **Outputs Genie-compatible HL7 file**:
   - Segment terminator: CR only (`\r`)
   - Character set: 8859/1
   - Country code: AUS

## Troubleshooting

### "No module named 'fitz'"
Install PyMuPDF:
```bash
pip install PyMuPDF
```

### "Could not extract first name"
The PDF text extraction may not work for all form layouts. The script will use placeholder values (UNKNOWN PATIENT) for fields it can't extract.

### Special characters in file paths
Always wrap file paths in quotes when they contain spaces:
```bash
python pdf_to_hl7.py "C:\My Documents\consent form.pdf"
```

## TypeScript Debug & Live Test Scripts

These are run via Bun against the project's TypeScript modules.

### Generators (puppeteer + system Chrome)

| Script | Purpose |
|--------|---------|
| `generate-test-pdfs.ts` | Regenerate all 20 generic test referral / consent PDFs |
| `generate-addressee-test-pdfs.ts` | Generate addressee resolution scenario PDFs |
| `generate-result-test-pdfs.ts` | Generate 4 synthetic pathology + radiology result PDFs (saved to `docs/test-pdfs/results/`) |
| `generate-redacted-style-test-pdfs.ts` | Generate 5 synthetic result PDFs that mimic the layouts of redacted real-world samples — DHM serial trend, MMI multi-page MRI, PRP combined CT/X-ray, NSW Health multi-panel fax, I-MED DEXA letter (saved to `docs/test-pdfs/results/redacted-style/`) |

### Live Bedrock tests (run manually with `AWS_PROFILE` set)

These call Bedrock (Claude Opus 4.7) for real and are NOT run by `bun test`.
They require AWS credentials with `bedrock:InvokeModel` for
`anthropic.claude-opus-4-7` in **both** `ap-southeast-2` and
`ap-southeast-4` (AU inference profiles route to Melbourne).

| Script | Purpose |
|--------|---------|
| `test-vision.ts` | Run vision extraction across all mock referral PDFs |
| `test-addressee-scenarios.ts` | Verify addressee resolution against the BJC doctor list |
| `test-result-scenarios.ts` | Verify pathology/radiology classification + referring doctor resolution |

Example:

```bash
AWS_PROFILE=bjc-dev bun scripts/test-result-scenarios.ts
```

## HL7 Format Reference

The output follows the Australian Diagnostics and Referral Messaging (ADRM) specification:

```
MSH|^~\&|BJCHEALTH|BJCHEALTH|GENIE|CLINIC|20241220143022||ORU^R01|MSG...|P|2.4|||AL|NE|AUS|8859/1
PID|1||1234567890-1^^^Medicare^MC||SMITH^JOHN||19800315|M|||123 Main St^^Melbourne^VIC^3000^AUS|||0412345678
PV1|1|O
OBR|1||RPT20241220143022^BJCHEALTH|PDF^Patient Consent Form^L|||20241220143022||||||||||||||||||20241220143022|||F
OBX|1|ED|PDF^Display format in PDF^AUSPDI||^application^pdf^Base64^JVBERi0...base64data...||||||F
```
