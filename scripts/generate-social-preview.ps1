Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $root "social-preview.png"
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

$overlayRect = [System.Drawing.RectangleF]::new(0, 0, $width, 260)
$overlayBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  $overlayRect,
  [System.Drawing.Color]::FromArgb(180, 0, 0, 0),
  [System.Drawing.Color]::FromArgb(0, 0, 0, 0),
  90
)
$graphics.FillRectangle($overlayBrush, $overlayRect)
$overlayBrush.Dispose()

$titleFont = [System.Drawing.Font]::new("Georgia", 38, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$bodyFont = [System.Drawing.Font]::new("Georgia", 19, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$captionFont = [System.Drawing.Font]::new("Georgia", 17, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(242, 255, 255, 255))
$bodyBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(224, 255, 255, 255))
$shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(145, 0, 0, 0))

$graphics.DrawString("A hybrid inner landscape", $titleFont, $shadowBrush, 63, 51)
$graphics.DrawString("A hybrid inner landscape", $titleFont, $whiteBrush, 60, 48)
$description = "Ideas, images, memories, music, machines, past, present, and future fold into one another."
$graphics.DrawString($description, $bodyFont, $shadowBrush, [System.Drawing.RectangleF]::new(63, 105, 570, 70))
$graphics.DrawString($description, $bodyFont, $bodyBrush, [System.Drawing.RectangleF]::new(60, 102, 570, 70))

$buttonSize = 84
$centerX = 650
$topY = 158
$bottomY = 300
$spacing = 116

Draw-StoryButton -Graphics $graphics -ImagePath (Join-Path $root "Tiago K\04Tiago K NGR\tiagokstroryicon.png") -X ($centerX - ($buttonSize / 2)) -Y $topY -Size $buttonSize -FocusY 0.2
Draw-StoryButton -Graphics $graphics -ImagePath (Join-Path $root "Tiago-Photoroom.png") -X ($centerX - $spacing - ($buttonSize / 2)) -Y $bottomY -Size $buttonSize
Draw-StoryButton -Graphics $graphics -ImagePath (Join-Path $root "Tiago K\Narrative slides\tree icon.jpg") -X ($centerX - ($buttonSize / 2)) -Y $bottomY -Size $buttonSize -Zoom 1.68
Draw-StoryButton -Graphics $graphics -ImagePath (Join-Path $root "Tiago K-Photoroom.png") -X ($centerX + $spacing - ($buttonSize / 2)) -Y $bottomY -Size $buttonSize

$caption = "Tiago K : The story."
$captionSize = $graphics.MeasureString($caption, $captionFont)
$captionX = $centerX - ($captionSize.Width / 2)
$graphics.DrawString($caption, $captionFont, $shadowBrush, $captionX + 2, 255)
$graphics.DrawString($caption, $captionFont, $whiteBrush, $captionX, 253)

$titleFont.Dispose()
$bodyFont.Dispose()
$captionFont.Dispose()
$whiteBrush.Dispose()
$bodyBrush.Dispose()
$shadowBrush.Dispose()
$graphics.Dispose()

$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

Write-Output $outputPath
