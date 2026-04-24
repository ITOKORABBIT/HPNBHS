# Project Instructions

## File Encoding — CRITICAL

All files in this project are UTF-8 encoded and contain Traditional Chinese text (繁體中文).
Chinese characters are 3 bytes each in UTF-8. Byte-level text operations will corrupt them.

### Required rules when editing any file:

**Shell — never use these for file content edits:**
- `sed` / `awk` — do not handle multi-byte characters reliably on Windows
- PowerShell `Set-Content` / `Out-File` without `-Encoding utf8` — defaults to UTF-16, corrupts files

**Python — always specify encoding:**
```python
# Read
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Write
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
```

**Node.js — always specify encoding:**
```js
const content = fs.readFileSync(path, 'utf8');
fs.writeFileSync(path, newContent, 'utf8');
```

**PowerShell — always specify encoding:**
```powershell
Get-Content file.html -Encoding utf8
Set-Content file.html -Value $content -Encoding utf8
```

### Preferred editing method
Use exact-string replacement rather than line-number offsets.
Line-number approaches shift when content changes; exact-string matching is safe.

## Project Overview

- Static HTML + vanilla JS frontend, no build step, files served directly
- Backend: Google Apps Script (apps-script.gs) — deployed as Web App
- All user-facing strings are Traditional Chinese
- Four main pages: detail.html, report.html, store.html, storedetail.html
- Assets: assets/sortable-order.js (drag-sort library, do not modify)
