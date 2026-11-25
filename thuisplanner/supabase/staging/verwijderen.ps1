# Thuisplanner: verwijderen op verzoek (A9, docs/thuisplanner-beta-voorbereiding.md §5.4). Alleen voor de beheerder,
# vanaf deze computer; nooit in de app. Het werk zelf doet verwijderen.mjs: overzicht (alleen lezend) -> getypte
# bevestiging -> verwijderen in één transactie en de bestanden opruimen -> controle dat er niets meer is.
#
#   (a) heel huishouden, op verzoek van de eigenaar:
#       powershell -NoProfile -ExecutionPolicy Bypass -File .\thuisplanner\supabase\staging\verwijderen.ps1 -Ref <kenmerk> -Omgeving beta -Soort huishouden -Adres <adres eigenaar> [-Huishouden <id>] [-Ook <adres partner>]
#       -Ook alleen als de partner zelf ook om verwijdering van het eigen account vraagt (anders blijft dat account).
#   (b) alleen het eigen account:
#       ... -Ref <kenmerk> -Omgeving beta -Soort account -Adres <adres>
#
# Eerst controleren: het verzoek komt van het adres van het account zelf, en is per mail bevestigd (§5.4, identiteit).
#
# - De session-pooler-URI plak je met [YOUR-PASSWORD] erin: daar staat geen geheim in.
# - Het databasewachtwoord en de pepper (het geheim K1_PEPPER van dit project, uit de wachtwoordmanager) typ je bij een
#   verborgen prompt. Ze komen niet in de terminalgeschiedenis, niet op het scherm, niet in een bestand en niet in de
#   repository; ze staan alleen tijdens dit script in de omgeving van dit proces, en worden aan het eind gewist, ook bij
#   een fout. De pepper is nodig voor de hash van het adres (codes en tellers van de grenzen); hij gaat nergens heen.
# - Het overzicht toont adressen en namen: alleen op dit scherm, niet kopiëren naar een register of mail. De laatste
#   regel ("Register ...") is zonder persoonsgegevens en hoort in het register.
# - Bij een fout stopt het script. Het voert nooit zelf een herstel of tweede poging uit.
param(
  [Parameter(Mandatory = $true)][string]$Ref,
  [ValidateSet('staging', 'beta', 'productie')][string]$Omgeving = 'beta',
  [Parameter(Mandatory = $true)][ValidateSet('huishouden', 'account')][string]$Soort,
  [Parameter(Mandatory = $true)][string]$Adres,
  [string]$Huishouden,
  [string[]]$Ook = @()
)
$ErrorActionPreference = 'Stop'
$hier = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:uitkomst = 1
try {
  $uri = Read-Host 'Plak de Session pooler-URI uit het dashboard (met [YOUR-PASSWORD] erin)'
  $uri = $uri.Trim().Replace(':[YOUR-PASSWORD]@', '@')
  $geheim = Read-Host 'Databasewachtwoord (wordt niet getoond)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($geheim)
  try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $peper = Read-Host 'K1_PEPPER van dit project (wordt niet getoond)' -AsSecureString
  $bs = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($peper)
  try { $env:KG_PEPPER = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bs) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bs) }
  $env:KG_DB_URL = $uri
  $env:KG_REF = $Ref
  # Welke omgeving (thuisplanner/omgevingen.json): een kenmerk van een andere omgeving wordt geweigerd.
  $env:KG_OMGEVING = $Omgeving

  $argumenten = @((Join-Path $hier 'verwijderen.mjs'), '--soort', $Soort, '--adres', $Adres)
  if ($Huishouden) { $argumenten += @('--huishouden', $Huishouden) }
  foreach ($a in $Ook) { $argumenten += @('--ook', $a) }
  # De getypte bevestiging vraagt verwijderen.mjs zelf, na het overzicht.
  node @argumenten
  $script:uitkomst = $LASTEXITCODE
  switch ($script:uitkomst) {
    0 { Write-Host "`nVerwijderd en gecontroleerd: niets meer aanwezig." -ForegroundColor Green }
    3 { Write-Host "`nGeweigerd of niet bevestigd: er is niets verwijderd." -ForegroundColor Yellow }
    2 { Write-Host "`nGeweigerd voor het verbinden: er is niets gedaan." -ForegroundColor Yellow }
    default { Write-Host "`nFOUT of AFWIJKING (zie hierboven). Er is geen herstel of tweede poging uitgevoerd. Eerst overleggen." -ForegroundColor Red }
  }
}
catch {
  Write-Host ('FOUT: ' + $_) -ForegroundColor Red
  $script:uitkomst = 1
}
finally {
  Remove-Item Env:PGPASSWORD, Env:KG_PEPPER, Env:KG_DB_URL, Env:KG_REF, Env:KG_OMGEVING -ErrorAction SilentlyContinue
  Remove-Variable geheim, bstr, peper, bs -ErrorAction SilentlyContinue
  Write-Host "`nWachtwoord, pepper en verbinding gewist uit dit proces." -ForegroundColor Green
}
exit $script:uitkomst
