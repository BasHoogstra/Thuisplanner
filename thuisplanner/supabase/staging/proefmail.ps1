# Thuisplanner-staging, stap 3: een proefmail via Lettermint (staging/proefmail.mjs). Verstuurt ECHT een mail: alleen
# na een apart akkoord. docs/thuisplanner-staging-overstap.md, stap 3.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\thuisplanner\supabase\staging\proefmail.ps1 [-Route <naam>]
#
# - Het ontvangstadres en het API-token van Lettermint typ of plak je bij een verborgen prompt. Ze komen niet op het
#   scherm, niet in de terminalgeschiedenis (Read-Host wordt niet opgeslagen), niet in een bestand en niet in de
#   repository. Ze staan alleen tijdens dit script in de omgeving van dit proces, en worden aan het eind gewist, ook bij
#   een fout.
# - Vóór het versturen vraagt het script een getypte bevestiging. Het verstuurt één mail en doet daarna hetzelfde
#   verzoek nog eens met dezelfde Idempotency-Key: dat hoort geen tweede mail te geven.
# - De route (-Route) is geen geheim; zonder -Route gebruikt Lettermint de standaardroute van het project.
param([ValidateSet('staging')][string]$Omgeving = 'staging', [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,62}$')][string]$Route)
$ErrorActionPreference = 'Stop'
$hier = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:uitkomst = 0

function Lees-Verborgen([string]$vraag) {
  $geheim = Read-Host $vraag -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($geheim)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

try {
  # Alleen de echte API: een LETTERMINT_API_URL uit de omgeving van de gebruiker telt hier niet mee.
  Remove-Item Env:LETTERMINT_API_URL, Env:PROEF_PAUZE_MS -ErrorAction SilentlyContinue
  $env:PROEF_AAN = (Lees-Verborgen 'Ontvangstadres voor de proefmail (wordt niet getoond)').Trim()
  $env:LETTERMINT_TOKEN = (Lees-Verborgen 'API-token van Lettermint (wordt niet getoond)').Trim()
  if (-not $env:PROEF_AAN -or -not $env:LETTERMINT_TOKEN) { throw 'adres of token ontbreekt; er is niets verstuurd' }
  if ($Route) { $env:LETTERMINT_ROUTE = $Route } else { Remove-Item Env:LETTERMINT_ROUTE -ErrorAction SilentlyContinue }
  $ok = Read-Host "Typ precies 'verstuur proefmail' om een echte mail te versturen (iets anders stopt)"
  if ($ok -cne 'verstuur proefmail') { throw 'geen bevestiging gegeven; er is niets verstuurd' }
  node --experimental-strip-types (Join-Path $hier 'proefmail.mjs')
  $script:uitkomst = $LASTEXITCODE
}
catch {
  Write-Host ('GESTOPT: ' + $_) -ForegroundColor Red
  $script:uitkomst = 2
}
finally {
  Remove-Item Env:LETTERMINT_TOKEN, Env:PROEF_AAN, Env:LETTERMINT_ROUTE -ErrorAction SilentlyContinue
  Write-Host "`nToken en adres gewist uit dit proces." -ForegroundColor Green
}
exit $script:uitkomst
