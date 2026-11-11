# Sequential OCR pipeline for the remaining scanned CTET books.
# Waits for the running CDP OCR job, then does SST -> Team Prabhat -> Booster,
# parsing each book as soon as its OCR finishes.

$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Admin\Desktop\NET Ed'
$tmp = 'C:\Users\Admin\AppData\Local\Temp\opencode'
Set-Location $root

function Wait-ForCdp {
    Write-Output '[pipeline] waiting for the CDP OCR job to finish...'
    while ($true) {
        $p = Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
             Where-Object { $_.CommandLine -like '*cdp_ocr_cols*' }
        if (-not $p) { break }
        Start-Sleep -Seconds 60
    }
    Write-Output '[pipeline] CDP OCR finished.'
}

function Run-Book($pdf, $txt, $json, $dpi, $lang, $book, $parse) {
    Write-Output "[pipeline] OCR start: $book (dpi $dpi, lang $lang)"
    python scripts\ocr_columns.py $pdf $txt $dpi 0 '' $lang
    if ($parse) {
        Write-Output "[pipeline] parsing: $book"
        python scripts\parse_ocr_questions.py $txt $json $book
    }
}

Wait-ForCdp

# 1. Social Studies (bilingual, answers as "Ans. (c)")
Run-Book 'books\SST EBOOK.pdf' "$tmp\sst_ocr_cols.txt" "$tmp\sst_part.json" 180 'eng+hin' 'CTET Social Studies (SST)' $true

# 2. Team Prabhat 10 practice sets (English, scanned)
$prabhat = 'C:\Users\Admin\Downloads\CTET Central Teacher Eligibility Test Social StudiesSocial Science Paper-II (Class VI-VIII) 10 Practice Sets (Team Prabhat [Team Prabhat]) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
Run-Book $prabhat "$tmp\prabhat_ocr_cols.txt" "$tmp\prabhat_part.json" 180 'eng' 'CTET 10 Practice Sets (Team Prabhat)' $true

# 3. Booster CTET (Prateek Shivalik), 300 scanned pages
$booster = 'C:\Users\Admin\Downloads\Booster CTET (Prateek Shivalik) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
Run-Book $booster "$tmp\booster_ocr_cols.txt" "$tmp\booster_part.json" 180 'eng' 'Booster CTET (Prateek Shivalik)' $true

Write-Output '[pipeline] building the merged review file'
python scripts\build_final_review.py
Write-Output '[pipeline] done'
