$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$targets = Get-ChildItem -Path $root -Recurse -Directory -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq "__pycache__" }

if ($targets) {
  $targets | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output "Removed __pycache__ directories (if any)."
