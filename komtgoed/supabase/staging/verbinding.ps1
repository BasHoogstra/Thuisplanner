# Thuisplanner-staging: tijdelijke, veilige verbinding; alleen lezende controle met dry-run, of (met -Push) de echte push.
# docs/thuisplanner-staging.md, stap 3.
#
#   controle en dry-run:  powershell -NoProfile -ExecutionPolicy Bypass -File .\komtgoed\supabase\staging\verbinding.ps1 -Ref <kenmerk>
#   echte push:           ... -Ref <kenmerk> -Push   (alleen na een apart akkoord; vraagt nog een bevestiging)
#
# - De session-pooler-URI plak je met de tekst [YOUR-PASSWORD] erin: daar staat geen geheim in.
# - Het wachtwoord typ je bij een verborgen prompt. Het komt niet in de terminalgeschiedenis (Read-Host wordt niet
#   opgeslagen), niet op het scherm, niet in een bestand en niet in de repository. Het staat alleen tijdens dit script
#   in PGPASSWORD van dit proces, en wordt aan het eind gewist, ook bij een fout.
# - TLS: altijd met certificaatcontrole (keten en hostnaam), met als enige vertrouwensanker de Supabase-root uit
#   supabase-root-ca.crt (vastgepinde vingerafdrukken). De CLI krijgt dezelfde root (sslmode=verify-full).
# - Volgorde: verbinding controleren (vóór verbinden) -> alleen lezend: is dit het lege stagingproject? ->
#   dry-run, of met -Push: repository-controle, bevestiging en db push -> alleen lezend: nacontrole.
# - Bij een fout stopt het script meteen. Het voert nooit zelf een herstel of tweede poging uit.
param([Parameter(Mandatory = $true)][string]$Ref, [switch]$Push)
$ErrorActionPreference = 'Stop'
$hier = Split-Path -Parent $MyInvocation.MyCommand.Path
$komtgoed = (Resolve-Path (Join-Path $hier '..\..')).Path
$controle = Join-Path $hier 'verbinding-controle.mjs'
$stand = Join-Path ([IO.Path]::GetTempPath()) ('thuisplanner-stand-' + [guid]::NewGuid() + '.json')

function Stop-Hier([string]$reden) {
  Write-Host "GESTOPT: $reden" -ForegroundColor Red
  Write-Host 'Er is geen herstel of tweede poging uitgevoerd. Eerst overleggen.' -ForegroundColor Red
  $script:uitkomst = 1
  throw 'thuisplanner-gestopt'
}
$script:uitkomst = 0

try {
  if ($Push) {
    # De migraties moeten precies de gecommitte, gecontroleerde zijn.
    Write-Host "`n== 0. Repository: migraties gecommit en ongewijzigd" -ForegroundColor Cyan
    $migraties = @(Get-ChildItem (Join-Path $komtgoed 'supabase\migrations') -Filter '*.sql' | Sort-Object Name)
    $migraties | ForEach-Object { Write-Host ('  ' + $_.Name) }
    if ($migraties.Count -ne 11) { Stop-Hier "er staan $($migraties.Count) migraties in de repository in plaats van 11." }
    $vuil = git -C $komtgoed status --porcelain -- supabase/migrations
    if ($vuil) { Stop-Hier "niet-gecommitte wijzigingen in supabase/migrations: $vuil" }
    Write-Host ('  commit ' + (git -C $komtgoed rev-parse --short HEAD) + ', branch ' + (git -C $komtgoed rev-parse --abbrev-ref HEAD))
  }

  $uri = Read-Host 'Plak de Session pooler-URI uit het dashboard (met [YOUR-PASSWORD] erin)'
  $uri = $uri.Trim().Replace(':[YOUR-PASSWORD]@', '@')
  $geheim = Read-Host 'Databasewachtwoord (wordt niet getoond)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($geheim)
  try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $env:KG_STAGING_DB_URL = $uri
  $env:KG_STAGING_REF = $Ref
  $root = (Join-Path $hier 'supabase-root-ca.crt') -replace '\\', '/'
  $cliUrl = $env:KG_STAGING_DB_URL + '?sslmode=verify-full&sslrootcert=' + $root

  Write-Host "`n== 1. Alleen lezend: verbinding en lege database" -ForegroundColor Cyan
  node $controle leeg $stand
  if ($LASTEXITCODE -ne 0) { Stop-Hier 'de controle vooraf slaagde niet. Er is niets uitgevoerd.' }

  if (-not $Push) {
    Write-Host "`n== 2. Dry-run (toont alleen welke migraties zouden worden uitgevoerd)" -ForegroundColor Cyan
    Push-Location $komtgoed
    try { npx --yes supabase@2.117.0 db push --db-url $cliUrl --dry-run; $dry = $LASTEXITCODE }
    finally { Pop-Location }
    Write-Host "`n== 3. Alleen lezend: is er niets veranderd?" -ForegroundColor Cyan
    node $controle vergelijk $stand
    if ($LASTEXITCODE -ne 0) { Stop-Hier 'de stand is veranderd tijdens de dry-run.' }
    if ($dry -ne 0) { Stop-Hier "de dry-run gaf foutcode $dry." }
    return
  }

  Write-Host "`n== 2. Echte push naar $Ref" -ForegroundColor Yellow
  $ok = Read-Host "Typ precies 'push $Ref' om de 11 migraties uit te voeren (iets anders stopt)"
  if ($ok -cne "push $Ref") { Stop-Hier 'geen bevestiging gegeven. Er is niets uitgevoerd.' }
  Push-Location $komtgoed
  try { npx --yes supabase@2.117.0 db push --db-url $cliUrl; $pushCode = $LASTEXITCODE }
  finally { Pop-Location }

  Write-Host "`n== 3. Alleen lezend: nacontrole (migraties, RLS, rechten, Realtime, geplande taak)" -ForegroundColor Cyan
  node $controle na
  $naCode = $LASTEXITCODE
  if ($pushCode -ne 0) { Stop-Hier "db push gaf foutcode $pushCode. De nacontrole hierboven toont de stand." }
  if ($naCode -ne 0) { Stop-Hier 'de nacontrole vond een afwijking (zie hierboven).' }
  Write-Host "`nPush en nacontrole geslaagd." -ForegroundColor Green
}
catch {
  if ("$_" -ne 'thuisplanner-gestopt') { Write-Host ('FOUT: ' + $_) -ForegroundColor Red; $script:uitkomst = 1 }
}
finally {
  Remove-Item Env:PGPASSWORD, Env:KG_STAGING_DB_URL, Env:KG_STAGING_REF -ErrorAction SilentlyContinue
  Remove-Item $stand -ErrorAction SilentlyContinue
  Remove-Variable geheim, bstr -ErrorAction SilentlyContinue
  Write-Host "`nWachtwoord en verbinding gewist uit dit proces." -ForegroundColor Green
}
exit $script:uitkomst
