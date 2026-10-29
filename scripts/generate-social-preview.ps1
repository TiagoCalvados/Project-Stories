Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $root "social-preview-2026-10.png"
$width = 1200
$height = 630

function Open-OrientedImage {
  param([string]$ImagePath)

  $image = [System.Drawing.Image]::FromFile($ImagePath)

  try {
    $orientation = $image.GetPropertyItem(0x0112).Value[0]

    switch ($orientation) {
      2 { $image.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX) }
      3 { $image.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
      4 { $image.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipX) }
      5 { $image.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipX) }
      6 { $image.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
      7 { $image.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipX) }
      8 { $image.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
    }
  } catch {
    # Images without EXIF orientation need no adjustment.
  }

  return ,$image
}

function Draw-CoverImage {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Image]$Image,
    [System.Drawing.RectangleF]$Target,
    [double]$FocusX = 0.5,
    [double]$FocusY = 0.5,
    [double]$Zoom = 1.0
  )

  $targetRatio = $Target.Width / $Target.Height
  $sourceRatio = $Image.Width / $Image.Height

  if ($sourceRatio -gt $targetRatio) {
    $sourceHeight = $Image.Height / $Zoom
    $sourceWidth = $sourceHeight * $targetRatio
  } else {
    $sourceWidth = $Image.Width / $Zoom
    $sourceHeight = $sourceWidth / $targetRatio
  }

  $sourceX = [Math]::Max(0, [Math]::Min($Image.Width - $sourceWidth, ($Image.Width * $FocusX) - ($sourceWidth / 2)))
  $sourceY = [Math]::Max(0, [Math]::Min($Image.Height - $sourceHeight, ($Image.Height * $FocusY) - ($sourceHeight / 2)))
  $source = [System.Drawing.RectangleF]::new($sourceX, $sourceY, $sourceWidth, $sourceHeight)

  $Graphics.DrawImage($Image, $Target, $source, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-StoryButton {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$ImagePath,
    [float]$X,
    [float]$Y,
    [float]$Size,
    [double]$FocusX = 0.5,
    [double]$FocusY = 0.5,
    [double]$Zoom = 1.0
  )

  $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(105, 0, 0, 0))
  $Graphics.FillEllipse($shadowBrush, $X + 5, $Y + 8, $Size, $Size)
  $shadowBrush.Dispose()

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddEllipse($X, $Y, $Size, $Size)
  $state = $Graphics.Save()
  $Graphics.SetClip($path)

  $image = Open-OrientedImage -ImagePath $ImagePath
  $target = [System.Drawing.RectangleF]::new($X, $Y, $Size, $Size)
  Draw-CoverImage -Graphics $Graphics -Image $image -Target $target -FocusX $FocusX -FocusY $FocusY -Zoom $Zoom
  $image.Dispose()

  $Graphics.Restore($state)
  $borderPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(225, 255, 255, 255), 3)
  $Graphics.DrawEllipse($borderPen, $X, $Y, $Size, $Size)
  $borderPen.Dispose()
  $path.Dispose()
}

$bitmap = [System.Drawing.Bitmap]::new($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$background = Open-OrientedImage -ImagePath (Join-Path $root "front page.png")
Draw-CoverImage -Graphics $graphics -Image $background -Target ([System.Drawing.RectangleF]::new(0, 0, $width, $height))
$background.Dispose()

$overlayRect = [System.Drawing.RectangleF]::new(0, 0, $width, 410)
$overlayBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  $overlayRect,
  [System.Drawing.Color]::FromArgb(175, 1, 12, 31),
  [System.Drawing.Color]::FromArgb(0, 0, 0, 0),
  90
)
$graphics.FillRectangle($overlayBrush, $overlayRect)
$overlayBrush.Dispose()

