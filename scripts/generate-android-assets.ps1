# Generates branded Android launcher icons and splash screens from the PWA icon.
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$res = Join-Path $root 'android\app\src\main\res'
$source = Join-Path $root 'pwa\assets\icon-512.png'
$icon = [System.Drawing.Bitmap]::FromFile($source)

$bg = [System.Drawing.Color]::FromArgb(255, 244, 251, 247)
$deep = [System.Drawing.Color]::FromArgb(255, 11, 61, 46)
$green = [System.Drawing.Color]::FromArgb(255, 17, 94, 69)

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  return @($bmp, $g)
}

function Draw-RoundedRect($g, $brush, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $g.FillPath($brush, $path)
  $path.Dispose()
}

# Legacy + round launcher icons.
$sizes = @{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }
foreach ($entry in $sizes.GetEnumerator()) {
  $size = $entry.Value
  $dir = Join-Path $res ("mipmap-" + $entry.Key)
  $inner = [int]($size * 0.90)
  $offset = [int](($size - $inner) / 2)

  $pair = New-Canvas $size $size
  $bmp = $pair[0]; $g = $pair[1]
  $g.Clear($bg)
  $g.DrawImage($icon, $offset, $offset, $inner, $inner)
  $bmp.Save((Join-Path $dir 'ic_launcher.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()

  $pair = New-Canvas $size $size
  $bmp = $pair[0]; $g = $pair[1]
  $g.Clear([System.Drawing.Color]::Transparent)
  $bgBrush = New-Object System.Drawing.SolidBrush($bg)
  $g.FillEllipse($bgBrush, 0, 0, $size - 1, $size - 1)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse(0, 0, $size - 1, $size - 1)
  $g.SetClip($path)
  $g.DrawImage($icon, $offset, $offset, $inner, $inner)
  $g.ResetClip()
  $path.Dispose(); $bgBrush.Dispose()
  $bmp.Save((Join-Path $dir 'ic_launcher_round.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()

  # Adaptive foreground: 108dp canvas, artwork kept inside the 66dp safe zone.
  $adaptive = @{ 'mdpi' = 108; 'hdpi' = 162; 'xhdpi' = 216; 'xxhdpi' = 324; 'xxxhdpi' = 432 }[$entry.Key]
  $art = [int]($adaptive * 0.62)
  $artOffset = [int](($adaptive - $art) / 2)
  $pair = New-Canvas $adaptive $adaptive
  $bmp = $pair[0]; $g = $pair[1]
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($icon, $artOffset, $artOffset, $art, $art)
  $bmp.Save((Join-Path $dir 'ic_launcher_foreground.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

# Splash screens matching Capacitor's expected densities.
$splashes = @(
  @('drawable/splash.png', 480, 320),
  @('drawable-land-mdpi/splash.png', 480, 320),
  @('drawable-land-hdpi/splash.png', 800, 480),
  @('drawable-land-xhdpi/splash.png', 1280, 720),
  @('drawable-land-xxhdpi/splash.png', 1600, 960),
  @('drawable-land-xxxhdpi/splash.png', 1920, 1280),
  @('drawable-port-mdpi/splash.png', 320, 480),
  @('drawable-port-hdpi/splash.png', 480, 800),
  @('drawable-port-xhdpi/splash.png', 720, 1280),
  @('drawable-port-xxhdpi/splash.png', 960, 1600),
  @('drawable-port-xxxhdpi/splash.png', 1280, 1920)
)
foreach ($spec in $splashes) {
  $rel = $spec[0]; $w = [int]$spec[1]; $h = [int]$spec[2]
  $pair = New-Canvas $w $h
  $bmp = $pair[0]; $g = $pair[1]
  $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $deep, $green, 45.0)
  $g.FillRectangle($grad, $rect)

  # Soft corner glow.
  $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glowPath.AddEllipse(-1 * [int]($w * 0.35), -1 * [int]($h * 0.45), [int]($w * 0.95), [int]($h * 1.05))
  $glow = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
  $glow.CenterColor = [System.Drawing.Color]::FromArgb(26, 255, 255, 255)
  $glow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
  $g.FillPath($glow, $glowPath)
  $glow.Dispose(); $glowPath.Dispose()

  $min = [Math]::Min($w, $h)
  $tile = [int]($min * 0.24)
  $tileX = [int](($w - $tile) / 2)
  $tileY = [int](($h - $tile) / 2 - $min * 0.075)

  # White rounded tile with the mark.
  $tileBg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 253, 250))
  Draw-RoundedRect $g $tileBg $tileX $tileY $tile $tile ([int]($tile * 0.22))
  $pad = [int]($tile * 0.12)
  $g.DrawImage($icon, $tileX + $pad, $tileY + $pad, $tile - 2 * $pad, $tile - 2 * $pad)
  $tileBg.Dispose()

  $titleFont = [System.Drawing.Font]::new('Segoe UI', [float]($min * 0.085), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $subFont = [System.Drawing.Font]::new('Segoe UI', [float]($min * 0.026), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
  $muted = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(190, 209, 250, 229))
  $titleText = 'StudySynth'
  $subText = 'O F F L I N E   S T U D Y   W O R K S P A C E'
  $titleMeasure = $g.MeasureString($titleText, $titleFont)
  $subMeasure = $g.MeasureString($subText, $subFont)
  $titleY = [float]($tileY + $tile + $min * 0.055)
  $g.DrawString($titleText, $titleFont, $white, [float](($w - $titleMeasure.Width) / 2), $titleY)
  $subY = [float]($titleY + $titleMeasure.Height * 0.98)
  $g.DrawString($subText, $subFont, $muted, [float](($w - $subMeasure.Width) / 2), $subY)

  $target = Join-Path $res $rel
  $bmp.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  $white.Dispose(); $muted.Dispose(); $titleFont.Dispose(); $subFont.Dispose(); $grad.Dispose(); $g.Dispose(); $bmp.Dispose()
}

$icon.Dispose()
Write-Output 'Android launcher icons and splash screens regenerated.'
