# Remaining OCR batch: SST (bilingual) -> Team Prabhat practice sets -> Booster CTET.
# All arguments are explicit numbers so PowerShell cannot drop an empty string.

$root = 'C:\Users\Admin\Desktop\NET Ed'
$tmp = 'C:\Users\Admin\AppData\Local\Temp\opencode'
Set-Location $root
$BIG = 999999

function Run-Book($pdf, $txt, $json, $dpi, $lang, $book) {
    Write-Output "[pipeline] OCR start: $book (dpi $dpi, lang $lang)"
    python scripts\ocr_columns.py $pdf $txt $dpi 0 $BIG $lang
    Write-Output "[pipeline] parsing: $book"
    python scripts\parse_ocr_questions.py $txt $json $book
}

Run-Book 'books\SST EBOOK.pdf' "$tmp\sst_ocr_cols.txt" "$tmp\sst_part.json" 180 'eng+hin' 'CTET Social Studies (SST)'

$prabhat = 'C:\Users\Admin\Downloads\CTET Central Teacher Eligibility Test Social StudiesSocial Science Paper-II (Class VI-VIII) 10 Practice Sets (Team Prabhat [Team Prabhat]) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
Run-Book $prabhat "$tmp\prabhat_ocr_cols.txt" "$tmp\prabhat_part.json" 180 'eng' 'CTET 10 Practice Sets (Team Prabhat)'

$booster = 'C:\Users\Admin\Downloads\Booster CTET (Prateek Shivalik) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
Run-Book $booster "$tmp\booster_ocr_cols.txt" "$tmp\booster_part.json" 180 'eng' 'Booster CTET (Prateek Shivalik)'

Write-Output '[pipeline] building the merged review file'
python scripts\build_final_review.py
Write-Output '[pipeline] done'
