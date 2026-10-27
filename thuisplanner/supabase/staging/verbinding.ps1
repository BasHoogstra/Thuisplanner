# Thuisplanner-staging: tijdelijke, veilige verbinding; alleen lezende controle met dry-run, of (met -Push) de echte push.
# docs/thuisplanner-staging.md, stap 3.
#
#   controle en dry-run:  powershell -NoProfile -ExecutionPolicy Bypass -File .\thuisplanner\supabase\staging\verbinding.ps1 -Ref <kenmerk>
#   echte push:           ... -Ref <kenmerk> -Push   (alleen na een apart akkoord; vraagt nog een bevestiging)
#   bijwerken:            ... -Ref <kenmerk> -Bijwerken [-Push]   voor een project waarop eerdere migraties al staan:
#                         alleen als de geschiedenis precies het begin van de repository is, met nieuwe migraties erna
#   export (alleen lezend): ... -Ref <kenmerk> -Export -ExportMap <lege map buiten de repository>
#                         alle gegevens in één momentopname naar JSON, met manifest en controlesommen (export.mjs);
#                         de map bevat daarna persoonsgegevens: bewaar hem alleen lokaal en verwijder hem na gebruik
#   -VoorStap6 (bij -Push): de twee Vault-waarden mogen in de nacontrole nog ontbreken (die zet de producteigenaar in
#                         stap 6f); ze worden dan als "verwacht" getoond. Al het andere blijft een afwijking.
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
param([Parameter(Mandatory = $true)][string]$Ref, [ValidateSet('staging', 'beta', 'productie')][string]$Omgeving = 'staging', [switch]$Push, [switch]$Bijwerken, [switch]$Export, [string]$ExportMap, [switch]$VoorStap6)
$ErrorActionPreference = 'Stop'
# Het aantal migraties in de repository dat deze versie van het script verwacht (bij elke nieuwe migratie bijwerken).
$VerwachtAantal = 19
$hier = Split-Path -Parent $MyInvocation.MyCommand.Path
$thuisplanner = (Resolve-Path (Join-Path $hier '..\..')).Path
$controle = Join-Path $hier 'verbinding-controle.mjs'
$stand = Join-Path ([IO.Path]::GetTempPath()) ('thuisplanner-stand-' + [guid]::NewGuid() + '.json')

function Stop-Hier([string]$reden) {
  Write-Host "GESTOPT: $reden" -ForegroundColor Red
  Write-Host 'Er is geen herstel of tweede poging uitgevoerd. Eerst overleggen.' -ForegroundColor Red
  $script:uitkomst = 1
  throw 'thuisplanner-gestopt'
}
$script:uitkomst = 0

# De CLI leest bij elke opdracht de lokale config.toml, en controleert daarin ook het geheim van de mail-hook
# (env(K1_HOOK_SECRET), lokaal uit de genegeerde supabase/.env). Zonder dat bestand (bijv. in een andere werkmap)
# weigert hij vóór hij verbindt. db push --db-url praat alleen SQL met de database en raakt de Auth-instellingen van een
# online project nooit; de lokale waarde wordt dus nergens heen gestuurd. Alleen als er geen waarde is: een willekeurige,
# eenmalige waarde in het juiste formaat, alleen in dit proces en aan het eind gewist. Een bestaande waarde blijft staan.
function Zet-TijdelijkHookGeheim {
  if ($env:K1_HOOK_SECRET) { return $false }
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $env:K1_HOOK_SECRET = 'v1,whsec_' + [Convert]::ToBase64String($bytes)
  return $true
}
$script:tijdelijkHookGeheim = $false

