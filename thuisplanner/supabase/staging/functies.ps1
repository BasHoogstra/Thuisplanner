# Thuisplanner-staging, stap 5: de vier Edge Functions naar het vastgelegde stagingproject. Verandert iets ONLINE: alleen
# na een apart akkoord. docs/thuisplanner-staging-overstap.md, stap 5.
#
#   controle (lokaal, niets online):  powershell -NoProfile -ExecutionPolicy Bypass -File .\thuisplanner\supabase\staging\functies.ps1 -Ref <kenmerk>
#   deployen:                         ... -Ref <kenmerk> -Deploy   (vraagt het token en een getypte bevestiging)
#
# - De Supabase CLI op deze computer blijft ingelogd op het Huisplan-account; die inlog wordt NIET gebruikt. Het
#   persoonlijke token van het Thuisplanner-account typ of plak je bij een verborgen prompt. Het staat alleen tijdens dit
#   script in SUPABASE_ACCESS_TOKEN van dit proces (dat gaat voor de inlog van de CLI), en wordt aan het eind gewist, ook
#   bij een fout. Trek het token na afloop in (Supabase: Account -> Access Tokens).
# - Altijd met --project-ref (nooit `supabase link`), en het kenmerk moet precies het vastgelegde stagingproject uit
#   thuisplanner/omgevingen.json zijn; een Huisplan-project wordt geweigerd. Alles in functions/ en config.toml moet
#   gecommit zijn. Bundelen gebeurt bij Supabase (--use-api), zonder Docker.
# - Na het deployen leest het script de functielijst terug (alleen lezen) en controleert: precies de vier functies,
#   actief, verify_jwt uit. Bij een fout stopt het meteen; het herstelt niets zelf en doet geen tweede poging.
# - Geheimen (stap 6) zet dit script NIET: die zet de producteigenaar zelf in het dashboard.
param([Parameter(Mandatory = $true)][string]$Ref, [ValidateSet('staging')][string]$Omgeving = 'staging', [switch]$Deploy)
$ErrorActionPreference = 'Stop'
$hier = Split-Path -Parent $MyInvocation.MyCommand.Path
$kg = (Resolve-Path (Join-Path $hier '..')).Path
$controle = Join-Path $hier 'functies.mjs'
$cli = 'supabase@2.117.0'
$functies = @('controleer-code', 'mail-bezorging', 'stuur-code', 'stuur-uitnodiging')
$script:uitkomst = 0

function Stop-Hier([string]$reden) {
  Write-Host "GESTOPT: $reden" -ForegroundColor Red
  Write-Host 'Er is geen herstel of tweede poging uitgevoerd. Eerst overleggen.' -ForegroundColor Red
  $script:uitkomst = 1
  throw 'thuisplanner-gestopt'
}

try {
  Write-Host "`n== 1. Lokaal: project, functies, configuratie en git" -ForegroundColor Cyan
  node $controle vooraf $Ref $Omgeving
  if ($LASTEXITCODE -ne 0) { Stop-Hier 'de controle vooraf slaagde niet. Er is niets online gedaan.' }
  if (-not $Deploy) {
    Write-Host "`nAlleen gecontroleerd (zonder -Deploy). Er is niets online gedaan." -ForegroundColor Green
    return
  }

  $geheim = Read-Host 'Persoonlijk token van het Thuisplanner-account (wordt niet getoond)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($geheim)
  try { $env:SUPABASE_ACCESS_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if (-not $env:SUPABASE_ACCESS_TOKEN) { Stop-Hier 'geen token. Er is niets online gedaan.' }
  # Alleen de vorm van een persoonlijk Supabase-token (sbp_ en 40 tekens). Iets anders (bijvoorbeeld een token van een
  # andere dienst) stopt hier al, zonder te tonen wat er is ingevoerd en voordat er iets naar buiten gaat.
  if ($env:SUPABASE_ACCESS_TOKEN -cnotmatch '^sbp_[0-9a-f]{40}$') {
    Stop-Hier ('dit is geen persoonlijk Supabase-token (verwacht: sbp_ en 40 tekens; ingevoerd: ' + $env:SUPABASE_ACCESS_TOKEN.Length + ' tekens). Er is niets online gedaan. Plak het token bij de verborgen vraag, niet daarna in PowerShell.')
  }

  $ok = Read-Host "Typ precies 'deploy $Omgeving $Ref' om de vier functies te deployen (iets anders stopt)"
  if ($ok -cne "deploy $Omgeving $Ref") { Stop-Hier 'geen bevestiging gegeven. Er is niets online gedaan.' }

  Write-Host "`n== 2. Deployen naar $Omgeving ($Ref)" -ForegroundColor Yellow
  Push-Location (Split-Path -Parent $kg)
  try {
    npx --yes $cli functions deploy @functies --project-ref $Ref --no-verify-jwt --use-api
    $deployCode = $LASTEXITCODE
  } finally { Pop-Location }

  Write-Host "`n== 3. Alleen lezend: de functielijst van het project" -ForegroundColor Cyan
  Push-Location (Split-Path -Parent $kg)
  try {
    $lijst = npx --yes $cli functions list --project-ref $Ref -o json
    $lijstCode = $LASTEXITCODE
  } finally { Pop-Location }
  if ($lijstCode -ne 0) { Stop-Hier "de functielijst was niet te lezen (foutcode $lijstCode)." }
  ($lijst -join "`n") | node $controle na $Ref $Omgeving
  $naCode = $LASTEXITCODE
  if ($deployCode -ne 0) { Stop-Hier "functions deploy gaf foutcode $deployCode. De lijst hierboven toont de stand." }
  if ($naCode -ne 0) { Stop-Hier 'de controle na het deployen vond een afwijking (zie hierboven).' }
  Write-Host "`nDeployen en controle geslaagd. Trek het token nu in (Supabase: Account -> Access Tokens)." -ForegroundColor Green
}
catch {
  if ("$_" -ne 'thuisplanner-gestopt') { Write-Host ('FOUT: ' + $_) -ForegroundColor Red; $script:uitkomst = 1 }
}
finally {
  Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  Remove-Variable geheim, bstr -ErrorAction SilentlyContinue
  Write-Host "`nToken gewist uit dit proces." -ForegroundColor Green
}
exit $script:uitkomst
