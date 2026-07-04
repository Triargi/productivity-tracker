$source = "C:\Users\Lenovo\.gemini\antigravity\brain\496f9aae-d404-4db5-9a2c-3105c7291d2b\protrack_hollow_lightning_icon_1783063879054.png"
$dest = "C:\Users\Lenovo\.gemini\antigravity\scratch\productivity-tracker\icon_v9.ico"
$pngDest = "C:\Users\Lenovo\.gemini\antigravity\scratch\productivity-tracker\icon_hollow.png"

Add-Type -AssemblyName System.Drawing
$origImg = [System.Drawing.Image]::FromFile($source)
$img = New-Object System.Drawing.Bitmap(256, 256)
$g = [System.Drawing.Graphics]::FromImage($img)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([System.Drawing.Color]::Transparent)

# Create rounded rectangle path
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = 60 # Good radius for 256x256 icon
$rect = New-Object System.Drawing.Rectangle(0, 0, 256, 256)
$path.AddArc($rect.X, $rect.Y, $radius, $radius, 180, 90)
$path.AddArc($rect.Width - $radius, $rect.Y, $radius, $radius, 270, 90)
$path.AddArc($rect.Width - $radius, $rect.Height - $radius, $radius, $radius, 0, 90)
$path.AddArc($rect.X, $rect.Height - $radius, $radius, $radius, 90, 90)
$path.CloseFigure()

$g.SetClip($path)
$g.DrawImage($origImg, 0, 0, 256, 256)
$g.Dispose()
$origImg.Dispose()

# Save as PNG as well for preview
$img.Save($pngDest, [System.Drawing.Imaging.ImageFormat]::Png)

# Convert to ICO
$fs = New-Object System.IO.FileStream($dest, [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter($fs)

$bw.Write([int16]0)
$bw.Write([int16]1)
$bw.Write([int16]1)

$bw.Write([byte]0)
$bw.Write([byte]0)
$bw.Write([byte]0)
$bw.Write([byte]0)
$bw.Write([int16]1)
$bw.Write([int16]32)

$ms = New-Object System.IO.MemoryStream
$img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$imgBytes = $ms.ToArray()

$bw.Write([int32]$imgBytes.Length)
$bw.Write([int32]22)
$bw.Write($imgBytes)
$bw.Close()
$img.Dispose()

$desktopPath = [Environment]::GetFolderPath("Desktop")
$s = (New-Object -COM WScript.Shell).CreateShortcut("$desktopPath\ProTrack.lnk")
$s.IconLocation = $dest
$s.Save()

Write-Host "Icon updated successfully!"