$titleFont = [System.Drawing.Font]::new("Georgia", 42, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$subtitleFont = [System.Drawing.Font]::new("Georgia", 28, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$bodyFont = [System.Drawing.Font]::new("Georgia", 19, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$captionFont = [System.Drawing.Font]::new("Georgia", 20, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$appFont = [System.Drawing.Font]::new("Georgia", 23, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$appBodyFont = [System.Drawing.Font]::new("Segoe UI", 18, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(242, 255, 255, 255))
$bodyBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(224, 255, 255, 255))
$shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(145, 0, 0, 0))

function Draw-CenteredCaption {
  param([string]$Text, [float]$CenterX, [float]$Y)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $rect = [System.Drawing.RectangleF]::new(($CenterX - 110), $Y, 220, 58)
  $shadowRect = [System.Drawing.RectangleF]::new(($CenterX - 108), ($Y + 2), 220, 58)
  $graphics.DrawString($Text, $captionFont, $shadowBrush, $shadowRect, $format)
  $graphics.DrawString($Text, $captionFont, $whiteBrush, $rect, $format)
  $format.Dispose()
}

function Draw-AppCard {
  param([float]$X, [string]$Title, [string]$Description)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($X, 448, 28, 28, 180, 90)
  $path.AddArc(($X + 328), 448, 28, 28, 270, 90)
  $path.AddArc(($X + 328), 565, 28, 28, 0, 90)
  $path.AddArc($X, 565, 28, 28, 90, 90)
  $path.CloseFigure()
  $fill = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(225, 9, 22, 25))
  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(110, 189, 227, 226), 1)
  $graphics.FillPath($fill, $path)
  $graphics.DrawPath($pen, $path)
  $accent = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(143, 219, 222))
  $graphics.FillEllipse($accent, ($X + 19), 468, 7, 7)
  $graphics.DrawString($Title, $appFont, $whiteBrush, [System.Drawing.RectangleF]::new(($X + 19), 484, 322, 33))
  $graphics.DrawString($Description, $appBodyFont, $bodyBrush, [System.Drawing.RectangleF]::new(($X + 19), 522, 320, 66))
  $accent.Dispose(); $pen.Dispose(); $fill.Dispose(); $path.Dispose()
}

$graphics.DrawString("Project Stories", $titleFont, $whiteBrush, 44, 28)
$graphics.DrawString("A hybrid inner landscape", $subtitleFont, $whiteBrush, 46, 81)
$description = "Ideas, images, memories, music, machines, past, present, and future fold into one another."
$graphics.DrawString($description, $bodyFont, $bodyBrush, [System.Drawing.RectangleF]::new(48, 124, 545, 80))

# The current homepage's main story, plus its lunar clock (a static time in a share image).
Draw-StoryButton -Graphics $graphics -ImagePath (Join-Path $root "Tiago K\04Tiago K NGR\tiagokstroryicon.png") -X 718 -Y 48 -Size 88 -FocusY 0.2
Draw-CenteredCaption -Text "Tiago K : The story." -CenterX 762 -Y 148
$clock = Open-OrientedImage -ImagePath (Join-Path $root "lunar-clock-face.png")
$clockAttributes = [System.Drawing.Imaging.ImageAttributes]::new()
$clockAttributes.SetColorKey([System.Drawing.Color]::FromArgb(0,0,0), [System.Drawing.Color]::FromArgb(20,20,20))
$clockClip = [System.Drawing.Drawing2D.GraphicsPath]::new()
$clockClip.AddEllipse(879, 40, 98, 98)
$clockState = $graphics.Save()
$graphics.SetClip($clockClip)
$graphics.DrawImage($clock, [System.Drawing.Rectangle]::new(878,34,100,106), 0,0,303,321,[System.Drawing.GraphicsUnit]::Pixel,$clockAttributes)
$graphics.Restore($clockState)
$handPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255,246,231), 2.2)
$handPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$handPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($handPen, 928,89,914,77)
$graphics.DrawLine($handPen, 928,89,949,80)
$handPen.Color = [System.Drawing.Color]::FromArgb(255,150,213)
$handPen.Width = 1
$graphics.DrawLine($handPen, 928,89,928,124)
$graphics.FillEllipse($whiteBrush,925,86,6,6)
$handPen.Dispose(); $clock.Dispose(); $clockAttributes.Dispose(); $clockClip.Dispose()