try {
  if ($Export) {
    # Alleen lezend en los van push of bijwerken; de map wordt gecontroleerd vóór het wachtwoord wordt gevraagd.
    if ($Push -or $Bijwerken) { Stop-Hier '-Export gaat niet samen met -Push of -Bijwerken.' }
    Write-Host "`n== 0. Exportmap (buiten de repository, leeg)" -ForegroundColor Cyan
    node (Join-Path $hier 'export.mjs') mapcontrole $ExportMap
    if ($LASTEXITCODE -ne 0) { Stop-Hier 'de exportmap is niet geschikt. Er is niets uitgevoerd.' }
  }
  if ($Push) {
    # De migraties moeten precies de gecommitte, gecontroleerde zijn.
    Write-Host "`n== 0. Repository: migraties gecommit en ongewijzigd" -ForegroundColor Cyan
    $migraties = @(Get-ChildItem (Join-Path $thuisplanner 'supabase\migrations') -Filter '*.sql' | Sort-Object Name)
    $migraties | ForEach-Object { Write-Host ('  ' + $_.Name) }
    if ($migraties.Count -ne $VerwachtAantal) { Stop-Hier "er staan $($migraties.Count) migraties in de repository in plaats van $VerwachtAantal." }
    $vuil = git -C $thuisplanner status --porcelain -- supabase/migrations
    if ($vuil) { Stop-Hier "niet-gecommitte wijzigingen in supabase/migrations: $vuil" }
    Write-Host ('  commit ' + (git -C $thuisplanner rev-parse --short HEAD) + ', branch ' + (git -C $thuisplanner rev-parse --abbrev-ref HEAD))
  }

  $uri = Read-Host 'Plak de Session pooler-URI uit het dashboard (met [YOUR-PASSWORD] erin)'
  $uri = $uri.Trim().Replace(':[YOUR-PASSWORD]@', '@')
  $geheim = Read-Host 'Databasewachtwoord (wordt niet getoond)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($geheim)
  try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $env:KG_DB_URL = $uri
  $env:KG_REF = $Ref
  # Welke omgeving (thuisplanner/omgevingen.json): een kenmerk van een andere omgeving wordt geweigerd.
  $env:KG_OMGEVING = $Omgeving
  $root = (Join-Path $hier 'supabase-root-ca.crt') -replace '\\', '/'
  $cliUrl = $env:KG_DB_URL + '?sslmode=verify-full&sslrootcert=' + $root

  if ($Export) {
    Write-Host "`n== 1. Alleen lezend: verbinding, export in een momentopname, en controle van de geschreven bestanden" -ForegroundColor Cyan
    node $controle export $ExportMap
    if ($LASTEXITCODE -ne 0) { Stop-Hier 'de export slaagde niet (zie hierboven). Er is online niets gewijzigd.' }
    Write-Host "`nExport geslaagd. Er is online niets gewijzigd." -ForegroundColor Green
    return
  }
  if ($Bijwerken) {
    Write-Host "`n== 1. Alleen lezend: verbinding, bestaande Thuisplanner-database en welke migraties nieuw zijn" -ForegroundColor Cyan
    node $controle bijwerken $stand
  } else {
    Write-Host "`n== 1. Alleen lezend: verbinding en lege database" -ForegroundColor Cyan
    node $controle leeg $stand
  }
  if ($LASTEXITCODE -ne 0) { Stop-Hier 'de controle vooraf slaagde niet. Er is niets uitgevoerd.' }

  # Voor de CLI (dry-run en push): zie Zet-TijdelijkHookGeheim hierboven.
  $script:tijdelijkHookGeheim = Zet-TijdelijkHookGeheim

  if (-not $Push) {
    Write-Host "`n== 2. Dry-run (toont alleen welke migraties zouden worden uitgevoerd)" -ForegroundColor Cyan
    Push-Location $thuisplanner
    try { npx --yes supabase@2.117.0 db push --db-url $cliUrl --dry-run; $dry = $LASTEXITCODE }
    finally { Pop-Location }
    Write-Host "`n== 3. Alleen lezend: is er niets veranderd?" -ForegroundColor Cyan
    node $controle vergelijk $stand
    if ($LASTEXITCODE -ne 0) { Stop-Hier 'de stand is veranderd tijdens de dry-run.' }
    if ($dry -ne 0) { Stop-Hier "de dry-run gaf foutcode $dry." }
    return
  }

  Write-Host "`n== 2. Echte push naar $Omgeving ($Ref)" -ForegroundColor Yellow
  if ($Bijwerken) {
    # Vlak voor de push nog eens: is er sinds stap 1 niets veranderd?
    node $controle vergelijk $stand
    if ($LASTEXITCODE -ne 0) { Stop-Hier 'de stand is veranderd sinds de controle vooraf. Er is niets uitgevoerd.' }
    $ok = Read-Host "Typ precies 'push $Omgeving $Ref' om alleen de nieuwe migraties uit stap 1 uit te voeren (iets anders stopt)"
  } else {
    $ok = Read-Host "Typ precies 'push $Omgeving $Ref' om de $VerwachtAantal migraties uit te voeren (iets anders stopt)"
  }
  if ($ok -cne "push $Omgeving $Ref") { Stop-Hier 'geen bevestiging gegeven. Er is niets uitgevoerd.' }
  Push-Location $thuisplanner
  try { npx --yes supabase@2.117.0 db push --db-url $cliUrl; $pushCode = $LASTEXITCODE }
  finally { Pop-Location }

  Write-Host "`n== 3. Alleen lezend: nacontrole (migraties, RLS, rechten, Realtime, geplande taak)" -ForegroundColor Cyan
  if ($VoorStap6) { $env:KG_NA_TOT_STAP6 = '1' }
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
  Remove-Item Env:PGPASSWORD, Env:KG_DB_URL, Env:KG_REF, Env:KG_OMGEVING, Env:KG_NA_TOT_STAP6 -ErrorAction SilentlyContinue
  # Alleen de eigen, eenmalige hookwaarde wissen; een waarde die er al was, blijft staan.
  if ($script:tijdelijkHookGeheim) { Remove-Item Env:K1_HOOK_SECRET -ErrorAction SilentlyContinue }
  Remove-Item $stand -ErrorAction SilentlyContinue
  Remove-Variable geheim, bstr -ErrorAction SilentlyContinue
  Write-Host "`nWachtwoord en verbinding gewist uit dit proces." -ForegroundColor Green
}
exit $script:uitkomst
