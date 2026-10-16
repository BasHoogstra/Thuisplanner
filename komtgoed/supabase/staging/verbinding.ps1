# Thuisplanner-staging: tijdelijke, veilige verbinding en een ALLEEN LEZENDE controle met dry-run.
# docs/thuisplanner-staging.md, stap 3. Voert GEEN migraties uit (alleen db push --dry-run).
#
#   & .\komtgoed\supabase\staging\verbinding.ps1 -Ref <projectkenmerk>
#
# - De session-pooler-URI plak je met de tekst [YOUR-PASSWORD] erin: daar staat geen geheim in.
# - Het wachtwoord typ je bij een verborgen prompt. Het komt niet in de terminalgeschiedenis (Read-Host wordt niet
#   opgeslagen), niet op het scherm, niet in een bestand en niet in de repository. Het staat alleen tijdens dit script
#   in PGPASSWORD van dit venster, en wordt aan het eind gewist, ook bij een fout.
# - TLS: altijd met certificaatcontrole (keten en hostnaam), met als enige vertrouwensanker de Supabase-root uit
#   supabase-root-ca.crt (vastgepinde vingerafdrukken). De dry-run (Supabase CLI) controleert de pooler zelf met
#   dezelfde, in de CLI ingebouwde root.
# - Volgorde: verbinding controleren (vóór verbinden) -> alleen lezend: is dit het lege stagingproject? ->
#   dry-run -> alleen lezend: is er niets veranderd?
param([Parameter(Mandatory = $true)][string]$Ref)
$ErrorActionPreference = 'Stop'
$hier = Split-Path -Parent $MyInvocation.MyCommand.Path
$komtgoed = Resolve-Path (Join-Path $hier '..\..')
$stand = Join-Path ([IO.Path]::GetTempPath()) ('thuisplanner-stand-' + [guid]::NewGuid() + '.json')

try {
  $uri = Read-Host 'Plak de Session pooler-URI uit het dashboard (met [YOUR-PASSWORD] erin)'
  $uri = $uri.Trim().Replace(':[YOUR-PASSWORD]@', '@')
  $geheim = Read-Host 'Databasewachtwoord (wordt niet getoond)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($geheim)
  try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $env:KG_STAGING_DB_URL = $uri
  $env:KG_STAGING_REF = $Ref

  Write-Host "`n== 1. Alleen lezend: verbinding en lege database" -ForegroundColor Cyan
  node (Join-Path $hier 'verbinding-controle.mjs') leeg $stand
  if ($LASTEXITCODE -ne 0) { Write-Host 'Gestopt: de controle slaagde niet. Er is niets uitgevoerd.' -ForegroundColor Red; return }

  Write-Host "`n== 2. Dry-run (toont alleen welke migraties zouden worden uitgevoerd)" -ForegroundColor Cyan
  Push-Location $komtgoed
  # Ook de CLI met volledige certificaatcontrole (keten en hostnaam), met dezelfde vastgepinde Supabase-root.
  $root = (Join-Path $hier 'supabase-root-ca.crt') -replace '\\', '/'
  $cliUrl = $env:KG_STAGING_DB_URL + '?sslmode=verify-full&sslrootcert=' + $root
  try { npx --yes supabase@2.117.0 db push --db-url $cliUrl --dry-run }
  finally { Pop-Location }
  $dry = $LASTEXITCODE

  Write-Host "`n== 3. Alleen lezend: is er niets veranderd?" -ForegroundColor Cyan
  node (Join-Path $hier 'verbinding-controle.mjs') vergelijk $stand
  if ($dry -ne 0) { Write-Host "De dry-run gaf foutcode $dry." -ForegroundColor Red }
}
finally {
  Remove-Item Env:PGPASSWORD, Env:KG_STAGING_DB_URL, Env:KG_STAGING_REF -ErrorAction SilentlyContinue
  Remove-Item $stand -ErrorAction SilentlyContinue
  Remove-Variable geheim, bstr -ErrorAction SilentlyContinue
  Write-Host "`nWachtwoord en verbinding gewist uit dit venster." -ForegroundColor Green
}