# All six remaining homepage sections, with their existing names and icon artwork.
$centers = @(150, 330, 510, 690, 870, 1050)
$iconY = 251
$size = 76
Draw-StoryButton -Graphics $graphics -ImagePath (Join-Path $root "padel-racket-icon.png") -X ($centers[0]-38) -Y $iconY -Size $size
Draw-StoryButton -Graphics $graphics -ImagePath (Join-Path $root "Tiago-Photoroom.png") -X ($centers[1]-38) -Y $iconY -Size $size
# The interview icon's two quotation marks reproduce the homepage SVG paths.
$quoteState = $graphics.Save()
$graphics.TranslateTransform(($centers[2]-38), $iconY)
$graphics.ScaleTransform(($size/56), ($size/56))
$dark = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(11,17,24))
$cyan = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(112,225,230))
$ring = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(103,220,227), 1)
$graphics.FillEllipse($dark,0,0,56,56)
$graphics.DrawEllipse($ring,6,6,44,44)
foreach ($offset in @(0,20)) {
  $quote = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $quote.AddBezier((11+$offset),27,(11+$offset),19,(15+$offset),14,(24+$offset),12)
  $quote.AddLine((24+$offset),12,(24+$offset),18)
  $quote.AddBezier((24+$offset),18,(19+$offset),19,(17+$offset),22,(17+$offset),25)
  $quote.AddLines([System.Drawing.PointF[]]@([System.Drawing.PointF]::new((17+$offset),25),[System.Drawing.PointF]::new((25+$offset),25),[System.Drawing.PointF]::new((25+$offset),42),[System.Drawing.PointF]::new((11+$offset),42)))
  $quote.CloseFigure()
  $graphics.FillPath($(if ($offset -eq 0) {$cyan} else {$whiteBrush}),$quote)
  $quote.Dispose()
}
$ring.Color = [System.Drawing.Color]::FromArgb(225,255,255,255)
$ring.Width = 2
$graphics.DrawEllipse($ring,1,1,54,54)
$graphics.Restore($quoteState)
$dark.Dispose(); $cyan.Dispose(); $ring.Dispose()
Draw-StoryButton -Graphics $graphics -ImagePath (Join-Path $root "audiovisual-icon.png") -X ($centers[3]-38) -Y $iconY -Size $size
Draw-StoryButton -Graphics $graphics -ImagePath (Join-Path $root "Tiago K\Narrative slides\tree icon.jpg") -X ($centers[4]-38) -Y $iconY -Size $size -Zoom 1.68
Draw-StoryButton -Graphics $graphics -ImagePath (Join-Path $root "Tiago K-Photoroom.png") -X ($centers[5]-38) -Y $iconY -Size $size
$labels = @("Padel", "Tiago Calvados", "Interviews", "Audiovisual", "Inner Landscape", "Tiago K")
for ($i=0; $i -lt $labels.Count; $i++) { Draw-CenteredCaption -Text $labels[$i] -CenterX $centers[$i] -Y 343 }

Draw-AppCard -X 40 -Title "TCKO3 Layer Studio" -Description "Three sounds. Six effects each. Loop, remix and download on your device."
Draw-AppCard -X 422 -Title "TCKO2 Synth Modular" -Description "A small laboratory for unstable sound. Play with touch, keys or MIDI. No installation."
Draw-AppCard -X 804 -Title "DAAO" -Description "Explore the sky in your browser with camera, location, motion, or manual direction. No desktop app needed."

$titleFont.Dispose()
$subtitleFont.Dispose()
$bodyFont.Dispose()
$captionFont.Dispose()
$appFont.Dispose()
$appBodyFont.Dispose()
$whiteBrush.Dispose()
$bodyBrush.Dispose()
$shadowBrush.Dispose()
$graphics.Dispose()

$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

Write-Output $outputPath
